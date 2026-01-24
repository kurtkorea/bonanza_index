"use strict";

/**
 * 국내 4대 거래소(업비트/빗썸/코빗/코인원)  => 거래소를 flexable 하게 처리 할수 있도록 DAYFIN쪽 참조.
 * - depth: 15
 * - 목표수량 Q 실행평단(매수/매도, mid)을 스냅샷마다 계산
 * - 시간가중(TW) 누적, 호가 역전(베스트 매수 > 베스트 매도) 제외 
 * - 개별 거래소 & 집계 모두 동일 규칙
 */

const WebSocket = require("ws");
const {
  RECONNECT_INTERVAL,
  PING_INTERVAL,
} = require("../utils/common.js");
const { send_push, getZMQStatus } = require("../utils/zmq-sender-push.js");
// const { send_publisher } = require("../utils/zmq-sender-pub.js");
const {
  sendTelegramMessage,
  sendTelegramMessageQueue,
} = require("../utils/telegram_push.js");
const { generateQueueReport } = require("../utils/report.js");
const logger = require("../utils/logger.js");
const { quest_db } = require("../db/quest_db.js");
const { isJsonValue } = require("../utils/common.js");
const { redisManager } = require("../redis.js");

// 리더십 상태 확인 함수 (leader-status 모듈에서 import)
const { isLeader: isLeaderFunction } = require("../utils/leader-status.js");

// ===== 설정 =====
const DEPTH = 15;
const QUEUE_MAX_SIZE = Number(process.env.WS_QUEUE_MAX_SIZE || 50000);
const QUEUE_PROCESS_INTERVAL = Number(process.env.WS_QUEUE_PROCESS_INTERVAL || 20);
const QUEUE_BATCH_SIZE = Number(process.env.WS_QUEUE_BATCH_SIZE || 50);
const QUEUE_MONITOR_INTERVAL = Number(process.env.WS_QUEUE_MONITOR_INTERVAL || 600000);
// CPU 코어 수 설정 (환경 변수 우선, 없으면 시스템 값 사용)
// 주의: Kubernetes 컨테이너에서는 CPU limits를 고려하여 환경 변수로 명시적 설정 권장
const CPU_CORES = Math.max(
  0.5, // 최소값: 0.5 CPU (컨테이너 환경 고려)
  Number(process.env.CPU_CORES || require("os").cpus().length)
);

const OPTIMAL_BATCH_SIZE = Math.max(
  50, // 최소 배치 크기를 50으로 증가 (기존 10)
  Math.min(QUEUE_BATCH_SIZE, Math.floor(CPU_CORES * 50)) // CPU 코어당 배치 크기 증가 (기존 25 -> 50)
);
const OPTIMAL_PROCESS_INTERVAL = Math.max(
  5, // 최소 간격을 5ms로 줄임 (기존 10ms)
  Math.floor((QUEUE_PROCESS_INTERVAL * 2) / Math.max(0.5, CPU_CORES)) // 최소 0.5 CPU 가정
);

const COLLECTOR_ROLE = process.env.COLLECTOR_ROLE || "primary";

// ZMQ 전송 timeout 설정 (밀리초, 기본값: 2000ms)
const ZMQ_SEND_TIMEOUT = Number(process.env.ZMQ_SEND_TIMEOUT || 2000);

// 큐 설정 로깅
function logQueueConfiguration() {
  const config = {
    cpuCores: CPU_CORES,
    queueMaxSize: QUEUE_MAX_SIZE,
    queueBatchSize: QUEUE_BATCH_SIZE,
    optimalBatchSize: OPTIMAL_BATCH_SIZE,
    queueProcessInterval: QUEUE_PROCESS_INTERVAL,
    optimalProcessInterval: OPTIMAL_PROCESS_INTERVAL,
    queueMonitorInterval: QUEUE_MONITOR_INTERVAL,
  };
  logger.info(
    "Customized queue configuration for CPU cores\n" +
    JSON.stringify(config, null, 2)
  );
}

// ===== 유틸 =====
const toNum = (x) => (typeof x === "string" ? Number(x) : x);

function normalize(bids, asks) {
  const nb = bids
    .map(([p, q]) => ({ price: toNum(p), qty: toNum(q) }))
    .filter((x) => x.qty > 0)
    .sort((a, b) => b.price - a.price)
    .slice(0, DEPTH);

  const na = asks
    .map(([p, q]) => ({ price: toNum(p), qty: toNum(q) }))
    .filter((x) => x.qty > 0)
    .sort((a, b) => a.price - b.price)
    .slice(0, DEPTH);

  return { bids: nb, asks: na };
}

// ------------------- 거래소 WS 클라이언트 -------------------

class WebSocketBroker {
  constructor(process_info) {
    console.log("process_info", process_info);
    this.websocket = null;
    this.exchange_nm = process_info.exchange_nm;
    this.exchange_cd = process_info.exchange_cd;
    this.wss_url = process_info.wss_url;
    this.api_url = process_info.api_url;
    this._reconnecting = false;
    this._closeNotified = false;
    this.pingInterval = null;
    this.queue = [];
    this.queueProcessing = false;
    this.queueProcessInterval = null;
    this.queueMaxSize = QUEUE_MAX_SIZE;
    this.queueDropped = 0;
    this.queueStats = this._initQueueStats();
    this.symbols = new Map();
  }

  addSymbol(process_info) {
    let symbol_item = {
      symbol: "",
      price_id_cd: "",
      product_id_cd: "",
      price_id: "",
      product_id: "",
      subscribe_symbol: "",
    };

    if (this.exchange_cd === "E0010001") {
      symbol_item.subscribe_symbol = `${process_info.price_id_cd}-${process_info.product_id_cd}`;
    } else if (this.exchange_cd === "E0020001") {
      symbol_item.subscribe_symbol = `${process_info.price_id_cd}-${process_info.product_id_cd}`;
    } else if (this.exchange_cd === "E0030001") {
      symbol_item.subscribe_symbol = `${process_info.price_id_cd}-${process_info.product_id_cd}`;
    } else if (this.exchange_cd === "E0050001") {
      symbol_item.subscribe_symbol = `${process_info.product_id_cd}_${process_info.price_id_cd}`;
      symbol_item.subscribe_symbol = symbol_item.subscribe_symbol.toLowerCase();
    } else if (this.exchange_cd === "E0080001") {
      symbol_item.subscribe_symbol = `${process_info.product_id_cd}-${process_info.price_id_cd}`;
    }

    if (!this.symbols.has(symbol_item.subscribe_symbol)) {
      symbol_item.symbol = `${process_info.price_id_cd}-${process_info.product_id_cd}`;
      symbol_item.price_id_cd = process_info.price_id_cd;
      symbol_item.product_id_cd = process_info.product_id_cd;
      symbol_item.price_id = process_info.price_id;
      symbol_item.product_id = process_info.product_id;
      this.symbols.set(symbol_item.subscribe_symbol, symbol_item);
    }
  }

  _initQueueStats() {
    return {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalDropped: 0,
      maxQueueSize: 0,
      avgProcessingTime: 0,
      lastProcessingTime: 0,
      processingTimes: [],
      lastReportTime: Date.now(),
      lastProcessedCount: 0,
      lastMessagesPerSecond: 0,
      processedPerSecond: 0,
      lastSecondProcessedCount: 0,
      lastSecondTime: Date.now(),
      processedPerSecondHistory: [],
      avgProcessedPerSecond: 0,
      dailyProcessed: 0,
      maxProcessedPerSecond: 0,
      lastResetDate: new Date().toDateString(),
    };
  }

  enqueue(message) {
    this.queueStats.totalEnqueued++;
    const wasFull = this.queue.length >= this.queueMaxSize;
    if (wasFull) {
      this.queue.shift();
      this.queueDropped++;
      this.queueStats.totalDropped++;
      if (this.queueDropped % 100 === 0) {
        logger.warn(
          { ex: this.exchange_nm, dropped: this.queueDropped, queueSize: this.queue.length },
          "queue overflow, messages dropped"
        );
      }
    }
    this.queue.push({ message, enqueuedAt: Date.now() });
    if (this.queue.length > this.queueStats.maxQueueSize) {
      this.queueStats.maxQueueSize = this.queue.length;
    }
    
    // 큐가 80% 이상 찰 때 즉시 처리 시도 (드롭 방지)
    const queueUsagePercent = (this.queue.length / this.queueMaxSize) * 100;
    if (queueUsagePercent > 80 && !this.queueProcessing) {
      // 비동기로 처리 (블로킹 방지)
      setImmediate(() => {
        this.processQueue().catch((e) => {
          logger.error(
            { ex: this.exchange_nm, err: String(e) },
            "immediate queue process error"
          );
        });
      });
    }
  }

  async processQueue(cb) {
    if (this.queueProcessing || this.queue.length === 0) return;
    
    // 리더가 아닌 경우 큐 처리를 건너뛰고 큐에 데이터를 쌓아둠
    const isCurrentlyLeader = isLeaderFunction && isLeaderFunction();
    if (!isCurrentlyLeader) {
      // 팔로워일 때는 큐에 데이터를 쌓아두기만 함 (처리하지 않음)
      // 큐가 가득 차면 오래된 데이터를 삭제
      if (this.queue.length >= this.queueMaxSize) {
        // 주기적으로 로그를 남기지 않도록 빈도 제한
        if (this.queueDropped % 1000 === 0) {
          logger.warn({
            ex: this.exchange_nm,
            queueSize: this.queue.length,
            queueMaxSize: this.queueMaxSize,
            totalDropped: this.queueDropped,
            isLeaderFunction: !!isLeaderFunction,
            isLeader: isLeaderFunction ? isLeaderFunction() : false
          }, '[WebSocketBroker] 팔로워 모드: 큐가 가득 참 (오래된 데이터 삭제됨)');
        }
      }
      return;
    }
    
    // 리더일 때만 큐 처리
    this.queueProcessing = true;
    const batchStartTime = Date.now();
    let processedInBatch = 0;
    
    // 큐가 가득 찰 때는 배치 크기를 늘려서 더 빠르게 처리
    const queueUsagePercent = (this.queue.length / this.queueMaxSize) * 100;
    const dynamicBatchSize = queueUsagePercent > 80 
      ? Math.min(OPTIMAL_BATCH_SIZE * 2, Math.floor(this.queue.length * 0.1))
      : OPTIMAL_BATCH_SIZE;
    
    try {
      while (
        this.queue.length > 0 &&
        processedInBatch < dynamicBatchSize
      ) {
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
          // 평균 처리 시간
          if (this.queueStats.processingTimes.length > 0) {
            const sum = this.queueStats.processingTimes.reduce(
              (a, b) => a + b,
              0
            );
            this.queueStats.avgProcessingTime = Math.round(
              sum / this.queueStats.processingTimes.length
            );
          }
          processedInBatch++;
        } catch (e) {
          logger.error(
            { ex: this.exchange_nm, err: String(e), stack: e.stack },
            "queue processing error"
          );
        }
      }
      // 초당 처리 건수 계산
      if (processedInBatch > 0) {
        const batchElapsedTime = Date.now() - batchStartTime;
        const batchElapsedSeconds = Math.max(batchElapsedTime / 1000, 0.001);
        let messagesPerSecond = parseFloat(
          (processedInBatch / batchElapsedSeconds).toFixed(2)
        );
        if (!isFinite(messagesPerSecond) || isNaN(messagesPerSecond))
          messagesPerSecond = 0;
        if (messagesPerSecond > 100000) messagesPerSecond = 100000;
        this.queueStats.lastMessagesPerSecond = messagesPerSecond;
      }
    } finally {
      this.queueProcessing = false;
    }
  }

  getQueueStats() {
    const now = Date.now();
    const sinceLastReport = now - this.queueStats.lastReportTime;
    const lastCount = this.queueStats.lastProcessedCount || 0;
    const processedSince = this.queueStats.totalProcessed - lastCount;

    let processingRate = "0.00";
    if (sinceLastReport >= 1000 && processedSince > 0) {
      processingRate = (
        processedSince /
        (sinceLastReport / 1000)
      ).toFixed(2);
    } else if (this.queueStats.processedPerSecond > 0) {
      processingRate = this.queueStats.processedPerSecond.toFixed(2);
    } else if (
      this.queueStats.totalProcessed > 0 &&
      sinceLastReport > 0
    ) {
      processingRate = (
        this.queueStats.totalProcessed /
        (sinceLastReport / 1000)
      ).toFixed(2);
    }

    const queueUsagePercent = (
      (this.queue.length / this.queueMaxSize) *
      100
    ).toFixed(1);

    return {
      exchange: this.exchange_nm,
      queueSize: this.queue.length,
      queueMaxSize: this.queueMaxSize,
      queueUsagePercent: `${queueUsagePercent}%`,
      totalEnqueued: this.queueStats.totalEnqueued,
      totalProcessed: this.queueStats.totalProcessed,
      totalDropped: this.queueStats.totalDropped,
      maxQueueSize: this.queueStats.maxQueueSize,
      avgProcessingTime: `${this.queueStats.avgProcessingTime}ms`,
      lastProcessingTime: `${this.queueStats.lastProcessingTime}ms`,
      processingRate: `${processingRate} msg/s`,
      lastMessagesPerSecond: this.queueStats.lastMessagesPerSecond || 0,
      processedPerSecond: this.queueStats.processedPerSecond || 0,
      avgProcessedPerSecond: this.queueStats.avgProcessedPerSecond || 0,
      lastReportTime: this.queueStats.lastReportTime,
      isProcessing: this.queueProcessing,
      isConnected:
        this.websocket && this.websocket.readyState === WebSocket.OPEN,
    };
  }

  snapshotStats() {
    this.queueStats.lastProcessedCount = this.queueStats.totalProcessed;
    this.queueStats.lastReportTime = Date.now();
  }

  async handleMessage(raw, cb) {
    try {
      const payload = raw.toString();

      if (!isJsonValue(payload)) {
        // logger.warn({ exchange_nm: this.exchange_nm, payload }, "Skipping non-JSON message");
        return;
      }

      const msg = JSON.parse(payload);
      const bidsAsks = await this._parseOrderbookMessage(msg);
      if (bidsAsks) {
        const { bids, asks, orderbook_item } = bidsAsks;
        // orderbook_item이 유효한지 확인
        if (!orderbook_item || !orderbook_item.exchange_cd || !orderbook_item.symbol) {
          logger.warn(
            {
              ex: this.exchange_nm,
              orderbook_item: orderbook_item ? {
                exchange_cd: orderbook_item.exchange_cd,
                symbol: orderbook_item.symbol,
                hasBids: !!orderbook_item.bid,
                hasAsks: !!orderbook_item.ask
              } : null,
              bidsLength: bids?.length,
              asksLength: asks?.length
            },
            "Invalid orderbook_item, skipping ZMQ send"
          );
          return;
        }

        // 리더십 확인: 리더일 때만 ZMQ 전송
        const isCurrentlyLeader = isLeaderFunction && isLeaderFunction();
        
        if (isCurrentlyLeader) {
          try {
            await Promise.race([
              SendToOrderBook_ZMQ(orderbook_item, payload),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error("SendToOrderBook_ZMQ timeout")),
                  ZMQ_SEND_TIMEOUT
                )
              ),
            ]);
          } catch (timeoutError) {
            if (timeoutError.message.includes("timeout")) {
              // ZMQ 큐 상태 확인
              const zmqStatus = getZMQStatus();
              const queueInfo = zmqStatus.queueStatus 
                ? `큐: ${zmqStatus.queueStatus.queueLength}/${zmqStatus.queueStatus.maxQueueSize} (${zmqStatus.queueStatus.queueUsagePercent}%)`
                : '큐 상태 확인 불가';
              
              logger.warn(
                { 
                  ex: this.exchange_nm, 
                  err: String(timeoutError),
                  zmqStatus: zmqStatus,
                  queueInfo: queueInfo,
                  timeout: ZMQ_SEND_TIMEOUT
                },
                `ZMQ send timeout (continuing) - ${queueInfo}`
              );
            } else {
              throw timeoutError;
            }
          }
        } else {
          // 리더가 아닌 경우 ZMQ 전송하지 않음 (데이터는 큐에 계속 저장됨)
          // 주기적으로 로그를 남기지 않도록 주석 처리
          // logger.debug(
          //   { ex: this.exchange_nm, symbol: orderbook_item.symbol },
          //   "Not leader, skipping ZMQ send (data queued)"
          // );
        }

        if (cb && typeof cb === "function")
          cb(this.market_no, normalize(bids, asks));
      }
    } catch (e) {
      logger.error(
        { ex: this.exchange_nm, err: String(e), stack: e.stack },
        "handleMessage error"
      );
      throw e;
    }
  }

  async _parseOrderbookMessage(msg) {

    let typeRaw =
      msg?.ty || msg?.type || msg?.c || msg?.channel || msg?.n;

    const isOrderbookMsg =
      typeRaw === "orderbook" ||
      typeRaw === "ORDERBOOK" ||
      typeRaw === "SubscribeToOrderBook" ||
      typeRaw === "OrderBookEvent";

    if (msg?.response_type == "SUBSCRIBED") {
      console.log("isOrderbookMsg", this.exchange_nm, msg);
      return null;
    }

    if (!isOrderbookMsg) {
      // console.log("isOrderbookMsg", this.exchange_nm, msg);
      return null;
    }

    let bids = [],
      asks = [],
      orderbook_item = {
        symbol: "",
        subscribe_symbol: "",
        exchange_cd: this.exchange_cd,
        exchange_nm: this.exchange_nm,
        bid: [],
        ask: [],
        ts: 0,
        collectorAt: 0,
        diff_ms: 0,
      };

    const now = Date.now();
    // 업비트
    if (this.exchange_cd === "E0010001") {
      const ts = msg.tms;
      const units = msg?.obu || msg?.orderbook_units || [];
      const symbol = msg?.cd || msg?.code;
      
      bids = units.slice(0, DEPTH)
        .map((u) => [toNum(u.bp ?? u.bid_price), toNum(u.bs ?? u.bid_size)])
        .filter(([price, qty]) => qty > 0 && price > 0);
      asks = units.slice(0, DEPTH)
        .map((u) => [toNum(u.ap ?? u.ask_price), toNum(u.as ?? u.ask_size)])
        .filter(([price, qty]) => qty > 0 && price > 0);

      const symbol_item = this.symbols.get(symbol);
      if (symbol_item != null) {
        orderbook_item = {
          symbol: symbol_item.symbol,
          subscribe_symbol: symbol_item.subscribe_symbol,
          exchange_cd: this.exchange_cd,
          exchange_nm: this.exchange_nm,
          price_id: symbol_item.price_id,
          product_id: symbol_item.product_id,
          ts: ts,
          bid: bids,
          ask: asks,
        };
      } else {
        // symbol_item이 null이면 유효한 orderbook_item을 만들 수 없으므로 null 반환
        logger.debug({ ex: this.exchange_nm, symbol }, "symbol_item not found, returning null");
        return null;
      }
      // console.log(this.exchange_cd, this.exchange_nm, orderbook_item);
    }
    // 빗썸
    else if (this.exchange_cd === "E0020001") {
      const ts = parseInt(msg.tms / 1000);
      const units = msg?.obu || msg?.orderbook_units || [];
      const symbol = msg?.cd || msg?.code;

      bids = units.slice(0, DEPTH)
        .map((u) => [toNum(u.bp ?? u.bid_price), toNum(u.bs ?? u.bid_size)])
        .filter(([price, qty]) => qty > 0 && price > 0);
      asks = units.slice(0, DEPTH)
        .map((u) => [toNum(u.ap ?? u.ask_price), toNum(u.as ?? u.ask_size)])
        .filter(([price, qty]) => qty > 0 && price > 0);

      const symbol_item = this.symbols.get(symbol);
      if (symbol_item != null) {
        orderbook_item = {
          symbol: symbol_item.symbol,
          subscribe_symbol: symbol_item.subscribe_symbol,
          exchange_cd: this.exchange_cd,
          exchange_nm: this.exchange_nm,
          price_id: symbol_item.price_id,
          product_id: symbol_item.product_id,
          ts: ts,
          bid: bids,
          ask: asks,
        };
        // console.log(this.exchange_cd, this.exchange_nm, orderbook_item);
      } else {
        logger.debug({ ex: this.exchange_nm, symbol }, "symbol_item not found, returning null");
        return null;
      }
    }
    // 코인원
    else if (this.exchange_cd === "E0030001") {
      const d = msg.d || msg.data;
      if (!d) return null;
      const ts = d.t;
      const symbol = `${d.qc}-${d.tc}`;

      bids = (d.b || d.bids || [])
        .map((u) => [Number(u.p ?? u.price), Number(u.q ?? u.qty)])
        .filter(([price, qty]) => qty > 0 && price > 0)
        .slice(0, DEPTH);
      asks = (d.a || d.asks || [])
        .reverse()
        .map((u) => [Number(u.p ?? u.price), Number(u.q ?? u.qty)])
        .filter(([price, qty]) => qty > 0 && price > 0)
        .slice(0, DEPTH);

      const symbol_item = this.symbols.get(symbol);
      if (symbol_item != null) {
        orderbook_item = {
          symbol: symbol_item.symbol,
          subscribe_symbol: symbol_item.subscribe_symbol,
          exchange_cd: this.exchange_cd,
          exchange_nm: this.exchange_nm,
          price_id: symbol_item.price_id,
          product_id: symbol_item.product_id,
          ts: ts,
          bid: bids,
          ask: asks,
        };

      } else {
        logger.debug({ ex: this.exchange_nm, symbol }, "symbol_item not found, returning null");
        return null;
      }
    }
    // 코빗
    else if (this.exchange_cd === "E0050001") {
      const ts = msg.timestamp;
      const symbol = msg.symbol;

      bids = (msg.data?.bids || [])
        .map((x) => [Number(x.price), Number(x.qty)])
        .filter(([price, qty]) => qty > 0 && price > 0)
        .slice(0, DEPTH);
      asks = (msg.data?.asks || [])
        .map((x) => [Number(x.price), Number(x.qty)])
        .filter(([price, qty]) => qty > 0 && price > 0)
        .slice(0, DEPTH);

      const symbol_item = this.symbols.get(symbol);
      if (symbol_item != null) {
        orderbook_item = {
          symbol: symbol_item.symbol,
          subscribe_symbol: symbol_item.subscribe_symbol,
          exchange_cd: this.exchange_cd,
          exchange_nm: this.exchange_nm,
          price_id: symbol_item.price_id,
          product_id: symbol_item.product_id,
          ts: ts,
          bid: bids,
          ask: asks,
        };
        // console.log(this.exchange_cd, this.exchange_nm, orderbook_item);
      } else {
        logger.debug({ ex: this.exchange_nm, symbol }, "symbol_item not found, returning null");
        return null;
      }
    }
    // 고팍스
    else if (this.exchange_cd === "E0080001") {
      const ts = now;
      const symbol = msg.o?.tradingPairName;

      bids = (msg.o?.bid || [])
        .map((x) => [Number(x.price), Number(x.volume)])
        .filter(([price, qty]) => qty > 0 && price > 0)
        .slice(0, DEPTH);
      asks = (msg.o?.ask || [])
        .map((x) => [Number(x.price), Number(x.volume)])
        .filter(([price, qty]) => qty > 0 && price > 0)
        .slice(0, DEPTH);

      const symbol_item = this.symbols.get(symbol);
      if (symbol_item != null) {
        orderbook_item = {
          symbol: symbol_item.symbol,
          subscribe_symbol: symbol_item.subscribe_symbol,
          exchange_cd: this.exchange_cd,
          exchange_nm: this.exchange_nm,
          price_id: symbol_item.price_id,
          product_id: symbol_item.product_id,
          ts: ts,
          bid: bids,
          ask: asks,
        };
        // console.log(this.exchange_cd, this.exchange_nm, orderbook_item);
      } else {
        logger.debug({ ex: this.exchange_nm, symbol }, "symbol_item not found, returning null");
        return null;
      }
    } else {
      return null;
    }
    // orderbook_item이 유효한지 확인 (symbol이 비어있으면 유효하지 않음)
    // if (!orderbook_item || !orderbook_item.symbol || !orderbook_item.exchange_cd) {
    //   console.log("orderbook_item!!!", this.exchange_nm, msg);
    //   return null;
    // }

    if ( orderbook_item.bid.length != DEPTH || orderbook_item.ask.length != DEPTH) {
      // console.log("CHECK DEPTH LENGTH", this.exchange_nm, orderbook_item.bid.length, orderbook_item.ask.length);
      // return null;
    }

    return { bids, asks, orderbook_item };
  }

  /**
   * WebSocket이 열린 후 구독 메시지 전송
   */
  _subscribeToOrderbook() {
    // WebSocket이 OPEN 상태인지 확인
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      logger.warn({
        ex: this.exchange_nm,
        readyState: this.websocket?.readyState
      }, "WebSocket이 OPEN 상태가 아닙니다. 구독 메시지를 보낼 수 없습니다.");
      return;
    }

    try {
      if (this.exchange_cd === "E0010001") {
        // 업비트 OK 
        let sub_symbols = [];
        for (const symbol_item of this.symbols.values()) {
          sub_symbols.push(symbol_item.subscribe_symbol);
        }
        console.log("sub_symbols", sub_symbols);
        let sub = [
          { ticket: "bonanza-orderbook" },
          { type: "orderbook", codes: sub_symbols },
          { format: "SIMPLE" },
        ];
        this.websocket.send(Buffer.from(JSON.stringify(sub), "utf8"));
        logger.info({
          ex: this.exchange_nm,
          msg: "subscribed",
          sub: sub,
        });
      } else if (this.exchange_cd === "E0020001") {
        // 빗썸 OK
        let sub_symbols = [];
        for (const symbol_item of this.symbols.values()) {
          sub_symbols.push(symbol_item.subscribe_symbol);
        }
        let sub = [
          { ticket: "execavg-tw" },
          { type: "orderbook", codes: sub_symbols },
          { format: "SIMPLE" },
        ];
        this.websocket.send(Buffer.from(JSON.stringify(sub), "utf8"));
        logger.info({
          ex: this.exchange_nm,
          msg: "subscribed",
          sub: sub,
        });
      } else if (this.exchange_cd === "E0030001") {
        // 코인원
        for (const symbol_item of this.symbols.values()) {
          const sub = {
            request_type: "SUBSCRIBE",
            channel: "ORDERBOOK",
            topic: {
              quote_currency: symbol_item.price_id_cd,
              target_currency: symbol_item.product_id_cd,
            },
            format: "SHORT",
          };
          this.websocket.send(JSON.stringify(sub));
          logger.info({
            ex: this.exchange_nm,
            msg: "subscribed",
            sub: sub,
          });
        }
      } else if (this.exchange_cd === "E0050001") {
        // 코빗
        let sub_symbols = [];
        for (const symbol_item of this.symbols.values()) {
          let lower_symbol = `${symbol_item.product_id_cd}_${symbol_item.price_id_cd}`;
          sub_symbols.push(lower_symbol.toLowerCase());
        }
        const sub = [
          {
            method: "subscribe",
            type: "orderbook",
            symbols: sub_symbols,
          },
        ];
        this.websocket.send(JSON.stringify(sub));
        try {
          if (this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send("PING");
          }
        } catch (error) {
          logger.debug({
            ex: this.exchange_nm,
            err: String(error)
          }, "PING 전송 실패");
        }
        logger.info(
          this.exchange_nm + " subscribe\n" + JSON.stringify(sub, null, 2)
        );
      } else if (this.exchange_cd === "E0080001") {
        // 고팍스
        // GOPAX 거래소 오더북 구독 (ws 요청)
        let lastSub = null;
        for (const symbol_item of this.symbols.values()) {
          const subscribe_symbol = `${symbol_item.product_id_cd}-${symbol_item.price_id_cd}`;
          const sub = {
            n: "SubscribeToOrderBook",
            o: { tradingPairName: subscribe_symbol },
          };
          this.websocket.send(JSON.stringify(sub));
          lastSub = sub;
          logger.info({
            ex: this.exchange_nm,
            msg: "subscribed",
            sub: sub,
          });
        }
      }
    } catch (error) {
      logger.error({
        ex: this.exchange_nm,
        err: String(error),
        stack: error.stack
      }, "구독 메시지 전송 중 오류 발생");
    }
  }

  start(client) {
    this.websocket = new WebSocket(this.wss_url);
    this.websocket.on("open", () => {
      // WebSocket이 완전히 열렸는지 확인
      if (this.websocket.readyState !== WebSocket.OPEN) {
        logger.warn({
          ex: this.exchange_nm,
          readyState: this.websocket.readyState
        }, "WebSocket이 아직 열리지 않았습니다. 잠시 후 재시도합니다.");
        
        // 잠시 후 재시도
        setTimeout(() => {
          if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this._subscribeToOrderbook();
          }
        }, 100);
        return;
      }
      
      this._subscribeToOrderbook();
      
      sendTelegramMessage(
        this.exchange_nm,
        `${this.exchange_nm} OrderBook-Collector WebSocket ${this._reconnecting ? "reopened (reconnected)" : "opened (initial connect)."
        }`,
        !this._reconnecting
      );
      this._reconnecting = false;
      this._closeNotified = false;
      this.pingInterval = setInterval(() => {
        try {
          if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            if (this.exchange_cd === "E0010001" || this.exchange_cd === "E0020001"
              || this.exchange_cd === "E0050001" || this.exchange_cd === "E0080001") {
              this.websocket.send("PING");
            } else if (this.exchange_cd === "E0030001") {
              this.websocket.send(JSON.stringify({ request_type: "PING" }));
            }
          }
        } catch (error) {
          logger.debug({
            ex: this.exchange_nm,
            err: String(error)
          }, "PING 전송 실패");
        }
      }, PING_INTERVAL);
    });

    this.websocket.on("message", (raw) => {
      try {
        // console.log("raw", raw);
        this.enqueue(raw);
        if (this.queue.length % 100 === 0) {
          logger.debug(
            { ex: this.exchange_nm, queueSize: this.queue.length },
            "messages enqueued"
          );
        }
      } catch (e) {
        logger.warn(
          { ex: this.exchange_nm, err: String(e) },
          "queue enqueue error"
        );
      }
    });

    this.queueProcessInterval = setInterval(() => {
      this.processQueue(client).catch((e) => {
        logger.error(
          { ex: this.exchange_nm, err: String(e), stack: e.stack },
          "queue process interval error"
        );
        this.queueProcessing = false;
      });
    }, OPTIMAL_PROCESS_INTERVAL);

    this.websocket.on("close", () => {
      if (this.queueProcessInterval) {
        clearInterval(this.queueProcessInterval);
        this.queueProcessInterval = null;
      }
      this._reconnecting = true;
      setTimeout(() => this.start(client), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(
          this.exchange_nm,
          `${this.exchange_nm} WebSocket closed.`
        );
        this._closeNotified = true;
      }
    });

    this.websocket.on("error", (e) => {
      logger.error({ ex: this.exchange_nm, err: String(e) }, "ws error");
      sendTelegramMessage(
        this.exchange_nm,
        `${this.exchange_nm} WebSocket error: ${String(e)}`
      );
    });
  }
}

// OrderBook에 데이터를 전송
async function SendToOrderBook_ZMQ(orderbook_item, raw = null) {
  const topic = `${orderbook_item.exchange_cd}`;
  const ts = Date.now();
  const payload = {
    ...orderbook_item,
    "type": "orderbook",
  };
  await Promise.all([
    send_push(topic, ts, payload),
  ]);
}

// ------------------- 실행부 -------------------
let clients = new Map();

const IndexProcessInfo = require('../models/index_process_info.js');
// 순환 참조 방지를 위해 동적 import 사용

async function refresh_websocket_clients() {
  try {
    logger.info("Refresh start");

    // 기존 클라이언트 정리
    if (clients && clients.size > 0) {
      logger.info(`기존 클라이언트 ${clients.size}개 정리 중...`);
      clients.forEach((client) => {
        try {
          if (client.websocket) {
            client.websocket.close();
          }
        } catch (err) {
          logger.warn({ err: String(err) }, "기존 클라이언트 종료 중 오류 (무시)");
        }
      });
    }
    clients.clear();
    clients = new Map();
    logger.info("Clients cleared");

    // process_id 확인
    if (!global.process_id) {
      logger.error("global.process_id가 설정되지 않았습니다.");
      throw new Error("process_id가 설정되지 않았습니다. PROCESS_ID 환경변수를 확인하세요.");
    }

    logger.info({ process_id: global.process_id }, "[WebSocketBroker] Process info 조회 시작...");
    
    let process_info;
    try {
      process_info = await IndexProcessInfo.getProcessInfo(global.process_id);
      logger.info("[WebSocketBroker] Process info 조회 완료");
    } catch (error) {
      logger.error({
        err: String(error),
        stack: error.stack,
        process_id: global.process_id
      }, "[WebSocketBroker] Process info 조회 실패");
      throw error;
    }
    
    if (process_info) {
      logger.info("[WebSocketBroker] Process info 파싱 시작...");
      let process_info_json;
      try {
        process_info_json = JSON.parse(process_info.process_info);
        logger.info("Process info found:\n" + JSON.stringify(process_info_json, null, 2));
      } catch (parseError) {
        logger.error({
          err: String(parseError),
          process_info: process_info
        }, "[WebSocketBroker] Process info JSON 파싱 실패");
        throw parseError;
      }

      // 병렬적으로 모든 상세 정보를 fetch하고 결과를 모아서 initializeWebsocketClients 실행
      logger.info(`[WebSocketBroker] Process info detail 조회 시작 (총 ${process_info_json.length}개)...`);
      const process_info_detail_list = [];
      for (let idx = 0; idx < process_info_json.length; idx++) {
        const item = process_info_json[idx];
        logger.info(`[WebSocketBroker] Process info [${idx}/${process_info_json.length}]: ${JSON.stringify(item)}`);

        try {
          const process_info_detail = await IndexProcessInfo.getProcessInfoDetail(item.exchange_cd, item.price_id, item.product_id);
          logger.info(`[WebSocketBroker] Process info detail [${idx}]: ${JSON.stringify(process_info_detail, null, 2)}`);
          if (process_info_detail.length > 0) {
            process_info_detail_list.push(process_info_detail[0]);
          }
        } catch (detailError) {
          logger.error({
            err: String(detailError),
            stack: detailError.stack,
            item: item
          }, `[WebSocketBroker] Process info detail [${idx}] 조회 실패`);
          // 개별 실패는 계속 진행
        }
      }

      logger.info(`[WebSocketBroker] 총 ${process_info_detail_list.length}개 detail 수집 완료. WebSocket 클라이언트 초기화 시작...`);
      initializeWebsocketClients(process_info_detail_list);
      logger.info('[WebSocketBroker] WebSocket clients initialized successfully');

      // 순환 참조 방지를 위해 동적 import
      // ZMQ command subscriber는 백그라운드에서 무한 루프로 실행되므로 await하지 않고 Promise로 실행
      logger.info("[WebSocketBroker] ZMQ command subscriber 초기화 시작 (백그라운드 실행)...");
      const { init_zmq_command_subscriber } = require('../utils/zmq-data-sub.js');
      
      // 백그라운드에서 실행 (무한 루프이므로 await하지 않음)
      init_zmq_command_subscriber(global.process_id)
        .then(() => {
          logger.info("[WebSocketBroker] ZMQ Command subscriber가 예상치 못하게 종료되었습니다.");
        })
        .catch((zmqError) => {
          logger.error({
            err: String(zmqError),
            stack: zmqError.stack
          }, "[WebSocketBroker] ZMQ command subscriber 실행 중 오류 발생");
          // 에러가 발생해도 앱이 계속 실행되도록 함 (선택사항)
        });
      
      logger.info("[WebSocketBroker] ZMQ Command subscriber 백그라운드 실행 시작됨 (무한 루프)");
    } else {
      logger.error({ process_id: global.process_id }, "process_info not found. Please check the process_id.");
      throw new Error(`process_info not found for process_id: ${global.process_id}`);
    }
  } catch (error) {
    logger.error({
      err: String(error),
      stack: error.stack,
      process_id: global.process_id
    }, "[WebSocketBroker] refresh_websocket_clients 오류 발생");
    throw error; // 에러를 상위로 전파
  }
}

function initializeWebsocketClients(process_info_detail_list) {
  if (clients.size > 0) {
    logger.info("WebSocket clients already initialized");
    return;
  }

  try {
    logger.info(
      "Database connection has been established successfully, initializeClients start"
    );
    logQueueConfiguration();

    process_info_detail_list.forEach((item) => {
      if (!clients.has(item.exchange_cd)) {
        clients.set(item.exchange_cd, new WebSocketBroker(item));
        clients.get(item.exchange_cd).addSymbol(item);
      } else {
        clients.get(item.exchange_cd).addSymbol(item);
      }
    });

    logger.info(`Created ${clients.size} clients`);
    clients.forEach((client) => {
      try {
        client.start(client);
        logger.info(`Started client: ${client.exchange_nm}`);
      } catch (err) {
        logger.error(
          { err: String(err), stack: err.stack, client: client.exchange_nm },
          "Failed to start client"
        );
        throw err;
      }
    });

    startIntervals();

    logger.info("All clients initialized and started");
  } catch (error) {
    logger.error(
      { err: String(error), stack: error.stack },
      "Failed to initialize clients"
    );
    throw error;
  }
}

// 주기적 인터벌 및 모니터링/리포트
let statsInterval = null;
let monitorInterval = null;

function startIntervals() {
  if (statsInterval || clients.size === 0) {
    logger.warn("startIntervals: Already started or no clients available");
    return;
  }
  logger.info("Starting intervals (stats, monitor, tick)");
  try {
    statsInterval = setInterval(() => {
      if (clients.size === 0) return;
      clients.forEach((client) => {
        const now = Date.now();
        const timeSinceLastSecond = now - client.queueStats.lastSecondTime;
        if (timeSinceLastSecond >= 1000) {
          const processedInLastSecond =
            client.queueStats.totalProcessed -
            client.queueStats.lastSecondProcessedCount;
          client.queueStats.processedPerSecond = processedInLastSecond;
          client.queueStats.lastSecondProcessedCount =
            client.queueStats.totalProcessed;
          client.queueStats.lastSecondTime = now;
          client.queueStats.processedPerSecondHistory.push(
            processedInLastSecond
          );
          if (
            client.queueStats.processedPerSecondHistory.length >
            QUEUE_MONITOR_INTERVAL / 1000
          ) {
            client.queueStats.processedPerSecondHistory.shift();
          }
          if (
            processedInLastSecond > client.queueStats.maxProcessedPerSecond
          ) {
            client.queueStats.maxProcessedPerSecond = processedInLastSecond;
          }
          if (
            client.queueStats.processedPerSecondHistory.length > 0
          ) {
            const sum = client.queueStats.processedPerSecondHistory.reduce(
              (a, b) => a + b,
              0
            );
            client.queueStats.avgProcessedPerSecond =
              sum / client.queueStats.processedPerSecondHistory.length;
          }
        }
      });
    }, 1000);

    monitorInterval = setInterval(() => {
      if (clients.size === 0) return;
      try {
        const report = generateQueueReport(clients, COLLECTOR_ROLE);
        sendTelegramMessageQueue("QueueMonitor", report, true);
      } catch (e) {
        logger.error({ err: String(e) }, "queue monitoring error");
      }
    }, QUEUE_MONITOR_INTERVAL);

    logger.info("All intervals started successfully");
  } catch (error) {
    logger.error(
      { err: String(error), stack: error.stack },
      "Failed to start intervals"
    );
    throw error;
  }
}


/**
 * WebSocket 클라이언트 종료
 */
function stop_websocket_clients() {
  logger.info('[WebSocketBroker] WebSocket 클라이언트 종료 시작');
  
  try {
    if (clients && clients.size > 0) {
      clients.forEach((client) => {
        try {
          if (client.websocket) {
            client.websocket.close();
            logger.info({
              exchange: client.exchange_nm
            }, '[WebSocketBroker] WebSocket 연결 종료');
          }
        } catch (err) {
          logger.error({
            err: String(err),
            exchange: client.exchange_nm
          }, '[WebSocketBroker] WebSocket 종료 중 오류 발생');
        }
      });
    }
    
    // 인터벌 정리
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
    
    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }
    
    // 클라이언트 맵 초기화
    clients.clear();
    clients = new Map();
    
    logger.info('[WebSocketBroker] 모든 WebSocket 클라이언트 종료 완료');
  } catch (error) {
    logger.error({
      err: String(error),
      stack: error.stack
    }, '[WebSocketBroker] WebSocket 클라이언트 종료 중 오류 발생');
  }
}

/**
 * 모든 WebSocket 클라이언트의 큐 정보 가져오기
 * @returns {Array} 각 클라이언트의 큐 정보 배열
 */
function getAllQueueStats() {
  const queueStats = [];
  if (clients && clients.size > 0) {
    clients.forEach((client, exchangeCd) => {
      const stats = client.getQueueStats();
      queueStats.push({
        exchange: exchangeCd,
        queueSize: stats.queueSize,
        queueMaxSize: stats.queueMaxSize,
        queueUsagePercent: stats.queueUsagePercent,
        totalEnqueued: stats.totalEnqueued,
        totalProcessed: stats.totalProcessed
      });
    });
  }
  return queueStats;
}

/**
 * 모든 WebSocket 클라이언트의 총 큐 크기 가져오기
 * @returns {number} 총 큐 크기
 */
function getTotalQueueSize() {
  let totalSize = 0;
  if (clients && clients.size > 0) {
    clients.forEach((client) => {
      totalSize += client.queue.length;
    });
  }
  return totalSize;
}

module.exports = {
  initializeWebsocketClients,
  refresh_websocket_clients,
  stop_websocket_clients,
  getAllQueueStats,
  getTotalQueueSize,
};