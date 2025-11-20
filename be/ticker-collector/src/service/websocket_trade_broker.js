"use strict";

/**
 * 국내 4대 거래소(업비트/빗썸/코빗/코인원)
 * - trade: 실시간 체결 데이터
 * - 각 거래소별 체결 데이터를 수집
 */

const WebSocket = require("ws");
const winston = require("winston");
const { MARKET_NO_ENUM, MARKET_NAME_ENUM, RECONNECT_INTERVAL, PING_INTERVAL, isJsonValue } = require("../utils/common.js");
const { send_push } = require("../utils/zmq-sender-push.js");
const { send_publisher } = require("../utils/zmq-sender-pub.js");

const { sendTelegramMessage, sendTelegramMessageQueue } = require("../utils/telegram_push.js");
const { generateQueueReport } = require("../utils/report.js");

// ===== 설정 =====
// 큐 설정 (2 vCPU 환경 최적화)
// - 4개 거래소 클라이언트가 동시에 처리하므로 CPU 부하 분산 고려
// - 배치 크기: CPU 코어당 적절한 처리량 유지 (2 vCPU 기준)
// - 처리 간격: 클라이언트 간 경합 최소화
const QUEUE_MAX_SIZE = Number(process.env.WS_QUEUE_MAX_SIZE || 5000); // 큐 최대 크기
const QUEUE_PROCESS_INTERVAL = Number(process.env.WS_QUEUE_PROCESS_INTERVAL || 20); // 큐 처리 간격 (ms) - 2 vCPU에 맞게 조정
const QUEUE_BATCH_SIZE = Number(process.env.WS_QUEUE_BATCH_SIZE || 50); // 배치 처리 크기 - 2 vCPU에 맞게 조정
const QUEUE_MONITOR_INTERVAL = Number(process.env.WS_QUEUE_MONITOR_INTERVAL || 30000); // 모니터링 간격 (ms, 기본 30초)

// ===== 로거 =====
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// CPU 코어 수 기반 동적 조정 (2 vCPU 환경 최적화)
const CPU_CORES = Number(process.env.CPU_CORES || require('os').cpus().length);
// 배치 크기: 2 vCPU 기준으로 조정 (4개 클라이언트가 동시 처리하므로 코어당 적절한 크기)
const OPTIMAL_BATCH_SIZE = Math.max(10, Math.min(QUEUE_BATCH_SIZE, Math.floor(CPU_CORES * 25)));
// 처리 간격: 2 vCPU 기준으로 조정 (클라이언트 간 경합 최소화)
const OPTIMAL_PROCESS_INTERVAL = Math.max(10, Math.floor(QUEUE_PROCESS_INTERVAL * (2 / Math.max(1, CPU_CORES))));

// 시작 시 최적화 설정 로깅
logger.info({
  cpuCores: CPU_CORES,
  optimalBatchSize: OPTIMAL_BATCH_SIZE,
  optimalProcessInterval: OPTIMAL_PROCESS_INTERVAL,
  queueMaxSize: QUEUE_MAX_SIZE,
  queueMonitorInterval: QUEUE_MONITOR_INTERVAL
}, "queue settings initialized");

/** ------------------- 거래소별 WS 클라이언트 (trade) ------------------- */

// 업비트 체결 데이터
class UpbitClientTrade {
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
  async processQueue() {
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
        await this.handleMessage(queueItem.message);
        
        const processingTime = Date.now() - processingStartTime;
        this.queueStats.totalProcessed++;
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
      
      logger.debug({
        ex: this.name,
        processed: processedInBatch,
        batchTime: `${batchElapsedTime}ms`,
        messagesPerSecond: `${messagesPerSecond} msg/s`,
        queueSize: this.queue.length
      }, "queue batch processed");
    }

    this.queueProcessing = false;
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
  async handleMessage(raw) {
    const msg = JSON.parse(raw.toString());
    if ((msg.ty || msg.type) === "trade") {
      // 업비트 체결 데이터 구조 참고
      const marketAt = msg.tms;
      const coollectorAt = new Date(Date.now()).getTime();
      const trade_item = {
        symbol: process.env.SYMBOL ?? this.code,
        exchange_no: this.market_no,
        exchange_name: this.name,
        price: Number(msg.tp),
        volume: Number(msg.tv),
        side: msg.ab =="BID" ? "B" : "A",
        marketAt: marketAt,
        collectorAt: coollectorAt,
        diff_ms: (coollectorAt - marketAt) / 1000,
      };
      await SendToTrade_ZMQ(trade_item, msg);
    } else {
      if ( msg.status === "UP" ) {
        console.log( `${this.name} Trade PONG`, msg );
      }
    }
  }
  start() {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = [
        { ticket: "execavg-tw" },
        { type: "trade", codes: [this.code] },
        { format: "SIMPLE" },
      ];
      // try { 
      //   console.log( `${this.name} Trade PING` );
      //   this.ws?.send("PING"); 
      // } catch {}
      this.ws.send(Buffer.from(JSON.stringify(req), "utf8"));
      logger.info({ ex: this.name, msg: "subscribed", code: this.code });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket opened (initial connect).`, false);
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
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "queue enqueue error");
      }
    });

    // 큐 처리 시작
    this.queueProcessInterval = setInterval(() => {
      this.processQueue().catch(e => {
        logger.error({ ex: this.name, err: String(e) }, "queue process interval error");
      });
    }, OPTIMAL_PROCESS_INTERVAL);
    this.ws.on("close", () => {
      // 큐 처리 중지
      if (this.queueProcessInterval) {
        clearInterval(this.queueProcessInterval);
        this.queueProcessInterval = null;
      }
      this._reconnecting = true;
      setTimeout(() => this.start(), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => {
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage( this.name, `[${this.name}] Trade-Collector WebSocket error.`);
    });
  }
}

// 빗썸 체결 데이터
class BithumbClientTrade {
  constructor(code = "KRW-BTC") {
    this.name = MARKET_NAME_ENUM.BITHUMB;
    this.market_no = MARKET_NO_ENUM.BITHUMB;
    this.url  = "wss://pubwss.bithumb.com/pub/ws";
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
    this.queueStats = {
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
    };
  }

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
    this.queue.push({ message: message, enqueuedAt: Date.now() });
    if (this.queue.length > this.queueStats.maxQueueSize) {
      this.queueStats.maxQueueSize = this.queue.length;
    }
  }

  async processQueue() {
    if (this.queueProcessing || this.queue.length === 0) return;
    this.queueProcessing = true;
    const batchStartTime = Date.now();
    let processedInBatch = 0;
    while (this.queue.length > 0 && processedInBatch < OPTIMAL_BATCH_SIZE) {
      const queueItem = this.queue.shift();
      if (!queueItem) break;
      const processingStartTime = Date.now();
      try {
        await this.handleMessage(queueItem.message);
        const processingTime = Date.now() - processingStartTime;
        this.queueStats.totalProcessed++;
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
    if (processedInBatch > 0) {
      const batchElapsedTime = Date.now() - batchStartTime;
      const batchElapsedSeconds = Math.max(batchElapsedTime / 1000, 0.001);
      let messagesPerSecond = parseFloat((processedInBatch / batchElapsedSeconds).toFixed(2));
      if (!isFinite(messagesPerSecond) || isNaN(messagesPerSecond)) {
        messagesPerSecond = 0;
      }
      if (messagesPerSecond > 100000) {
        messagesPerSecond = 100000;
      }
      this.queueStats.lastMessagesPerSecond = messagesPerSecond;
      logger.debug({
        ex: this.name,
        processed: processedInBatch,
        batchTime: `${batchElapsedTime}ms`,
        messagesPerSecond: `${messagesPerSecond} msg/s`,
        queueSize: this.queue.length
      }, "queue batch processed");
    }
    this.queueProcessing = false;
  }

  getQueueStats() {
    const currentTime = Date.now();
    const timeSinceLastReport = currentTime - this.queueStats.lastReportTime;
    const lastCount = this.queueStats.lastProcessedCount || 0;
    const processedSinceLastReport = this.queueStats.totalProcessed - lastCount;
    let processingRate = "0.00";
    if (timeSinceLastReport >= 1000 && processedSinceLastReport > 0) {
      processingRate = (processedSinceLastReport / (timeSinceLastReport / 1000)).toFixed(2);
    } else if (this.queueStats.processedPerSecond > 0) {
      processingRate = this.queueStats.processedPerSecond.toFixed(2);
    } else if (this.queueStats.totalProcessed > 0 && timeSinceLastReport > 0) {
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
      processingRate: `${processingRate} msg/s`,
      lastMessagesPerSecond: this.queueStats.lastMessagesPerSecond || 0,
      processedPerSecond: this.queueStats.processedPerSecond || 0,
      avgProcessedPerSecond: this.queueStats.avgProcessedPerSecond || 0,
      lastReportTime: this.queueStats.lastReportTime,
      isProcessing: this.queueProcessing,
      isConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
    };
  }

  snapshotStats() {
    this.queueStats.lastProcessedCount = this.queueStats.totalProcessed;
    this.queueStats.lastReportTime = Date.now();
  }

  async handleMessage(raw) {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "transaction") {
      for (const trade of msg.content.list) {
        const marketAt = new Date(new Date(trade.contDtm).getTime()).getTime();
        const coollectorAt = new Date(Date.now()).getTime();
        const trade_item = {
          symbol: process.env.SYMBOL ?? this.code,
          exchange_no: this.market_no,
          exchange_name: this.name,
          price: Number(trade.contPrice),
          volume: Number(trade.contQty),
          side: trade.buySellGb =="1" ? "B" : "A",
          marketAt: marketAt,
          collectorAt: coollectorAt,
          diff_ms: (coollectorAt - marketAt) / 1000,
        };
        await SendToTrade_ZMQ(trade_item, msg);
      }
    } else {
      if ( msg.status === "UP" ) {
        console.log( `${this.name} Trade PONG`, msg );
      }
    }
  }
  start() {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      // 빗썸은 체결 데이터 구독을 위해 "transaction" 타입 사용
      const req = {
        type: "transaction",
        symbols: [this.code.replace("-", "")], // 예: "KRW-BTC" -> "KRWBTC"
        tickTypes: ["24H"]
      };
      try { 
        console.log( `${this.name} Trade PING` );
        this.ws?.send("PING");
      } catch {}
      this.ws.send(JSON.stringify(req));
      logger.info({ ex: this.name, msg: "subscribed", code: this.code });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket opened (initial connect).`, false);
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
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "queue enqueue error");
      }
    });

    // 큐 처리 시작
    this.queueProcessInterval = setInterval(() => {
      this.processQueue().catch(e => {
        logger.error({ ex: this.name, err: String(e) }, "queue process interval error");
      });
    }, OPTIMAL_PROCESS_INTERVAL);
    this.ws.on("close", () => {
      // 큐 처리 중지
      if (this.queueProcessInterval) {
        clearInterval(this.queueProcessInterval);
        this.queueProcessInterval = null;
      }
      this._reconnecting = true;
      setTimeout(() => this.start(), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} Trade-CollectorWebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => {
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage( this.name, `[${this.name}] Trade-Collector WebSocket error.`);
    });
  }
}

// 코빗 체결 데이터
class KorbitClientTrade {
  constructor(symbol = "btc_krw") {
    this.name = MARKET_NAME_ENUM.KORBIT;
    this.market_no = MARKET_NO_ENUM.KORBIT;
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
    this.queueStats = {
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
    };
  }

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
    this.queue.push({ message: message, enqueuedAt: Date.now() });
    if (this.queue.length > this.queueStats.maxQueueSize) {
      this.queueStats.maxQueueSize = this.queue.length;
    }
  }

  async processQueue() {
    if (this.queueProcessing || this.queue.length === 0) return;
    this.queueProcessing = true;
    const batchStartTime = Date.now();
    let processedInBatch = 0;
    while (this.queue.length > 0 && processedInBatch < OPTIMAL_BATCH_SIZE) {
      const queueItem = this.queue.shift();
      if (!queueItem) break;
      const processingStartTime = Date.now();
      try {
        await this.handleMessage(queueItem.message);
        const processingTime = Date.now() - processingStartTime;
        this.queueStats.totalProcessed++;
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
    if (processedInBatch > 0) {
      const batchElapsedTime = Date.now() - batchStartTime;
      const batchElapsedSeconds = Math.max(batchElapsedTime / 1000, 0.001);
      let messagesPerSecond = parseFloat((processedInBatch / batchElapsedSeconds).toFixed(2));
      if (!isFinite(messagesPerSecond) || isNaN(messagesPerSecond)) {
        messagesPerSecond = 0;
      }
      if (messagesPerSecond > 100000) {
        messagesPerSecond = 100000;
      }
      this.queueStats.lastMessagesPerSecond = messagesPerSecond;
      logger.debug({
        ex: this.name,
        processed: processedInBatch,
        batchTime: `${batchElapsedTime}ms`,
        messagesPerSecond: `${messagesPerSecond} msg/s`,
        queueSize: this.queue.length
      }, "queue batch processed");
    }
    this.queueProcessing = false;
  }

  getQueueStats() {
    const currentTime = Date.now();
    const timeSinceLastReport = currentTime - this.queueStats.lastReportTime;
    const lastCount = this.queueStats.lastProcessedCount || 0;
    const processedSinceLastReport = this.queueStats.totalProcessed - lastCount;
    let processingRate = "0.00";
    if (timeSinceLastReport >= 1000 && processedSinceLastReport > 0) {
      processingRate = (processedSinceLastReport / (timeSinceLastReport / 1000)).toFixed(2);
    } else if (this.queueStats.processedPerSecond > 0) {
      processingRate = this.queueStats.processedPerSecond.toFixed(2);
    } else if (this.queueStats.totalProcessed > 0 && timeSinceLastReport > 0) {
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
      processingRate: `${processingRate} msg/s`,
      lastMessagesPerSecond: this.queueStats.lastMessagesPerSecond || 0,
      processedPerSecond: this.queueStats.processedPerSecond || 0,
      avgProcessedPerSecond: this.queueStats.avgProcessedPerSecond || 0,
      lastReportTime: this.queueStats.lastReportTime,
      isProcessing: this.queueProcessing,
      isConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
    };
  }

  snapshotStats() {
    this.queueStats.lastProcessedCount = this.queueStats.totalProcessed;
    this.queueStats.lastReportTime = Date.now();
  }

  async handleMessage(raw) {
    if ( !isJsonValue(raw.toString()) ) {
      console.log( `${this.name} Trade PONG`, raw.toString() );
    } else {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "trade" && Array.isArray(msg.data)) {
        for (const trade of msg.data) {
          const marketAt = new Date(new Date(trade.timestamp).getTime()).getTime();
          const coollectorAt = new Date(Date.now()).getTime();
          const trade_item = {
            symbol: process.env.SYMBOL ?? this.symbol,
            exchange_no: this.market_no,
            exchange_name: this.name,
            price: Number(trade.price),
            volume: Number(trade.qty),
            side: trade.side == "buy" ? "B" : "A",
            marketAt: marketAt,
            collectorAt: coollectorAt,
            diff_ms: (coollectorAt - marketAt) / 1000,
          };
          await SendToTrade_ZMQ(trade_item, msg);
        }
      }
    }
  }
  start() {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      // 코빗은 체결 데이터 구독을 위해 "transaction" 타입 사용
      const req = JSON.stringify([{ method: "subscribe", type: "trade", symbols: [this.symbol] }]);
      this.ws.send(req);
      logger.info({ ex: this.name, msg: "subscribed", symbol: this.symbol });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket opened (initial connect).`, false);
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
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "queue enqueue error");
      }
    });

    // 큐 처리 시작
    this.queueProcessInterval = setInterval(() => {
      this.processQueue().catch(e => {
        logger.error({ ex: this.name, err: String(e) }, "queue process interval error");
      });
    }, OPTIMAL_PROCESS_INTERVAL);
    this.ws.on("close", () => {
      // 큐 처리 중지
      if (this.queueProcessInterval) {
        clearInterval(this.queueProcessInterval);
        this.queueProcessInterval = null;
      }
      this._reconnecting = true;
      setTimeout(() => this.start(), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => {
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage( this.name, `[${this.name}] Trade-Collector WebSocket error.`);
    });
  }
}

// 코인원 체결 데이터
class CoinoneClientTrade {
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
    this.queueStats = {
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
    };
  }

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
    this.queue.push({ message: message, enqueuedAt: Date.now() });
    if (this.queue.length > this.queueStats.maxQueueSize) {
      this.queueStats.maxQueueSize = this.queue.length;
    }
  }

  async processQueue() {
    if (this.queueProcessing || this.queue.length === 0) return;
    this.queueProcessing = true;
    const batchStartTime = Date.now();
    let processedInBatch = 0;
    while (this.queue.length > 0 && processedInBatch < OPTIMAL_BATCH_SIZE) {
      const queueItem = this.queue.shift();
      if (!queueItem) break;
      const processingStartTime = Date.now();
      try {
        await this.handleMessage(queueItem.message);
        const processingTime = Date.now() - processingStartTime;
        this.queueStats.totalProcessed++;
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
    if (processedInBatch > 0) {
      const batchElapsedTime = Date.now() - batchStartTime;
      const batchElapsedSeconds = Math.max(batchElapsedTime / 1000, 0.001);
      let messagesPerSecond = parseFloat((processedInBatch / batchElapsedSeconds).toFixed(2));
      if (!isFinite(messagesPerSecond) || isNaN(messagesPerSecond)) {
        messagesPerSecond = 0;
      }
      if (messagesPerSecond > 100000) {
        messagesPerSecond = 100000;
      }
      this.queueStats.lastMessagesPerSecond = messagesPerSecond;
      logger.debug({
        ex: this.name,
        processed: processedInBatch,
        batchTime: `${batchElapsedTime}ms`,
        messagesPerSecond: `${messagesPerSecond} msg/s`,
        queueSize: this.queue.length
      }, "queue batch processed");
    }
    this.queueProcessing = false;
  }

  getQueueStats() {
    const currentTime = Date.now();
    const timeSinceLastReport = currentTime - this.queueStats.lastReportTime;
    const lastCount = this.queueStats.lastProcessedCount || 0;
    const processedSinceLastReport = this.queueStats.totalProcessed - lastCount;
    let processingRate = "0.00";
    if (timeSinceLastReport >= 1000 && processedSinceLastReport > 0) {
      processingRate = (processedSinceLastReport / (timeSinceLastReport / 1000)).toFixed(2);
    } else if (this.queueStats.processedPerSecond > 0) {
      processingRate = this.queueStats.processedPerSecond.toFixed(2);
    } else if (this.queueStats.totalProcessed > 0 && timeSinceLastReport > 0) {
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
      processingRate: `${processingRate} msg/s`,
      lastMessagesPerSecond: this.queueStats.lastMessagesPerSecond || 0,
      processedPerSecond: this.queueStats.processedPerSecond || 0,
      avgProcessedPerSecond: this.queueStats.avgProcessedPerSecond || 0,
      lastReportTime: this.queueStats.lastReportTime,
      isProcessing: this.queueProcessing,
      isConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
    };
  }

  snapshotStats() {
    this.queueStats.lastProcessedCount = this.queueStats.totalProcessed;
    this.queueStats.lastReportTime = Date.now();
  }

  async handleMessage(raw) {
    const msg = JSON.parse(raw.toString());
    if ((msg.c === "TRADE" || msg.channel === "TRADE") && (msg.d || msg.data)) {
      const trades = Array.isArray(msg.d) ? msg.d : (Array.isArray(msg.data) ? msg.data : [msg.d || msg.data]);
      for (const d of trades) {
        const marketAt = d.t;
        const coollectorAt = new Date(Date.now()).getTime();
        const trade_item = {
          symbol: process.env.SYMBOL ?? `${this.qc}-${this.tc}`,
          exchange_no: this.market_no,
          exchange_name: this.name,
          price: Number(d.p),
          volume: Number(d.q),
          side: d.sm ? "B" : "A",
          marketAt: d.t,
          collectorAt: coollectorAt,
          diff_ms: (coollectorAt - marketAt) / 1000,
        };
        await SendToTrade_ZMQ(trade_item, msg);
      }
    } else {
      console.log( `${this.name} Trade PONG`, msg );
    }
  }
  start() {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const sub = {
        request_type: "SUBSCRIBE",
        channel: "TRADE",
        topic: { quote_currency: this.qc, target_currency: this.tc },
        format: "SHORT",
      };
      this.ws.send(JSON.stringify(sub));
      logger.info({ ex: this.name, msg: "subscribed", qc: this.qc, tc: this.tc });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket opened (initial connect).`, false);
      }
      this._reconnecting = false;
      this.pingInterval = setInterval(() => {
        try { this.ws?.send(JSON.stringify({ request_type: "PING" })); } catch {}
      }, PING_INTERVAL);
    });
    this.ws.on("message", (raw) => {
      try {
        // 큐에 메시지 추가
        this.enqueue(raw);
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "queue enqueue error");
      }
    });

    // 큐 처리 시작
    this.queueProcessInterval = setInterval(() => {
      this.processQueue().catch(e => {
        logger.error({ ex: this.name, err: String(e) }, "queue process interval error");
      });
    }, OPTIMAL_PROCESS_INTERVAL);
    this.ws.on("close", () => {
      if (this.pingInterval) clearInterval(this.pingInterval);
      // 큐 처리 중지
      if (this.queueProcessInterval) {
        clearInterval(this.queueProcessInterval);
        this.queueProcessInterval = null;
      }
      this._reconnecting = true;
      setTimeout(() => this.start(), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => {
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage( this.name, `[${this.name}] Trade-Collector WebSocket error.`);
    });
  }
}

// Trade 데이터 전송 함수 
async function SendToTrade_ZMQ(trade_item, msg) {
  const topic = `${trade_item.exchange_no}/${trade_item.symbol}/trade`;
  // console.log( JSON.stringify(trade_item, null, 2) );

  // ZMQ PUSH 방식으로 전송 => DB에 trade를 저장하는 프로세스에 전송
  // ZMQ PUB 방식으로 전송 => 각 거래소/SYMBOL 별로 전송하고 각 프로세스에서 집계 등 처리

  const raw_trade_item = {
    ...trade_item,
    raw: msg,
  };

  const ts = Date.now();
  await Promise.all([
    send_push(topic, ts, trade_item),
    send_publisher(raw_trade_item.symbol + "/trade", raw_trade_item)
  ]);
}
/** ------------------- 실행부 ------------------- */

// 실시간 체결 데이터 수신
const clients = [
  new UpbitClientTrade("KRW-BTC"),
  new BithumbClientTrade("BTC_KRW"),
  new KorbitClientTrade("btc_krw"),
  new CoinoneClientTrade("KRW", "BTC"),
];

clients.forEach(c => c.start());

// 1초마다 각 거래소별 처리 건수 계산 및 평균 계산
setInterval(() => {
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
      if (client.queueStats.processedPerSecondHistory.length > 30) {
        client.queueStats.processedPerSecondHistory.shift();
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
setInterval(() => {
  try {
    const report = generateQueueReport(clients);
    sendTelegramMessageQueue("QueueMonitor", report, true);
    // logger.info("Queue status report sent to Telegram", report);
  } catch (e) {
    logger.error({ err: String(e) }, "queue monitoring error");
  }
}, QUEUE_MONITOR_INTERVAL);

// Export the client classes
module.exports = {
  UpbitClientTrade,
  BithumbClientTrade,
  KorbitClientTrade,
  CoinoneClientTrade
};