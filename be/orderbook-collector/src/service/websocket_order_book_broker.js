"use strict";

/**
 * 국내 4대 거래소(업비트/빗썸/코빗/코인원)
 * - depth: 15
 * - 목표수량 Q 실행평단(매수/매도, mid)을 스냅샷마다 계산
 * - 시간가중(TW): 직전 실행평단 × Δt(ms) 누적 → 1초마다 ∑(price×Δt)/∑Δt 출력
 * - 호가 역전(베스트 매수 > 베스트 매도) 발생 구간은 완전히 제외
 * - 개별 거래소 + 집계(합산 북) 모두 동일 규칙 적용
 */

const WebSocket = require("ws");
const { execAvgBuyFromAsk, execAvgSellFromBid } = require("../utils/vwap_exec.js");
const { MARKET_NO_ENUM, MARKET_NAME_ENUM, RECONNECT_INTERVAL, PING_INTERVAL, isJsonValue } = require("../utils/common.js");
const { send_push } = require("../utils/zmq-sender-push.js");
const { send_publisher } = require("../utils/zmq-sender-pub.js");
const  { sendTelegramMessage, sendTelegramMessageQueue } = require('../utils/telegram_push.js')
const { generateQueueReport } = require('../utils/report.js')
const logger = require('../utils/logger.js');
const { db } = require('../db/db.js');

// ===== 설정 =====
const DEPTH    = 15;
const TICK_MS  = Number(process.env.TICK_MS || 1000);
const TARGET_Q = Number(process.env.TARGET_Q || 0.5); // 예: 0.5 BTC

// 큐 설정 (2 vCPU 환경 최적화)
// - 4개 거래소 클라이언트가 동시에 처리하므로 CPU 부하 분산 고려
// - 배치 크기: CPU 코어당 적절한 처리량 유지 (2 vCPU 기준)
// - 처리 간격: 클라이언트 간 경합 최소화
const QUEUE_MAX_SIZE = Number(process.env.WS_QUEUE_MAX_SIZE || 5000); // 큐 최대 크기
const QUEUE_PROCESS_INTERVAL = Number(process.env.WS_QUEUE_PROCESS_INTERVAL || 20); // 큐 처리 간격 (ms) - 2 vCPU에 맞게 조정
const QUEUE_BATCH_SIZE = Number(process.env.WS_QUEUE_BATCH_SIZE || 50); // 배치 처리 크기 - 2 vCPU에 맞게 조정
const QUEUE_MONITOR_INTERVAL = Number(process.env.WS_QUEUE_MONITOR_INTERVAL || 30000); // 모니터링 간격 (ms, 기본 30초)

// CPU 코어 수 기반 동적 조정 (2 vCPU 환경 최적화)
const CPU_CORES = Number(process.env.CPU_CORES || require('os').cpus().length);
// 배치 크기: 2 vCPU 기준으로 조정 (4개 클라이언트가 동시 처리하므로 코어당 적절한 크기)
const OPTIMAL_BATCH_SIZE = Math.max(10, Math.min(QUEUE_BATCH_SIZE, Math.floor(CPU_CORES * 25)));
// 처리 간격: 2 vCPU 기준으로 조정 (클라이언트 간 경합 최소화)
const OPTIMAL_PROCESS_INTERVAL = Math.max(10, Math.floor(QUEUE_PROCESS_INTERVAL * (2 / Math.max(1, CPU_CORES))));

// 시작 시 최적화 설정 로깅 (initializeClients에서 호출)
function logQueueConfiguration() {

  const config = {
    cpuCores: CPU_CORES,
    queueMaxSize: QUEUE_MAX_SIZE,
    queueBatchSize: QUEUE_BATCH_SIZE,
    optimalBatchSize: OPTIMAL_BATCH_SIZE,
    queueProcessInterval: QUEUE_PROCESS_INTERVAL,
    optimalProcessInterval: OPTIMAL_PROCESS_INTERVAL,
    queueMonitorInterval: QUEUE_MONITOR_INTERVAL
  };

  logger.info(
    "CPU코어에 최적화된 큐 배치 사이즈 설정\n" +
    JSON.stringify(config, null, 2)
  );
}

// ===== 유틸 =====
const toNum = (x) => (typeof x === "string" ? Number(x) : x);

/** 표준화: bids 내림차순, asks 오름차순, 상위 DEPTH */
function normalize(bids, asks) {
  const nb = bids
    .map(([p, q]) => ({ price: toNum(p), qty: toNum(q) }))
    .filter(x => x.qty > 0)
    .sort((a, b) => b.price - a.price)
    .slice(0, DEPTH);

  const na = asks
    .map(([p, q]) => ({ price: toNum(p), qty: toNum(q) }))
    .filter(x => x.qty > 0)
    .sort((a, b) => a.price - b.price)
    .slice(0, DEPTH);

  return { bids: nb, asks: na };
}

/** 역전(매수호가 > 매도호가) 여부 */
function isCrossed(book) {
  if (!book || !book.bids?.length || !book.asks?.length) return true;
  return book.bids[0].price > book.asks[0].price; // 필요시 >= 로 변경
}

/** 현재 북 → 목표수량 Q 실행평단(매수/매도) 및 mid */
function instantExecFromBook(book) {
  const buy  = execAvgBuyFromAsk(book.asks, TARGET_Q, DEPTH);
  const sell = execAvgSellFromBid(book.bids, TARGET_Q, DEPTH);
  if (buy == null || sell == null) return { buy: null, sell: null, mid: null };
  return { buy, sell, mid: (buy + sell) / 2 };
}

/** 합산 북(여러 거래소) 생성: 역전 거래소는 제외 */
function mergeBooks(latest) {
  const asks = [], bids = [];
  for (const ex of Object.keys(latest)) {
    const b = latest[ex];
    if (!b || isCrossed(b)) continue; // 역전 제외
    if (b.asks?.length) asks.push(...b.asks);
    if (b.bids?.length) bids.push(...b.bids);
  }
  asks.sort((a, b) => a.price - b.price);
  bids.sort((a, b) => b.price - a.price);
  return { asks: asks.slice(0, DEPTH), bids: bids.slice(0, DEPTH) };
}

/** ------------------- 시간가중 누적 구조 ------------------- */
/**
 * acc:
 * {
 *   lastTs: ms|null,
 *   last: { buy:number|null, sell:number|null, mid:number|null },
 *   sum:  { buyDt:number,    sellDt:number,    midDt:number,    dt:number }
 * }
 */
function makeAcc() {
  return {
    lastTs: null,
    last: { buy: null, sell: null, mid: null },
    sum:  { buyDt: 0,  sellDt: 0,  midDt: 0,    dt: 0 }
  };
}

/** Δt 가중 누적: 직전 last 값들을 Δt로 가중하여 sum에 더함 */
function accumulate(acc, nowMs) {
  if (acc.lastTs !== null && acc.last.buy !== null && acc.last.sell !== null && acc.last.mid !== null) {
    const dt = Math.max(1, nowMs - acc.lastTs);
    acc.sum.buyDt  += acc.last.buy  * dt;
    acc.sum.sellDt += acc.last.sell * dt;
    acc.sum.midDt  += acc.last.mid  * dt;
    acc.sum.dt     += dt;
  }
  acc.lastTs = nowMs;
}

/** 현재 즉시값을 last에 반영 */
function setLast(acc, instant) {
  acc.last.buy  = instant.buy;
  acc.last.sell = instant.sell;
  acc.last.mid  = instant.mid;
}

/** 역전 제외를 위해 last를 비움(이후 Δt 누적이 안 됨) */
function clearLast(acc) {
  acc.last.buy = acc.last.sell = acc.last.mid = null;
}

/** 윈도우 종료 시 TW 실행평단 산출 */
function reportTW(acc) {
  if (acc.sum.dt <= 0) return null;
  return {
    buy:  acc.sum.buyDt  / acc.sum.dt,
    sell: acc.sum.sellDt / acc.sum.dt,
    mid:  acc.sum.midDt  / acc.sum.dt,
  };
}

/** 누적만 리셋(상태는 유지) */
function resetSums(acc) {
  acc.sum.buyDt = acc.sum.sellDt = acc.sum.midDt = acc.sum.dt = 0;
}

/** ------------------- 전역 상태 ------------------- */

// 최신 스냅샷 (집계용)
const latestBook = {
  [MARKET_NO_ENUM.UPBIT]:   null,
  [MARKET_NO_ENUM.BITHUMB]: null,
  [MARKET_NO_ENUM.KORBIT]:  null,
  [MARKET_NO_ENUM.COINONE]: null,
};

// 개별 거래소 TW 누적기
const exchAcc = {
  [MARKET_NO_ENUM.UPBIT]:   makeAcc(),
  [MARKET_NO_ENUM.BITHUMB]: makeAcc(),
  [MARKET_NO_ENUM.KORBIT]:  makeAcc(),
  [MARKET_NO_ENUM.COINONE]: makeAcc(),
};

// 집계 TW 누적기
const aggAcc = makeAcc();

/** 스냅샷 처리: 역전 제외 로직 포함(개별/집계) */
function onSnapshot(exchangeNo, bookStd) {
  const now = Date.now();

  // ===== 1) 개별 거래소 =====
  {
    const acc = exchAcc[exchangeNo];

    if (isCrossed(bookStd)) {
      // 역전 구간 완전 제외: Δt 누적 안 하고, 기준시각만 이동 + last 비우기
      acc.lastTs = now;
      clearLast(acc);
      latestBook[exchangeNo] = null; // 집계에서도 제외
    } else {
      // 정상 북: 직전 구간 Δt 누적 → 즉시값 반영
      accumulate(acc, now);
      const inst = instantExecFromBook(bookStd);
      if (inst.buy != null && inst.sell != null) setLast(acc, inst);
      latestBook[exchangeNo] = bookStd;
    }
  }

  // ===== 2) 집계(aggregate) =====
  {
    const merged = mergeBooks(latestBook);
    if (!merged.asks.length || !merged.bids.length || isCrossed(merged)) {
      aggAcc.lastTs = now;
      clearLast(aggAcc);
    } else {
      accumulate(aggAcc, now);
      const instAgg = instantExecFromBook(merged);
      if (instAgg.buy != null && instAgg.sell != null) setLast(aggAcc, instAgg);
    }
  }
}

/** ------------------- 거래소별 WS 클라이언트 ------------------- */

class UpbitClient {
  constructor(code = "KRW-BTC") {
    this.name = MARKET_NAME_ENUM.UPBIT;
    this.market_no = MARKET_NO_ENUM.UPBIT;
    this.url  = "wss://api.upbit.com/websocket/v1";
    this.code = code;
    this.ws   = null;
    this._reconnecting = false;
    this._closeNotified = false;
    this.pingInterval = null;
    // 큐 구조 추가
    this.queue = [];
    this.queueProcessing = false;
    this.queueProcessInterval = null;
    this.queueMaxSize = QUEUE_MAX_SIZE;
    this.queueDropped = 0; // 드롭된 메시지 수
    // 큐 통계
    this.queueStats = {
      totalEnqueued: 0,      // 총 큐에 추가된 메시지 수
      totalProcessed: 0,      // 총 처리된 메시지 수
      totalDropped: 0,        // 총 드롭된 메시지 수
      maxQueueSize: 0,        // 최대 큐 크기
      avgProcessingTime: 0,   // 평균 처리 시간 (ms)
      lastProcessingTime: 0,  // 마지막 처리 시간
      processingTimes: [],    // 처리 시간 히스토리 (최근 100개)
      lastReportTime: Date.now(), // 마지막 리포트 시간
      lastProcessedCount: 0, // 마지막 리포트 시점의 처리된 메시지 수
      lastMessagesPerSecond: 0, // 최근 배치 처리에서 계산된 초당 처리 건수
      processedPerSecond: 0, // 1초당 처리 건수 (1초마다 업데이트)
      lastSecondProcessedCount: 0, // 1초 전 처리 건수
      lastSecondTime: Date.now(), // 마지막 1초 측정 시간
      processedPerSecondHistory: [], // 1초당 처리 건수 히스토리 (평균 계산용, 최근 30개)
      avgProcessedPerSecond: 0, // 1초당 평균 큐 처리 개수
      // 일일 통계
      dailyProcessed: 0, // 오늘 처리된 메시지 수
      maxProcessedPerSecond: 0, // 1초 안에 가장 크게 처리한 수량
      lastResetDate: new Date().toDateString(), // 마지막 리셋 날짜
    };
  }

  // 큐에 메시지 추가
  enqueue(message) {
    this.queueStats.totalEnqueued++;
    
    if (this.queue.length >= this.queueMaxSize) {
      // 큐가 가득 찬 경우 가장 오래된 메시지 제거 (FIFO)
      this.queue.shift();
      this.queueDropped++;
      this.queueStats.totalDropped++;
      if (this.queueDropped % 100 === 0) {
        logger.warn({ ex: this.name, dropped: this.queueDropped }, "queue overflow, messages dropped");
      }
    }
    
    this.queue.push({
      message: message,
      enqueuedAt: Date.now(), // 큐에 추가된 시간
    });
    
    // 최대 큐 크기 업데이트
    if (this.queue.length > this.queueStats.maxQueueSize) {
      this.queueStats.maxQueueSize = this.queue.length;
    }
  }

  // 큐에서 메시지 처리 (배치 처리)
  async processQueue(cb) {
    // 디버깅: 큐 상태 확인
    if (this.queueProcessing) {
      // logger.debug({ ex: this.name, queueSize: this.queue.length, queueProcessing: this.queueProcessing }, "queue already processing, skipping");
      return;
    }
    if (this.queue.length === 0) {
      return;
    }

    this.queueProcessing = true;
    const batchStartTime = Date.now();
    let processedInBatch = 0;
    
    try {
      while (this.queue.length > 0 && processedInBatch < OPTIMAL_BATCH_SIZE) {
        const queueItem = this.queue.shift();
        if (!queueItem) break;
        
        const processingStartTime = Date.now();
                
        try {
          await this.handleMessage(queueItem.message, cb);

          const processingTime = Date.now() - processingStartTime;
          this.queueStats.totalProcessed++;
          this.queueStats.dailyProcessed++;
          this.queueStats.lastProcessingTime = processingTime;
          
          this.queueStats.processingTimes.push(processingTime);
          if (this.queueStats.processingTimes.length > 100) {
            this.queueStats.processingTimes.shift();
          }
          
          if (this.queueStats.processingTimes.length > 0) {
            const sum = this.queueStats.processingTimes.reduce((a, b) => a + b, 0);
            this.queueStats.avgProcessingTime = Math.round(sum / this.queueStats.processingTimes.length);
          }
          
          processedInBatch++;
        } catch (e) {
          logger.error({ ex: this.name, err: String(e), stack: e.stack }, "queue processing error");
          // 에러가 발생해도 계속 처리하도록 함
        }
      }

      // 초당 처리 건수 계산 및 로깅
      if (processedInBatch > 0) {
        const batchElapsedTime = Date.now() - batchStartTime;
        const batchElapsedSeconds = Math.max(batchElapsedTime / 1000, 0.001); // 최소 0.001초로 제한하여 Infinity 방지
        let messagesPerSecond = parseFloat((processedInBatch / batchElapsedSeconds).toFixed(2));
        
        // Infinity나 NaN 체크 및 최대값 제한
        if (!isFinite(messagesPerSecond) || isNaN(messagesPerSecond)) {
          messagesPerSecond = 0;
        }
        // 최대값 제한 (실제로는 매우 높은 값이지만 표시를 위해)
        if (messagesPerSecond > 100000) {
          messagesPerSecond = 100000;
        }
        
        // 최근 초당 처리 건수 저장 (텔레그램 리포트용)
        this.queueStats.lastMessagesPerSecond = messagesPerSecond;
      }
    } finally {
      // 항상 queueProcessing 플래그를 false로 리셋
      this.queueProcessing = false;
      // logger.debug({ ex: this.name, queueSize: this.queue.length, processed: processedInBatch }, "processQueue finished");
    }
  }

  // 큐 상태 가져오기
  getQueueStats() {
    const currentTime = Date.now();
    const timeSinceLastReport = currentTime - this.queueStats.lastReportTime;
    
    // 리포트 간격 동안의 처리량 계산
    const lastCount = this.queueStats.lastProcessedCount || 0;
    const processedSinceLastReport = this.queueStats.totalProcessed - lastCount;
    
    let processingRate = "0.00";
    if (timeSinceLastReport >= 1000 && processedSinceLastReport > 0) {
      // 리포트 간격이 1초 이상이고 처리된 메시지가 있으면 계산
      processingRate = (processedSinceLastReport / (timeSinceLastReport / 1000)).toFixed(2);
    } else if (this.queueStats.processedPerSecond > 0) {
      // 리포트 간격이 짧거나 처리량이 없으면 1초당 처리 건수 사용
      processingRate = this.queueStats.processedPerSecond.toFixed(2);
    } else if (this.queueStats.totalProcessed > 0 && timeSinceLastReport > 0) {
      // 전체 처리 건수와 시간으로 계산 (대체 방법)
      processingRate = (this.queueStats.totalProcessed / (timeSinceLastReport / 1000)).toFixed(2);
    }
    
    const queueUsagePercent = ((this.queue.length / this.queueMaxSize) * 100).toFixed(1);
    
    return {
      exchange: this.name,
      queueSize: this.queue.length,
      queueMaxSize: this.queueMaxSize,
      queueUsagePercent: `${queueUsagePercent}%`,
      totalEnqueued: this.queueStats.totalEnqueued,
      totalProcessed: this.queueStats.totalProcessed,
      totalDropped: this.queueStats.totalDropped,
      maxQueueSize: this.queueStats.maxQueueSize,
      avgProcessingTime: `${this.queueStats.avgProcessingTime}ms`,
      lastProcessingTime: `${this.queueStats.lastProcessingTime}ms`,
      processingRate: `${processingRate} msg/s`, // 리포트 간격 동안의 평균 처리 속도
      lastMessagesPerSecond: this.queueStats.lastMessagesPerSecond || 0, // 최근 배치 처리 초당 건수
      processedPerSecond: this.queueStats.processedPerSecond || 0, // 1초당 처리 건수 (순간값)
      avgProcessedPerSecond: this.queueStats.avgProcessedPerSecond || 0, // 1초당 평균 큐 처리 개수
      lastReportTime: this.queueStats.lastReportTime, // 마지막 리포트 시간 (리포트에서 사용)
      isProcessing: this.queueProcessing,
      isConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
    };
  }

  // 리포트를 위한 통계 스냅샷 저장
  snapshotStats() {
    this.queueStats.lastProcessedCount = this.queueStats.totalProcessed;
    this.queueStats.lastReportTime = Date.now();
  }

  // 메시지 처리 로직
  async handleMessage(raw, cb) {
    try {
      const msg = JSON.parse(raw.toString());
      if ((msg.ty || msg.type) === "orderbook") {
        const units = msg.obu || msg.orderbook_units || [];
        const marketAt = msg.tms;
        const coollectorAt = new Date(Date.now()).getTime();

        // 15개까지만 자르기
        const bids = units.slice(0, 15).map(u => [u.bp ?? u.bid_price, u.bs ?? u.bid_size]);
        const asks = units.slice(0, 15).map(u => [u.ap ?? u.ask_price, u.as ?? u.ask_size]);

        const orderbook_item = {
          symbol: process.env.SYMBOL ?? "KRW-BTC",
          exchange_no: this.market_no,
          exchange_name: this.name,
          bid: bids,
          ask: asks,
          marketAt: marketAt,
          coollectorAt: coollectorAt,
          diff_ms: (coollectorAt - marketAt) / 1000,
        };
        
        // 타임아웃 보호: 10초 내에 완료되지 않으면 경고만 하고 계속 진행
        try {
          await Promise.race([
            SendToOrderBook_ZMQ(orderbook_item, raw.toString()),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('SendToOrderBook_ZMQ timeout')), 10000)
            )
          ]);
        } catch (timeoutError) {
          // 타임아웃 발생 시 경고만 로깅하고 계속 진행 (메시지 손실 방지)
          if (timeoutError.message.includes('timeout')) {
            logger.warn({ ex: this.name, err: String(timeoutError) }, "ZMQ send timeout (continuing)");
          } else {
            // 다른 에러는 다시 throw
            throw timeoutError;
          }
        }
        
        if (cb && typeof cb === 'function') {
          cb(this.market_no, normalize(bids, asks));
        }
      }
    } catch (e) {
      logger.error({ ex: this.name, err: String(e), stack: e.stack }, "handleMessage error");
      throw e; // 에러를 다시 throw하여 processQueue에서 처리하도록 함
    }
  }
  start(cb) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = [
        { ticket: "execavg-tw" },
        { type: "orderbook", codes: [this.code] },
        { format: "SIMPLE" },
      ];
      try { 
        this.ws?.send("PING"); 
      } catch {}
      this.ws.send(Buffer.from(JSON.stringify(req), "utf8"));
      logger.info({ ex: this.name, msg: "subscribed", code: this.code });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} OrderBook-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} OrderBook-Collector WebSocket opened (initial connect).`, false);
      }
      this._reconnecting = false;
      this._closeNotified = false;
      this.pingInterval = setInterval(() => {
        try { this.ws?.send("PING"); } catch {}
      }, PING_INTERVAL);
    });
    this.ws.on("message", (raw) => {
      try {
        // 큐에 메시지 추가
        this.enqueue(raw);
        // 디버깅: 큐에 메시지가 추가되었는지 확인
        if (this.queue.length % 100 === 0) {
          logger.debug({ ex: this.name, queueSize: this.queue.length }, "messages enqueued");
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "queue enqueue error");
      }
    });

    // 큐 처리 시작
    this.queueProcessInterval = setInterval(() => {
      this.processQueue(cb).catch(e => {
        logger.error({ ex: this.name, err: String(e), stack: e.stack }, "queue process interval error");
        // 에러 발생 시에도 queueProcessing 플래그 리셋
        this.queueProcessing = false;
      });
    }, OPTIMAL_PROCESS_INTERVAL);
    this.ws.on("close", () => {
      // 큐 처리 중지
      if (this.queueProcessInterval) {
        clearInterval(this.queueProcessInterval);
        this.queueProcessInterval = null;
      }
      this._reconnecting = true;
      setTimeout(() => this.start(cb), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => { 
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage(this.name, `${this.name} WebSocket error: ${String(e)}`);
    });
  }
}

class BithumbClient {
  constructor(code = "KRW-BTC") {
    this.name = MARKET_NAME_ENUM.BITHUMB;
    this.market_no = MARKET_NO_ENUM.BITHUMB;
    this.fromAt = null;
    this.url  = "wss://ws-api.bithumb.com/websocket/v1";
    this.code = code;
    this.ws   = null;
    this._reconnecting = false;
    this._closeNotified = false;
    this.pingInterval = null;
    // 큐 구조 추가
    this.queue = [];
    this.queueProcessing = false;
    this.queueProcessInterval = null;
    this.queueMaxSize = QUEUE_MAX_SIZE;
    this.queueDropped = 0;
    // 큐 통계
    this.queueStats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalDropped: 0,
      maxQueueSize: 0,
      avgProcessingTime: 0,
      lastProcessingTime: 0,
      processingTimes: [],
      lastReportTime: Date.now(),
      lastProcessedCount: 0, // 마지막 리포트 시점의 처리된 메시지 수
      lastMessagesPerSecond: 0, // 최근 배치 처리에서 계산된 초당 처리 건수
      processedPerSecond: 0, // 1초당 처리 건수 (1초마다 업데이트)
      lastSecondProcessedCount: 0, // 1초 전 처리 건수
      lastSecondTime: Date.now(), // 마지막 1초 측정 시간
      processedPerSecondHistory: [], // 1초당 처리 건수 히스토리 (평균 계산용, 최근 30개)
      avgProcessedPerSecond: 0, // 1초당 평균 큐 처리 개수
      // 일일 통계
      dailyProcessed: 0, // 오늘 처리된 메시지 수
      maxProcessedPerSecond: 0, // 1초 안에 가장 크게 처리한 수량
      lastResetDate: new Date().toDateString(), // 마지막 리셋 날짜
    };
  }

  // 큐에 메시지 추가
  enqueue(message) {
    this.queueStats.totalEnqueued++;
    
    if (this.queue.length >= this.queueMaxSize) {
      this.queue.shift();
      this.queueDropped++;
      this.queueStats.totalDropped++;
      if (this.queueDropped % 100 === 0) {
        logger.warn({ ex: this.name, dropped: this.queueDropped }, "queue overflow, messages dropped");
      }
    }
    
    this.queue.push({
      message: message,
      enqueuedAt: Date.now(),
    });
    
    if (this.queue.length > this.queueStats.maxQueueSize) {
      this.queueStats.maxQueueSize = this.queue.length;
    }
  }

  // 큐에서 메시지 처리 (배치 처리)
  async processQueue(cb) {
    if (this.queueProcessing || this.queue.length === 0) {
      return;
    }

    this.queueProcessing = true;
    const batchStartTime = Date.now();
    let processedInBatch = 0;
    
    try {
      while (this.queue.length > 0 && processedInBatch < OPTIMAL_BATCH_SIZE) {
        const queueItem = this.queue.shift();
        if (!queueItem) break;
        
        const processingStartTime = Date.now();
        
        try {
          await this.handleMessage(queueItem.message, cb);
          
          const processingTime = Date.now() - processingStartTime;
          this.queueStats.totalProcessed++;
          this.queueStats.dailyProcessed++;
          this.queueStats.lastProcessingTime = processingTime;
          
          this.queueStats.processingTimes.push(processingTime);
          if (this.queueStats.processingTimes.length > 100) {
            this.queueStats.processingTimes.shift();
          }
          
          if (this.queueStats.processingTimes.length > 0) {
            const sum = this.queueStats.processingTimes.reduce((a, b) => a + b, 0);
            this.queueStats.avgProcessingTime = Math.round(sum / this.queueStats.processingTimes.length);
          }
          
          processedInBatch++;
        } catch (e) {
          logger.error({ ex: this.name, err: String(e), stack: e.stack }, "queue processing error");
          // 에러가 발생해도 계속 처리하도록 함
        }
      }

      // 초당 처리 건수 계산 및 로깅
      if (processedInBatch > 0) {
        const batchElapsedTime = Date.now() - batchStartTime;
        const batchElapsedSeconds = Math.max(batchElapsedTime / 1000, 0.001); // 최소 0.001초로 제한하여 Infinity 방지
        let messagesPerSecond = parseFloat((processedInBatch / batchElapsedSeconds).toFixed(2));
        
        // Infinity나 NaN 체크 및 최대값 제한
        if (!isFinite(messagesPerSecond) || isNaN(messagesPerSecond)) {
          messagesPerSecond = 0;
        }
        // 최대값 제한 (실제로는 매우 높은 값이지만 표시를 위해)
        if (messagesPerSecond > 100000) {
          messagesPerSecond = 100000;
        }
        
        // 최근 초당 처리 건수 저장 (텔레그램 리포트용)
        this.queueStats.lastMessagesPerSecond = messagesPerSecond;
      }
    } finally {
      // 항상 queueProcessing 플래그를 false로 리셋
      this.queueProcessing = false;
    }
  }

  // 큐 상태 가져오기
  getQueueStats() {
    const currentTime = Date.now();
    const timeSinceLastReport = currentTime - this.queueStats.lastReportTime;
    
    // 리포트 간격 동안의 처리량 계산
    const lastCount = this.queueStats.lastProcessedCount || 0;
    const processedSinceLastReport = this.queueStats.totalProcessed - lastCount;
    
    let processingRate = "0.00";
    if (timeSinceLastReport >= 1000 && processedSinceLastReport > 0) {
      // 리포트 간격이 1초 이상이고 처리된 메시지가 있으면 계산
      processingRate = (processedSinceLastReport / (timeSinceLastReport / 1000)).toFixed(2);
    } else if (this.queueStats.processedPerSecond > 0) {
      // 리포트 간격이 짧거나 처리량이 없으면 1초당 처리 건수 사용
      processingRate = this.queueStats.processedPerSecond.toFixed(2);
    } else if (this.queueStats.totalProcessed > 0 && timeSinceLastReport > 0) {
      // 전체 처리 건수와 시간으로 계산 (대체 방법)
      processingRate = (this.queueStats.totalProcessed / (timeSinceLastReport / 1000)).toFixed(2);
    }
    
    const queueUsagePercent = ((this.queue.length / this.queueMaxSize) * 100).toFixed(1);
    
    return {
      exchange: this.name,
      queueSize: this.queue.length,
      queueMaxSize: this.queueMaxSize,
      queueUsagePercent: `${queueUsagePercent}%`,
      totalEnqueued: this.queueStats.totalEnqueued,
      totalProcessed: this.queueStats.totalProcessed,
      totalDropped: this.queueStats.totalDropped,
      maxQueueSize: this.queueStats.maxQueueSize,
      avgProcessingTime: `${this.queueStats.avgProcessingTime}ms`,
      lastProcessingTime: `${this.queueStats.lastProcessingTime}ms`,
      processingRate: `${processingRate} msg/s`, // 리포트 간격 동안의 평균 처리 속도
      lastMessagesPerSecond: this.queueStats.lastMessagesPerSecond || 0, // 최근 배치 처리 초당 건수
      processedPerSecond: this.queueStats.processedPerSecond || 0, // 1초당 처리 건수 (순간값)
      avgProcessedPerSecond: this.queueStats.avgProcessedPerSecond || 0, // 1초당 평균 큐 처리 개수
      lastReportTime: this.queueStats.lastReportTime, // 마지막 리포트 시간 (리포트에서 사용)
      isProcessing: this.queueProcessing,
      isConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
    };
  }

  // 리포트를 위한 통계 스냅샷 저장
  snapshotStats() {
    this.queueStats.lastProcessedCount = this.queueStats.totalProcessed;
    this.queueStats.lastReportTime = Date.now();
  }

  // 메시지 처리 로직
  async handleMessage(raw, cb) {
    const msg = JSON.parse(raw.toString());
    if ((msg.ty ?? msg.type) === "orderbook") {
      const marketAt = parseInt(msg.tms / 1000);
      const coollectorAt = new Date(Date.now()).getTime();

      const units = msg.obu || msg.orderbook_units || [];
      const bids = units.slice(0, 15).map(u => [u.bp ?? u.bid_price, u.bs ?? u.bid_size]);
      const asks = units.slice(0, 15).map(u => [u.ap ?? u.ask_price, u.as ?? u.ask_size]);

      const orderbook_item = {
        symbol: process.env.SYMBOL ?? "KRW-BTC",
        exchange_no: this.market_no,
        exchange_name: this.name,
        bid: bids,
        ask: asks,
        marketAt: marketAt,
        coollectorAt: coollectorAt,
        diff_ms: (coollectorAt - marketAt) / 1000,
      };
      // 타임아웃 보호: 10초 내에 완료되지 않으면 경고만 하고 계속 진행
      try {
        await Promise.race([
          SendToOrderBook_ZMQ(orderbook_item, raw.toString()),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('SendToOrderBook_ZMQ timeout')), 10000)
          )
        ]);
      } catch (timeoutError) {
        // 타임아웃 발생 시 경고만 로깅하고 계속 진행 (메시지 손실 방지)
        if (timeoutError.message.includes('timeout')) {
          logger.warn({ ex: this.name, err: String(timeoutError) }, "ZMQ send timeout (continuing)");
        } else {
          // 다른 에러는 다시 throw
          throw timeoutError;
        }
      }
      if (cb && typeof cb === 'function') {
        cb(this.market_no, normalize(bids, asks));
      }
    }
  }
  start(cb) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = [
        { ticket: "execavg-tw" },
        { type: "orderbook", codes: [this.code] },
        { format: "SIMPLE" },
      ];
      try { 
        this.ws?.send("PING"); 
      } catch {

      }
      this.ws.send(JSON.stringify(req));
      logger.info({ ex: this.name, msg: "subscribed", code: this.code });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} OrderBook-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} OrderBook-Collector WebSocket opened (initial connect).`, false);
      }
      this._reconnecting = false;
      this._closeNotified = false;
      // this.pingInterval = setInterval(() => {
      //   try { this.ws?.send("PING"); } catch {}
      // }, PING_INTERVAL);
    });
    this.ws.on("message", (raw) => {
      try {
        // 큐에 메시지 추가
        this.enqueue(raw);
        // 디버깅: 큐에 메시지가 추가되었는지 확인
        if (this.queue.length % 100 === 0) {
          logger.debug({ ex: this.name, queueSize: this.queue.length }, "messages enqueued");
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "queue enqueue error");
      }
    });

    // 큐 처리 시작
    this.queueProcessInterval = setInterval(() => {
      this.processQueue(cb).catch(e => {
        logger.error({ ex: this.name, err: String(e), stack: e.stack }, "queue process interval error");
        // 에러 발생 시에도 queueProcessing 플래그 리셋
        this.queueProcessing = false;
      });
    }, OPTIMAL_PROCESS_INTERVAL);

    this.ws.on("close", () => {
      // 큐 처리 중지
      if (this.queueProcessInterval) {
        clearInterval(this.queueProcessInterval);
        this.queueProcessInterval = null;
      }
      this._reconnecting = true;
      setTimeout(() => this.start(cb), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => { 
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage(this.name, `${this.name} WebSocket error: ${String(e)}`);
    });
  }
}

class KorbitClient {
  constructor(symbol = "btc_krw") {
    this.name = MARKET_NAME_ENUM.KORBIT;
    this.market_no = MARKET_NO_ENUM.KORBIT;
    this.fromAt = null;
    this.url  = "wss://ws-api.korbit.co.kr/v2/public";
    this.symbol = symbol;
    this.ws   = null;
    this._reconnecting = false;
    this._closeNotified = false;
    this.pingInterval = null;
    // 큐 구조 추가
    this.queue = [];
    this.queueProcessing = false;
    this.queueProcessInterval = null;
    this.queueMaxSize = QUEUE_MAX_SIZE;
    this.queueDropped = 0;
    // 큐 통계
    this.queueStats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalDropped: 0,
      maxQueueSize: 0,
      avgProcessingTime: 0,
      lastProcessingTime: 0,
      processingTimes: [],
      lastReportTime: Date.now(),
      lastProcessedCount: 0, // 마지막 리포트 시점의 처리된 메시지 수
      lastMessagesPerSecond: 0, // 최근 배치 처리에서 계산된 초당 처리 건수
      processedPerSecond: 0, // 1초당 처리 건수 (1초마다 업데이트)
      lastSecondProcessedCount: 0, // 1초 전 처리 건수
      lastSecondTime: Date.now(), // 마지막 1초 측정 시간
      processedPerSecondHistory: [], // 1초당 처리 건수 히스토리 (평균 계산용, 최근 30개)
      avgProcessedPerSecond: 0, // 1초당 평균 큐 처리 개수
      // 일일 통계
      dailyProcessed: 0, // 오늘 처리된 메시지 수
      maxProcessedPerSecond: 0, // 1초 안에 가장 크게 처리한 수량
      lastResetDate: new Date().toDateString(), // 마지막 리셋 날짜
    };
  }

  // 큐에 메시지 추가
  enqueue(message) {
    if (this.queue.length >= this.queueMaxSize) {
      this.queue.shift();
      this.queueDropped++;
      if (this.queueDropped % 100 === 0) {
        logger.warn({ ex: this.name, dropped: this.queueDropped }, "queue overflow, messages dropped");
      }
    }
    this.queue.push(message);
  }

  // 큐에서 메시지 처리
  async processQueue(cb) {
    if (this.queueProcessing || this.queue.length === 0) {
      return;
    }

    this.queueProcessing = true;
    const batchStartTime = Date.now();
    let processedInBatch = 0;
    
    while (this.queue.length > 0 && processedInBatch < OPTIMAL_BATCH_SIZE) {
      const queueItem = this.queue.shift();
      if (!queueItem) break;
      
      const processingStartTime = Date.now();
      
      try {
        await this.handleMessage(queueItem.message, cb);
        
        const processingTime = Date.now() - processingStartTime;
        this.queueStats.totalProcessed++;
        this.queueStats.dailyProcessed++;
        this.queueStats.lastProcessingTime = processingTime;
        
        this.queueStats.processingTimes.push(processingTime);
        if (this.queueStats.processingTimes.length > 100) {
          this.queueStats.processingTimes.shift();
        }
        
        if (this.queueStats.processingTimes.length > 0) {
          const sum = this.queueStats.processingTimes.reduce((a, b) => a + b, 0);
          this.queueStats.avgProcessingTime = Math.round(sum / this.queueStats.processingTimes.length);
        }
        
        processedInBatch++;
      } catch (e) {
        logger.error({ ex: this.name, err: String(e) }, "queue processing error");
      }
    }

    // 초당 처리 건수 계산 및 로깅
    if (processedInBatch > 0) {
      const batchElapsedTime = Date.now() - batchStartTime;
      const batchElapsedSeconds = Math.max(batchElapsedTime / 1000, 0.001); // 최소 0.001초로 제한하여 Infinity 방지
      let messagesPerSecond = parseFloat((processedInBatch / batchElapsedSeconds).toFixed(2));
      
      // Infinity나 NaN 체크 및 최대값 제한
      if (!isFinite(messagesPerSecond) || isNaN(messagesPerSecond)) {
        messagesPerSecond = 0;
      }
      // 최대값 제한 (실제로는 매우 높은 값이지만 표시를 위해)
      if (messagesPerSecond > 100000) {
        messagesPerSecond = 100000;
      }
      // 최근 초당 처리 건수 저장 (텔레그램 리포트용)
      this.queueStats.lastMessagesPerSecond = messagesPerSecond;
    }

    this.queueProcessing = false;
  }

  // 큐에 메시지 추가
  enqueue(message) {
    this.queueStats.totalEnqueued++;
    
    if (this.queue.length >= this.queueMaxSize) {
      this.queue.shift();
      this.queueDropped++;
      this.queueStats.totalDropped++;
      if (this.queueDropped % 100 === 0) {
        logger.warn({ ex: this.name, dropped: this.queueDropped }, "queue overflow, messages dropped");
      }
    }
    
    this.queue.push({
      message: message,
      enqueuedAt: Date.now(),
    });
    
    if (this.queue.length > this.queueStats.maxQueueSize) {
      this.queueStats.maxQueueSize = this.queue.length;
    }
  }

  // 큐에서 메시지 처리 (배치 처리)
  async processQueue(cb) {
    if (this.queueProcessing || this.queue.length === 0) {
      return;
    }

    this.queueProcessing = true;
    const batchStartTime = Date.now();
    let processedInBatch = 0;
    
    try {
      while (this.queue.length > 0 && processedInBatch < OPTIMAL_BATCH_SIZE) {
        const queueItem = this.queue.shift();
        if (!queueItem) break;
        
        const processingStartTime = Date.now();
        
        try {
          await this.handleMessage(queueItem.message, cb);
          
          const processingTime = Date.now() - processingStartTime;
          this.queueStats.totalProcessed++;
          this.queueStats.dailyProcessed++;
          this.queueStats.lastProcessingTime = processingTime;
          
          this.queueStats.processingTimes.push(processingTime);
          if (this.queueStats.processingTimes.length > 100) {
            this.queueStats.processingTimes.shift();
          }
          
          if (this.queueStats.processingTimes.length > 0) {
            const sum = this.queueStats.processingTimes.reduce((a, b) => a + b, 0);
            this.queueStats.avgProcessingTime = Math.round(sum / this.queueStats.processingTimes.length);
          }
          
          processedInBatch++;
        } catch (e) {
          logger.error({ ex: this.name, err: String(e), stack: e.stack }, "queue processing error");
          // 에러가 발생해도 계속 처리하도록 함
        }
      }

      // 초당 처리 건수 계산 및 로깅
      if (processedInBatch > 0) {
        const batchElapsedTime = Date.now() - batchStartTime;
        const batchElapsedSeconds = Math.max(batchElapsedTime / 1000, 0.001); // 최소 0.001초로 제한하여 Infinity 방지
        let messagesPerSecond = parseFloat((processedInBatch / batchElapsedSeconds).toFixed(2));
        
        // Infinity나 NaN 체크 및 최대값 제한
        if (!isFinite(messagesPerSecond) || isNaN(messagesPerSecond)) {
          messagesPerSecond = 0;
        }
        // 최대값 제한 (실제로는 매우 높은 값이지만 표시를 위해)
        if (messagesPerSecond > 100000) {
          messagesPerSecond = 100000;
        }
        
        // 최근 초당 처리 건수 저장 (텔레그램 리포트용)
        this.queueStats.lastMessagesPerSecond = messagesPerSecond;
      }
    } finally {
      // 항상 queueProcessing 플래그를 false로 리셋
      this.queueProcessing = false;
    }
  }

  // 큐 상태 가져오기
  getQueueStats() {
    const currentTime = Date.now();
    const timeSinceLastReport = currentTime - this.queueStats.lastReportTime;
    
    // 리포트 간격 동안의 처리량 계산
    const lastCount = this.queueStats.lastProcessedCount || 0;
    const processedSinceLastReport = this.queueStats.totalProcessed - lastCount;
    
    let processingRate = "0.00";
    if (timeSinceLastReport >= 1000 && processedSinceLastReport > 0) {
      // 리포트 간격이 1초 이상이고 처리된 메시지가 있으면 계산
      processingRate = (processedSinceLastReport / (timeSinceLastReport / 1000)).toFixed(2);
    } else if (this.queueStats.processedPerSecond > 0) {
      // 리포트 간격이 짧거나 처리량이 없으면 1초당 처리 건수 사용
      processingRate = this.queueStats.processedPerSecond.toFixed(2);
    } else if (this.queueStats.totalProcessed > 0 && timeSinceLastReport > 0) {
      // 전체 처리 건수와 시간으로 계산 (대체 방법)
      processingRate = (this.queueStats.totalProcessed / (timeSinceLastReport / 1000)).toFixed(2);
    }
    
    const queueUsagePercent = ((this.queue.length / this.queueMaxSize) * 100).toFixed(1);
    
    return {
      exchange: this.name,
      queueSize: this.queue.length,
      queueMaxSize: this.queueMaxSize,
      queueUsagePercent: `${queueUsagePercent}%`,
      totalEnqueued: this.queueStats.totalEnqueued,
      totalProcessed: this.queueStats.totalProcessed,
      totalDropped: this.queueStats.totalDropped,
      maxQueueSize: this.queueStats.maxQueueSize,
      avgProcessingTime: `${this.queueStats.avgProcessingTime}ms`,
      lastProcessingTime: `${this.queueStats.lastProcessingTime}ms`,
      processingRate: `${processingRate} msg/s`, // 리포트 간격 동안의 평균 처리 속도
      lastMessagesPerSecond: this.queueStats.lastMessagesPerSecond || 0, // 최근 배치 처리 초당 건수
      processedPerSecond: this.queueStats.processedPerSecond || 0, // 1초당 처리 건수 (순간값)
      avgProcessedPerSecond: this.queueStats.avgProcessedPerSecond || 0, // 1초당 평균 큐 처리 개수
      lastReportTime: this.queueStats.lastReportTime, // 마지막 리포트 시간 (리포트에서 사용)
      isProcessing: this.queueProcessing,
      isConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
    };
  }

  // 리포트를 위한 통계 스냅샷 저장
  snapshotStats() {
    this.queueStats.lastProcessedCount = this.queueStats.totalProcessed;
    this.queueStats.lastReportTime = Date.now();
  }

  // 메시지 처리 로직
  async handleMessage(raw, cb) {
    if (!isJsonValue(raw.toString())) {
      return;
    }

    const msg = JSON.parse(raw.toString());
    if (msg.type === "orderbook" && msg.data) {
      const marketAt = msg.timestamp;
      const coollectorAt = new Date(Date.now()).getTime();

      const bids = (msg.data.bids || []).slice(0, 15).map(x => [Number(x.price), Number(x.qty)]);
      const asks = (msg.data.asks || []).slice(0, 15).map(x => [Number(x.price), Number(x.qty)]);

      const orderbook_item = {
        symbol: process.env.SYMBOL ?? "KRW-BTC",
        exchange_no: this.market_no,
        exchange_name: this.name,
        bid: bids,
        ask: asks,
        marketAt: marketAt,
        coollectorAt: coollectorAt,
        diff_ms: (coollectorAt - marketAt) / 1000,
      };
      // 타임아웃 보호: 10초 내에 완료되지 않으면 경고만 하고 계속 진행
      try {
        await Promise.race([
          SendToOrderBook_ZMQ(orderbook_item, raw.toString()),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('SendToOrderBook_ZMQ timeout')), 10000)
          )
        ]);
      } catch (timeoutError) {
        // 타임아웃 발생 시 경고만 로깅하고 계속 진행 (메시지 손실 방지)
        if (timeoutError.message.includes('timeout')) {
          logger.warn({ ex: this.name, err: String(timeoutError) }, "ZMQ send timeout (continuing)");
        } else {
          // 다른 에러는 다시 throw
          throw timeoutError;
        }
      }
      if (cb && typeof cb === 'function') {
        cb(this.market_no, normalize(bids, asks));
      }
    }
  }
  start(cb) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = JSON.stringify([{ method: "subscribe", type: "orderbook", symbols: [this.symbol] }]);
      this.ws.send(req);
      logger.info({ ex: this.name, msg: "subscribed", symbol: this.symbol });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} OrderBook-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} OrderBook-Collector WebSocket opened (initial connect).`, false);
      }
      this._reconnecting = false;
      this._closeNotified = false;
      this.pingInterval = setInterval(() => {
        try { 
          this.ws?.send("PING"); 
        } catch {}
      }, PING_INTERVAL);
    });
    this.ws.on("message", (raw) => {
      try {
        // 큐에 메시지 추가
        this.enqueue(raw);
        // 디버깅: 큐에 메시지가 추가되었는지 확인
        if (this.queue.length % 100 === 0) {
          logger.debug({ ex: this.name, queueSize: this.queue.length }, "messages enqueued");
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "queue enqueue error");
      }
    });

    // 큐 처리 시작
    this.queueProcessInterval = setInterval(() => {
      this.processQueue(cb).catch(e => {
        logger.error({ ex: this.name, err: String(e), stack: e.stack }, "queue process interval error");
        // 에러 발생 시에도 queueProcessing 플래그 리셋
        this.queueProcessing = false;
      });
    }, OPTIMAL_PROCESS_INTERVAL);

    this.ws.on("close", () => {
      // 큐 처리 중지
      if (this.queueProcessInterval) {
        clearInterval(this.queueProcessInterval);
        this.queueProcessInterval = null;
      }
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      this._reconnecting = true;
      setTimeout(() => this.start(cb), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => { 
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage(this.name, `${this.name} WebSocket error: ${String(e)}`);
    });
  }
}

class CoinoneClient {
  constructor(qc = "KRW", tc = "BTC") {
    this.name = MARKET_NAME_ENUM.COINONE;
    this.market_no = MARKET_NO_ENUM.COINONE;
    this.url  = "wss://stream.coinone.co.kr";
    this.qc   = qc;
    this.tc   = tc;
    this.ws   = null;
    this.pingInterval = null;
    this._reconnecting = false;
    this._closeNotified = false;
    // 큐 구조 추가
    this.queue = [];
    this.queueProcessing = false;
    this.queueProcessInterval = null;
    this.queueMaxSize = QUEUE_MAX_SIZE;
    this.queueDropped = 0;
    // 큐 통계
    this.queueStats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalDropped: 0,
      maxQueueSize: 0,
      avgProcessingTime: 0,
      lastProcessingTime: 0,
      processingTimes: [],
      lastReportTime: Date.now(),
      lastProcessedCount: 0, // 마지막 리포트 시점의 처리된 메시지 수
      lastMessagesPerSecond: 0, // 최근 배치 처리에서 계산된 초당 처리 건수
      processedPerSecond: 0, // 1초당 처리 건수 (1초마다 업데이트)
      lastSecondProcessedCount: 0, // 1초 전 처리 건수
      lastSecondTime: Date.now(), // 마지막 1초 측정 시간
      processedPerSecondHistory: [], // 1초당 처리 건수 히스토리 (평균 계산용, 최근 30개)
      avgProcessedPerSecond: 0, // 1초당 평균 큐 처리 개수
      // 일일 통계
      dailyProcessed: 0, // 오늘 처리된 메시지 수
      maxProcessedPerSecond: 0, // 1초 안에 가장 크게 처리한 수량
      lastResetDate: new Date().toDateString(), // 마지막 리셋 날짜
    };
  }

  // 큐에 메시지 추가
  enqueue(message) {
    this.queueStats.totalEnqueued++;
    
    if (this.queue.length >= this.queueMaxSize) {
      this.queue.shift();
      this.queueDropped++;
      this.queueStats.totalDropped++;
      if (this.queueDropped % 100 === 0) {
        logger.warn({ ex: this.name, dropped: this.queueDropped }, "queue overflow, messages dropped");
      }
    }
    
    this.queue.push({
      message: message,
      enqueuedAt: Date.now(),
    });
    
    if (this.queue.length > this.queueStats.maxQueueSize) {
      this.queueStats.maxQueueSize = this.queue.length;
    }
  }

  // 큐에서 메시지 처리 (배치 처리)
  async processQueue(cb) {
    if (this.queueProcessing || this.queue.length === 0) {
      return;
    }

    this.queueProcessing = true;
    const batchStartTime = Date.now();
    let processedInBatch = 0;
    
    try {
      while (this.queue.length > 0 && processedInBatch < OPTIMAL_BATCH_SIZE) {
        const queueItem = this.queue.shift();
        if (!queueItem) break;
        
        const processingStartTime = Date.now();
        
        try {
          await this.handleMessage(queueItem.message, cb);
          
          const processingTime = Date.now() - processingStartTime;
          this.queueStats.totalProcessed++;
          this.queueStats.dailyProcessed++;
          this.queueStats.lastProcessingTime = processingTime;
          
          this.queueStats.processingTimes.push(processingTime);
          if (this.queueStats.processingTimes.length > 100) {
            this.queueStats.processingTimes.shift();
          }
          
          if (this.queueStats.processingTimes.length > 0) {
            const sum = this.queueStats.processingTimes.reduce((a, b) => a + b, 0);
            this.queueStats.avgProcessingTime = Math.round(sum / this.queueStats.processingTimes.length);
          }
          
          processedInBatch++;
        } catch (e) {
          logger.error({ ex: this.name, err: String(e), stack: e.stack }, "queue processing error");
          // 에러가 발생해도 계속 처리하도록 함
        }
      }

      // 초당 처리 건수 계산 및 로깅
      if (processedInBatch > 0) {
        const batchElapsedTime = Date.now() - batchStartTime;
        const batchElapsedSeconds = Math.max(batchElapsedTime / 1000, 0.001); // 최소 0.001초로 제한하여 Infinity 방지
        let messagesPerSecond = parseFloat((processedInBatch / batchElapsedSeconds).toFixed(2));
        
        // Infinity나 NaN 체크 및 최대값 제한
        if (!isFinite(messagesPerSecond) || isNaN(messagesPerSecond)) {
          messagesPerSecond = 0;
        }
        // 최대값 제한 (실제로는 매우 높은 값이지만 표시를 위해)
        if (messagesPerSecond > 100000) {
          messagesPerSecond = 100000;
        }
        // 최근 초당 처리 건수 저장 (텔레그램 리포트용)
        this.queueStats.lastMessagesPerSecond = messagesPerSecond;        
      }
    } finally {
      // 항상 queueProcessing 플래그를 false로 리셋
      this.queueProcessing = false;
    }
  }

  // 큐 상태 가져오기
  getQueueStats() {
    const currentTime = Date.now();
    const timeSinceLastReport = currentTime - this.queueStats.lastReportTime;
    
    // 리포트 간격 동안의 처리량 계산
    const lastCount = this.queueStats.lastProcessedCount || 0;
    const processedSinceLastReport = this.queueStats.totalProcessed - lastCount;
    
    let processingRate = "0.00";
    if (timeSinceLastReport >= 1000 && processedSinceLastReport > 0) {
      // 리포트 간격이 1초 이상이고 처리된 메시지가 있으면 계산
      processingRate = (processedSinceLastReport / (timeSinceLastReport / 1000)).toFixed(2);
    } else if (this.queueStats.processedPerSecond > 0) {
      // 리포트 간격이 짧거나 처리량이 없으면 1초당 처리 건수 사용
      processingRate = this.queueStats.processedPerSecond.toFixed(2);
    } else if (this.queueStats.totalProcessed > 0 && timeSinceLastReport > 0) {
      // 전체 처리 건수와 시간으로 계산 (대체 방법)
      processingRate = (this.queueStats.totalProcessed / (timeSinceLastReport / 1000)).toFixed(2);
    }
    
    const queueUsagePercent = ((this.queue.length / this.queueMaxSize) * 100).toFixed(1);
    
    return {
      exchange: this.name,
      queueSize: this.queue.length,
      queueMaxSize: this.queueMaxSize,
      queueUsagePercent: `${queueUsagePercent}%`,
      totalEnqueued: this.queueStats.totalEnqueued,
      totalProcessed: this.queueStats.totalProcessed,
      totalDropped: this.queueStats.totalDropped,
      maxQueueSize: this.queueStats.maxQueueSize,
      avgProcessingTime: `${this.queueStats.avgProcessingTime}ms`,
      lastProcessingTime: `${this.queueStats.lastProcessingTime}ms`,
      processingRate: `${processingRate} msg/s`, // 리포트 간격 동안의 평균 처리 속도
      lastMessagesPerSecond: this.queueStats.lastMessagesPerSecond || 0, // 최근 배치 처리 초당 건수
      processedPerSecond: this.queueStats.processedPerSecond || 0, // 1초당 처리 건수 (순간값)
      avgProcessedPerSecond: this.queueStats.avgProcessedPerSecond || 0, // 1초당 평균 큐 처리 개수
      lastReportTime: this.queueStats.lastReportTime, // 마지막 리포트 시간 (리포트에서 사용)
      isProcessing: this.queueProcessing,
      isConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
    };
  }

  // 리포트를 위한 통계 스냅샷 저장
  snapshotStats() {
    this.queueStats.lastProcessedCount = this.queueStats.totalProcessed;
    this.queueStats.lastReportTime = Date.now();
  }

  // 메시지 처리 로직
  async handleMessage(raw, cb) {
    const msg = JSON.parse(raw.toString());
    if ((msg.c === "ORDERBOOK" || msg.channel === "ORDERBOOK") && (msg.d || msg.data)) {
      const d = msg.d || msg.data;
      const marketAt = d.t;
      const coollectorAt = new Date(Date.now()).getTime();

      const bids = (d.b || d.bids || []).map(u => [Number(u.p ?? u.price), Number(u.q ?? u.qty)]).slice(0, 15);
      const asks = (d.a || d.asks || []).reverse().map(u => [Number(u.p ?? u.price), Number(u.q ?? u.qty)]).slice(0, 15);

      const orderbook_item = {
        symbol: process.env.SYMBOL ?? "KRW-BTC",
        exchange_no: this.market_no,
        exchange_name: this.name,
        bid: bids,
        ask: asks,
        marketAt: marketAt,
        coollectorAt: coollectorAt,
        diff_ms: (coollectorAt - marketAt) / 1000,
      };
      // 타임아웃 보호: 10초 내에 완료되지 않으면 경고만 하고 계속 진행
      try {
        await Promise.race([
          SendToOrderBook_ZMQ(orderbook_item, raw.toString()),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('SendToOrderBook_ZMQ timeout')), 10000)
          )
        ]);
      } catch (timeoutError) {
        // 타임아웃 발생 시 경고만 로깅하고 계속 진행 (메시지 손실 방지)
        if (timeoutError.message.includes('timeout')) {
          logger.warn({ ex: this.name, err: String(timeoutError) }, "ZMQ send timeout (continuing)");
        } else {
          // 다른 에러는 다시 throw
          throw timeoutError;
        }
      }
      if (cb && typeof cb === 'function') {
        cb(this.market_no, normalize(bids, asks));
      }
    } else {

    }
  }
  start(cb) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const sub = {
        request_type: "SUBSCRIBE",
        channel: "ORDERBOOK",
        topic: { quote_currency: this.qc, target_currency: this.tc },
        format: "SHORT",
      };
      this.ws.send(JSON.stringify(sub));
      logger.info({ ex: this.name, msg: "subscribed", qc: this.qc, tc: this.tc });

      // 권장: 주기적 PING
      this.pingInterval = setInterval(() => {
        try { 
          this.ws?.send(JSON.stringify({ request_type: "PING" })); 
        } catch {}
      }, 20 * 60 * 1000);
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} OrderBook-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name,`${this.name} OrderBook-Collector WebSocket opened (initial connect).`, false);
      }
      this._reconnecting = false;
      this._closeNotified = false;
    });
    this.ws.on("message", (raw) => {
      try {
        // 큐에 메시지 추가
        this.enqueue(raw);
        // 디버깅: 큐에 메시지가 추가되었는지 확인
        if (this.queue.length % 100 === 0) {
          logger.debug({ ex: this.name, queueSize: this.queue.length }, "messages enqueued");
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "queue enqueue error");
      }
    });

    // 큐 처리 시작
    this.queueProcessInterval = setInterval(() => {
      this.processQueue(cb).catch(e => {
        logger.error({ ex: this.name, err: String(e), stack: e.stack }, "queue process interval error");
        // 에러 발생 시에도 queueProcessing 플래그 리셋
        this.queueProcessing = false;
      });
    }, OPTIMAL_PROCESS_INTERVAL);

    this.ws.on("close", () => {
      // 큐 처리 중지
      if (this.queueProcessInterval) {
        clearInterval(this.queueProcessInterval);
        this.queueProcessInterval = null;
      }
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      this._reconnecting = true;
      setTimeout(() => this.start(cb), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => { 
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage(this.name, `${this.name} WebSocket error: ${String(e)}`);
    });
  }
}

// OrderBook에 데이터를 전송하는 함수
async function SendToOrderBook_ZMQ(orderbook_item, raw = null) {
  const topic = `${orderbook_item.exchange_no}/${orderbook_item.symbol}`;
  const ts = Date.now();

  const raw_orderbook_item = { ...orderbook_item };
  raw_orderbook_item.raw = raw;

  await Promise.all([
    send_push(topic, ts, orderbook_item),
    send_publisher(raw_orderbook_item.symbol, raw_orderbook_item)
  ]);
}
/** ------------------- 실행부 ------------------- */

// 스냅샷 수신 → 역전 제외 포함한 시간가중 누적(개별/집계)
let clients = [];

// 클라이언트 초기화 및 시작 함수
function initializeClients() {
  if (clients.length > 0) {
    // 이미 초기화된 경우 스킵
    logger.info("clients already initialized");
    return;    
  }

  try {
    logger.info("DB connected, initializeClients start");

    // 큐 설정 로깅
    logQueueConfiguration();

    clients = [
      new UpbitClient("KRW-BTC"),
      // new BithumbClient("KRW-BTC"),
      // new KorbitClient("btc_krw"),
      // new CoinoneClient("KRW", "BTC"),
    ];

    logger.info(`Created ${clients.length} clients`);

    clients.forEach(c => {
      try {
        c.start((name, bookStd) => onSnapshot(name, bookStd));
        logger.info(`Started client: ${c.name}`);
      } catch (err) {
        logger.error({ err: String(err), stack: err.stack, client: c.name }, "Failed to start client");
        throw err; // 클라이언트 시작 실패는 치명적
      }
    });
    
    // 인터벌 시작
    startIntervals();
    
    // 일일 리포트 스케줄러 시작
    scheduleDailyReport();
    
    logger.info("All clients initialized and started");
  } catch (error) {
    logger.error({ err: String(error), stack: error.stack }, "Failed to initialize clients");
    // 에러를 다시 throw하여 app.js에서 처리할 수 있도록
    throw error;
  }
}

// 1초마다 각 거래소별 처리 건수 계산 및 평균 계산
let statsInterval = null;
let monitorInterval = null;
let tickInterval = null;

function startIntervals() {
  if (statsInterval || clients.length === 0) {
    logger.warn("startIntervals: Already started or no clients available");
    return; // 이미 시작된 경우 또는 클라이언트가 없으면 스킵
  }

  logger.info("Starting intervals (stats, monitor, tick)");
  
  try {
    statsInterval = setInterval(() => {
    if (clients.length === 0) return; // 클라이언트가 없으면 스킵
    clients.forEach(client => {
    const now = Date.now();
    const timeSinceLastSecond = now - client.queueStats.lastSecondTime;
    
    if (timeSinceLastSecond >= 1000) {
      const processedInLastSecond = client.queueStats.totalProcessed - client.queueStats.lastSecondProcessedCount;
      client.queueStats.processedPerSecond = processedInLastSecond;
      client.queueStats.lastSecondProcessedCount = client.queueStats.totalProcessed;
      client.queueStats.lastSecondTime = now;
      
      // 1초당 처리 건수 히스토리에 추가 (최근 30개 유지)
      client.queueStats.processedPerSecondHistory.push(processedInLastSecond);
      if (client.queueStats.processedPerSecondHistory.length > ( QUEUE_MONITOR_INTERVAL / 1000 )) {
        client.queueStats.processedPerSecondHistory.shift();
      }
      
      // 1초 안에 가장 크게 처리한 수량 업데이트
      if (processedInLastSecond > client.queueStats.maxProcessedPerSecond) {
        client.queueStats.maxProcessedPerSecond = processedInLastSecond;
      }
      
      // 1초당 평균 큐 처리 개수 계산
      if (client.queueStats.processedPerSecondHistory.length > 0) {
        const sum = client.queueStats.processedPerSecondHistory.reduce((a, b) => a + b, 0);
        client.queueStats.avgProcessedPerSecond = sum / client.queueStats.processedPerSecondHistory.length;
      }
    }
    });
  }, 1000); // 1초마다 실행

  // 30초마다 큐 상태 리포트 전송
  monitorInterval = setInterval(() => {
    if (clients.length === 0) return; // 클라이언트가 없으면 스킵
    try {
      const report = generateQueueReport(clients);
      sendTelegramMessageQueue("QueueMonitor", report, true);
      // logger.info("Queue status report sent to Telegram", report);
    } catch (e) {
      logger.error({ err: String(e) }, "queue monitoring error");
    }
  }, QUEUE_MONITOR_INTERVAL);

  // 1초마다 창 닫고 보고
  tickInterval = setInterval(() => {
  const now = Date.now();

  // 개별
  for (const exchange_no of Object.keys(exchAcc).map(Number)) {    
    accumulate(exchAcc[exchange_no], now); // 창 끝까지 Δt 반영
    const rep = reportTW(exchAcc[exchange_no]); // 역전/데이터 없음이면 null
    if (rep) {

      const orderbook_item = {
        exchange_no: exchange_no,
        exchange_name: Object.keys(MARKET_NAME_ENUM).find(key => MARKET_NO_ENUM[key] === exchange_no) || exchange_no,
        bid:  Number(rep.buy.toFixed(2)),
        ask: Number(rep.sell.toFixed(2)),
        mid:  Number(rep.mid.toFixed(2)),
        createdAt: new Date(now),
      };
    }
    resetSums(exchAcc[exchange_no]);      // 누적만 리셋
    exchAcc[exchange_no].lastTs = now;    // 기준시각 갱신
  }

  // 집계
  accumulate(aggAcc, now);
  const aggRep = reportTW(aggAcc);
  if (aggRep) {
    const sources = Object.keys(latestBook).filter(k => latestBook[k]);

    const orderbook_item = {
      exchange_no: 999,
      exchange_name: "aggregate",
      bid:  Number(aggRep.buy.toFixed(2)),
      ask: Number(aggRep.sell.toFixed(2)),
      mid:  Number(aggRep.mid.toFixed(2)),
      createdAt: new Date(now),
      sources,
    };
  }

    resetSums(aggAcc);
    aggAcc.lastTs = now; // 기준시각 갱신
  }, TICK_MS);
  
    logger.info("All intervals started successfully");
  } catch (error) {
    logger.error({ err: String(error), stack: error.stack }, "Failed to start intervals");
    throw error;
  }
}

// 매일 00:00:00에 일일 통계 출력 및 리셋
function scheduleDailyReport() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  // 첫 실행은 자정까지 남은 시간 후에
  setTimeout(async () => {
    // 클라이언트가 초기화되지 않았으면 스킵
    if (!clients || clients.length === 0) {
      logger.warn("scheduleDailyReport: clients not initialized, rescheduling...");
      scheduleDailyReport(); // 다시 스케줄링
      return;
    }
    
    // 일일 통계 출력
    const dailyStats = clients.map(client => ({
      exchange: client.name,
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD 형식
      dailyProcessed: client.queueStats.dailyProcessed,
      maxProcessedPerSecond: client.queueStats.maxProcessedPerSecond
    }));
    
    logger.info(JSON.stringify({
      type: "daily_queue_statistics",
      timestamp: new Date().toISOString(),
      exchanges: dailyStats
    }, null, 2));

    try {
      if (db && db.sequelize) {
        await db.sequelize.query(
          `INSERT INTO tb_report (title, content, createdAt) VALUES (?, ?, ?)`,
          {
            replacements: [
              'orderbook-collector',
              JSON.stringify({
                type: "interval_queue_statistics",
                timestamp: new Date().toISOString(),
                exchanges: dailyStats
              }),
              Date.now() // Unix timestamp (밀리초)
            ]
          }
        );
      } else {
        // sequelize 인스턴스를 못 찾을 경우 경고
        logger.warn("[tb_report] Unable to insert report: missing sequelize instance.");
      }
    } catch (err) {
      logger.error("[tb_report] insert error", err);
    }    
    
    // 통계 리셋
    clients.forEach(client => {
      client.queueStats.dailyProcessed = 0;
      client.queueStats.maxProcessedPerSecond = 0;
      client.queueStats.lastResetDate = new Date().toDateString();
    });
    
    // 다음 자정까지 스케줄링 (24시간 후)
    scheduleDailyReport();
  }, msUntilMidnight);
}

// Export the client classes and initialization function
module.exports = {
  initializeClients
};