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
const { send_push } = require("../utils/zmq-sender-push.js");
const { send_publisher } = require("../utils/zmq-sender-pub.js");
const {
  sendTelegramMessage,
  sendTelegramMessageQueue,
} = require("../utils/telegram_push.js");
const { generateQueueReport } = require("../utils/report.js");
const logger = require("../utils/logger.js");
const { quest_db } = require("../db/quest_db.js");
const { isJsonValue } = require("../utils/common.js");

// ===== 설정 =====
const DEPTH = 15;
const QUEUE_MAX_SIZE = Number(process.env.WS_QUEUE_MAX_SIZE || 5000);
const QUEUE_PROCESS_INTERVAL = Number(process.env.WS_QUEUE_PROCESS_INTERVAL || 20);
const QUEUE_BATCH_SIZE = Number(process.env.WS_QUEUE_BATCH_SIZE || 50);
const QUEUE_MONITOR_INTERVAL = Number(process.env.WS_QUEUE_MONITOR_INTERVAL || 30000);
const CPU_CORES = Number(process.env.CPU_CORES || require("os").cpus().length);
const OPTIMAL_BATCH_SIZE = Math.max(
  10,
  Math.min(QUEUE_BATCH_SIZE, Math.floor(CPU_CORES * 25))
);
const OPTIMAL_PROCESS_INTERVAL = Math.max(
  10,
  Math.floor((QUEUE_PROCESS_INTERVAL * 2) / Math.max(1, CPU_CORES))
);

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

// ------------------- 거래소별 WS 클라이언트 -------------------

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

    if ( !this.symbols.has(symbol_item.subscribe_symbol) ) {
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
    if (this.queue.length >= this.queueMaxSize) {
      this.queue.shift();
      this.queueDropped++;
      this.queueStats.totalDropped++;
      if (this.queueDropped % 100 === 0) {
        logger.warn(
          { ex: this.exchange_nm, dropped: this.queueDropped },
          "queue overflow, messages dropped"
        );
      }
    }
    this.queue.push({ message, enqueuedAt: Date.now() });
    if (this.queue.length > this.queueStats.maxQueueSize) {
      this.queueStats.maxQueueSize = this.queue.length;
    }
  }

  async processQueue(cb) {
    if (this.queueProcessing || this.queue.length === 0) return;
    this.queueProcessing = true;
    const batchStartTime = Date.now();
    let processedInBatch = 0;
    try {
      while (
        this.queue.length > 0 &&
        processedInBatch < OPTIMAL_BATCH_SIZE
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
        logger.warn({ exchange_nm: this.exchange_nm, payload }, "Skipping non-JSON message");
        return;
      }

      const msg = JSON.parse(payload);

      // console.log("msg", JSON.stringify(msg, null, 2));

      const bidsAsks = this._parseOrderbookMessage(msg);
      if (bidsAsks) {
        const { bids, asks, orderbook_item } = bidsAsks;

        try {
          await Promise.race([
            SendToOrderBook_ZMQ(orderbook_item, payload),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("SendToOrderBook_ZMQ timeout")),
                500
              )
            ),
          ]);
        } catch (timeoutError) {
          if (timeoutError.message.includes("timeout")) {
            logger.warn(
              { ex: this.exchange_nm, err: String(timeoutError) },
              "ZMQ send timeout (continuing)"
            );
          } else {
            throw timeoutError;
          }
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

  _parseOrderbookMessage(msg) {

    let typeRaw =
      msg?.ty || msg?.type || msg?.c || msg?.channel || msg?.n;

    const isOrderbookMsg =
      typeRaw === "orderbook" ||
      typeRaw === "ORDERBOOK" ||
      typeRaw === "SubscribeToOrderBook" ||
      typeRaw === "OrderBookEvent";

    if (!isOrderbookMsg) 
    {
      // console.log("isOrderbookMsg", this.exchange_nm, msg);
      return null;
    }

    let bids = [],
      asks = [],
      orderbook_item = {
        symbol: "",
        subscribe_symbol : "",
        exchange_cd: this.exchange_cd,
        exchange_nm: this.exchange_nm,
        bid: [],
        ask: [],
        marketAt: 0,
        coollectorAt: 0,
        diff_ms: 0,
      };

    const now = Date.now();
    // 업비트
    if (this.exchange_cd === "E0010001") {
      const marketAt = msg.tms;
      const coollectorAt = now;
      const units = msg?.obu || msg?.orderbook_units || [];
      const symbol = msg?.cd || msg?.code;
      bids = units.slice(0, DEPTH).map((u) => [u.bp ?? u.bid_price, u.bs ?? u.bid_size]);
      asks = units.slice(0, DEPTH).map((u) => [u.ap ?? u.ask_price, u.as ?? u.ask_size]);

      const symbol_item = this.symbols.get(symbol);
      if ( symbol_item != null ) {
        orderbook_item = {
          symbol: symbol_item.symbol,
          subscribe_symbol: symbol_item.subscribe_symbol,
          exchange_cd: this.exchange_cd,
          exchange_nm: this.exchange_nm,
          price_id: symbol_item.price_id,
          product_id: symbol_item.product_id,
          bid: bids,
          ask: asks,
          marketAt: marketAt,
          coollectorAt: coollectorAt,
          diff_ms: (coollectorAt - marketAt) / 1000,
        };
      }
      // console.log(this.exchange_cd, this.exchange_nm, orderbook_item);
    }
    // 빗썸
    else if (this.exchange_cd === "E0020001") {
      const marketAt = parseInt(msg.tms / 1000);
      const coollectorAt = now;
      const units = msg?.obu || msg?.orderbook_units || [];
      const symbol = msg?.cd || msg?.code;
      bids = units.slice(0, DEPTH).map((u) => [u.bp ?? u.bid_price, u.bs ?? u.bid_size]);
      asks = units.slice(0, DEPTH).map((u) => [u.ap ?? u.ask_price, u.as ?? u.ask_size]);
      const symbol_item = this.symbols.get(symbol);
      if ( symbol_item != null ) {
        orderbook_item = {
          symbol: symbol_item.symbol,
          subscribe_symbol: symbol_item.subscribe_symbol,
          exchange_cd: this.exchange_cd,
          exchange_nm: this.exchange_nm,
          price_id: symbol_item.price_id,
          product_id: symbol_item.product_id,
          bid: bids,
          ask: asks,
          marketAt: marketAt,
          coollectorAt: coollectorAt,
          diff_ms: (coollectorAt - marketAt) / 1000,
        };
        // console.log(this.exchange_cd, this.exchange_nm, orderbook_item);
      }
    }
    // 코인원
    else if (this.exchange_cd === "E0030001") {
      const d = msg.d || msg.data;
      if (!d) return null;
      const marketAt = d.t;
      const symbol = `${d.qc}-${d.tc}`;
      const coollectorAt = now;
      bids = (d.b || d.bids || []).map((u) => [Number(u.p ?? u.price), Number(u.q ?? u.qty)]).slice(0, DEPTH);
      asks = (d.a || d.asks || []).reverse().map((u) => [Number(u.p ?? u.price), Number(u.q ?? u.qty)]).slice(0, DEPTH);
      
      const symbol_item = this.symbols.get(symbol);
      if ( symbol_item != null ) {
        orderbook_item = {
          symbol: symbol_item.symbol,
          subscribe_symbol: symbol_item.subscribe_symbol,
          exchange_cd: this.exchange_cd,
          exchange_nm: this.exchange_nm,
          price_id: symbol_item.price_id,
          product_id: symbol_item.product_id,
          bid: bids,
          ask: asks,
          marketAt: marketAt,
          coollectorAt: coollectorAt,
          diff_ms: (coollectorAt - marketAt) / 1000,
        };
        // console.log(this.exchange_cd, this.exchange_nm, orderbook_item);
      }
    }
    // 코빗
    else if (this.exchange_cd === "E0050001") {
      const marketAt = msg.timestamp;
      const coollectorAt = now;
      const symbol = msg.symbol;
      bids = (msg.data?.bids || []).slice(0, DEPTH).map((x) => [Number(x.price), Number(x.qty)]);
      asks = (msg.data?.asks || []).slice(0, DEPTH).map((x) => [Number(x.price), Number(x.qty)]);
      // console.log("symbol !!!!!!!!!!!!!!!!!!!!!", this.symbols, symbol);
      const symbol_item = this.symbols.get(symbol);
      if ( symbol_item != null ) {
        orderbook_item = {
          symbol: symbol_item.symbol,
          subscribe_symbol: symbol_item.subscribe_symbol,
          exchange_cd: this.exchange_cd,
          exchange_nm: this.exchange_nm,
          price_id: symbol_item.price_id,
          product_id: symbol_item.product_id,
          bid: bids,
            ask: asks,
            marketAt: marketAt,
            coollectorAt: coollectorAt,
            diff_ms: (coollectorAt - marketAt) / 1000,
        };
        // console.log(this.exchange_cd, this.exchange_nm, orderbook_item);
      }
    }
    // 고팍스
    else if (this.exchange_cd === "E0080001") {
      const marketAt = now;
      const coollectorAt = now;
      const symbol = msg.o?.tradingPairName;
      bids = (msg.o?.bid || []).slice(0, DEPTH).map((x) => [Number(x.price), Number(x.volume)]);
      asks = (msg.o?.ask || []).slice(0, DEPTH).map((x) => [Number(x.price), Number(x.volume)]);
      const symbol_item = this.symbols.get(symbol);
      if ( symbol_item != null ) {
        orderbook_item = {
          symbol: symbol_item.symbol,
          subscribe_symbol: symbol_item.subscribe_symbol,
          exchange_cd: this.exchange_cd,
          exchange_nm: this.exchange_nm,
          price_id: symbol_item.price_id,
          product_id: symbol_item.product_id,
          bid: bids,
          ask: asks,
          marketAt: marketAt,
          coollectorAt: coollectorAt,
          diff_ms: (coollectorAt - marketAt) / 1000,
        };
        // console.log(this.exchange_cd, this.exchange_nm, orderbook_item);
      }
    } else {
      return null;
    }
    return { bids, asks, orderbook_item };
  }

  start(client) {
    this.websocket = new WebSocket(this.wss_url);
    this.websocket.on("open", () => {
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
          this.websocket?.send("PING");
        } catch {}
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
      sendTelegramMessage(
        this.exchange_nm,
        `${this.exchange_nm} OrderBook-Collector WebSocket ${
          this._reconnecting ? "reopened (reconnected)" : "opened (initial connect)."
        }`,
        !this._reconnecting
      );
      this._reconnecting = false;
      this._closeNotified = false;
      this.pingInterval = setInterval(() => {
        try {
          if (this.exchange_cd === "E0010001" || this.exchange_cd === "E0020001" 
            || this.exchange_cd === "E0050001" || this.exchange_cd === "E0080001") {
            this.websocket?.send("PING");
          } else if (this.exchange_cd === "E0030001") {
            this.websocket?.send(JSON.stringify({ request_type: "PING" }));
          }
        } catch {}
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
  const raw_orderbook_item = { ...orderbook_item, "type": "orderbook", raw };
  const payload = {
    ...orderbook_item,
    "type": "orderbook",
  };
  await Promise.all([
    send_push(topic, ts, payload),
    send_publisher(topic, raw_orderbook_item),
  ]);
}

// ------------------- 실행부 -------------------
let clients = new Map();

function initializeWebsocketClients(process_info_detail_list) {
  if (clients.length > 0) {
    logger.info("WebSocket clients already initialized");
    return;
  }

  try {
    logger.info(
      "Database connection has been established successfully, initializeClients start"
    );
    logQueueConfiguration();

    process_info_detail_list.forEach((item) => {
      if ( !clients.has(item.exchange_cd) ) {
        clients.set(item.exchange_cd, new WebSocketBroker(item));
        clients.get(item.exchange_cd).addSymbol(item);
      } else {
        clients.get(item.exchange_cd).addSymbol(item);
      }
    });

    logger.info(`Created ${clients.length} clients`);
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
    scheduleDailyReport();
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
  if (statsInterval || clients.length === 0) {
    logger.warn("startIntervals: Already started or no clients available");
    return;
  }
  logger.info("Starting intervals (stats, monitor, tick)");
  try {
    statsInterval = setInterval(() => {
      if (clients.length === 0) return;
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
      if (clients.length === 0) return;
      try {
        const report = generateQueueReport(clients);
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

function scheduleDailyReport() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const msUntilMidnight = tomorrow.getTime() - now.getTime();

  setTimeout(async () => {
    if (!clients || clients.length === 0) {
      logger.warn("scheduleDailyReport: clients not initialized, rescheduling...");
      scheduleDailyReport();
      return;
    }

    const dailyStats = clients.map((client) => ({
      exchange: client.exchange_nm,
      date: new Date().toISOString().split("T")[0],
      dailyProcessed: client.queueStats.dailyProcessed,
      maxProcessedPerSecond: client.queueStats.maxProcessedPerSecond,
    }));

    logger.info(
      JSON.stringify(
        {
          type: "daily_queue_statistics",
          timestamp: new Date().toISOString(),
          exchanges: dailyStats,
        },
        null,
        2
      )
    );

    try {
      if (quest_db && quest_db.sequelize) {
        await quest_db.sequelize.query(
          `INSERT INTO tb_report (title, content, createdAt) VALUES (?, ?, ?)`,
          {
            replacements: [
              "orderbook-collector",
              JSON.stringify({
                type: "interval_queue_statistics",
                timestamp: new Date().toISOString(),
                exchanges: dailyStats,
              }),
              Date.now(),
            ],
          }
        );
      } else {
        logger.warn("[tb_report] Unable to insert report: missing sequelize instance.");
      }
    } catch (err) {
      logger.error("[tb_report] insert error", err);
    }

    clients.forEach((client) => {
      client.queueStats.dailyProcessed = 0;
      client.queueStats.maxProcessedPerSecond = 0;
      client.queueStats.lastResetDate = new Date().toDateString();
    });

    scheduleDailyReport();
  }, msUntilMidnight);
}

module.exports = {
  initializeWebsocketClients,
};