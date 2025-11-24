"use strict";

/**
 * 국내 4대 거래소(업비트/빗썸/코빗/코인원)
 * - trade: 실시간 체결 데이터
 * - 각 거래소별 체결 데이터를 수집
 */

const WebSocket = require("ws");
const { MARKET_NO_ENUM, MARKET_NAME_ENUM, RECONNECT_INTERVAL, PING_INTERVAL, isJsonValue } = require("../utils/common.js");
const { send_push } = require("../utils/zmq-sender-push.js");
const { send_publisher } = require("../utils/zmq-sender-pub.js");

const { sendTelegramMessage, sendTelegramMessageQueue } = require("../utils/telegram_push.js");
const { generateQueueReport } = require("../utils/report.js");
const logger = require("../utils/logger.js");

// ===== 설정 =====
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

/** ------------------- 거래소별 WS 클라이언트 (trade) ------------------- */

// 업비트 체결 데이터
class WebSocketBroker {
  constructor(process_info) {
    this.websocket = null;
    this.exchange_nm = process_info.exchange_nm;
    this.exchange_cd = process_info.exchange_cd;
    this.wss_url = process_info.wss_url;
    this.api_url = process_info.api_url;
    this.market_no = MARKET_NO_ENUM.UPBIT;
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

  // 큐에 메시지 추가
  enqueue(message) {
    this.queueStats.totalEnqueued++;
    
    if (this.queue.length >= this.queueMaxSize) {
      // 큐가 가득 찬 경우 가장 오래된 메시지 제거 (FIFO)
      this.queue.shift();
      this.queueDropped++;
      this.queueStats.totalDropped++;
      if (this.queueDropped % 100 === 0) {
        logger.warn({ ex: this.exchange_nm, dropped: this.queueDropped }, "queue overflow, messages dropped");
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
        logger.error({ ex: this.exchange_nm, err: String(e) }, "queue processing error");
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
      
      // logger.debug({
      //   ex: this.exchange_nm,
      //   processed: processedInBatch,
      //   batchTime: `${batchElapsedTime}ms`,
      //   messagesPerSecond: `${messagesPerSecond} msg/s`,
      //   queueSize: this.queue.length
      // }, "queue batch processed");
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
      processingRate: `${processingRate} msg/s`, // 리포트 간격 동안의 평균 처리 속도
      lastMessagesPerSecond: this.queueStats.lastMessagesPerSecond || 0, // 최근 배치 처리 초당 건수
      processedPerSecond: this.queueStats.processedPerSecond || 0, // 1초당 처리 건수 (순간값)
      avgProcessedPerSecond: this.queueStats.avgProcessedPerSecond || 0, // 1초당 평균 큐 처리 개수
      lastReportTime: this.queueStats.lastReportTime, // 마지막 리포트 시간 (리포트에서 사용)
      isProcessing: this.queueProcessing,
      isConnected: this.websocket && this.websocket.readyState === WebSocket.OPEN,
    };
  }

  // 리포트를 위한 통계 스냅샷 저장
  snapshotStats() {
    this.queueStats.lastProcessedCount = this.queueStats.totalProcessed;
    this.queueStats.lastReportTime = Date.now();
  }

  // 메시지 처리 로직
  async handleMessage(raw) {
    const payload = raw.toString();
    if (!isJsonValue(payload)) {
      // logger.warn({ exchange_nm: this.exchange_nm, payload }, "Skipping non-JSON message");
      return;
    }    
    const msg = JSON.parse(payload);
    if (msg.n === "SubscribeToTradingPair" || msg.n === "OrderBookEvent") {
      // console.log(msg);
      return;
    }

    let typeRawTrade = msg?.ty || msg?.type || msg?.c || msg?.o;
    let typeRawTicker = msg?.ty || msg?.type || msg?.c || msg?.o;

    const isTradeMsg =
        typeRawTrade === "trade" ||
        typeRawTrade === "TRADE" ||
        typeRawTrade === "PublicTradeEvent";

    // console.log("isTradeMsg", msg);

    const isTickerMsg =
        typeRawTicker === "ticker" ||
        typeRawTicker === "TICKER" ||
        typeRawTicker === "PublicTickerEvent";

    if (!isTradeMsg && !isTickerMsg) 
    {
      // console.log("isTradeMsg", this.exchange_nm, msg);
      return null;
    }

    let trade_items = [];
    let ticker_items = [];

    if (this.exchange_cd === "E0010001") {
      // console.log(msg);
      const symbol = msg.cd || msg.code;
      const symbol_item = this.symbols.get(symbol);
      if ( symbol_item != null ) {
        const marketAt = msg.tms;
        const collectorAt = new Date(Date.now()).getTime();
        if ( isTradeMsg ) {
          const trade_item = {
            sequential_id: msg.sid,
            symbol: symbol_item.symbol,
            exchange_cd: this.exchange_cd,
            exchange_nm: this.exchange_nm,
            price_id: symbol_item.price_id,
            product_id: symbol_item.product_id,
            price_id_cd: symbol_item.price_id_cd,
            product_id_cd: symbol_item.product_id_cd,
            trade_price: Number(msg.tp),
            trade_volumn: Number(msg.tv),
            buy_sell_gb: msg.ab =="BID" ? "B" : "A",
            marketAt: marketAt,
            collectorAt: collectorAt,
            diff_ms: (collectorAt - marketAt) / 1000,
          };
          trade_items.push(trade_item);
        }
        if ( isTickerMsg ) {
          const ticker_item = {
            symbol: symbol_item.symbol,
            exchange_cd: this.exchange_cd,
            exchange_nm: this.exchange_nm,
            price_id: symbol_item.price_id,
            product_id: symbol_item.product_id,
            price_id_cd: symbol_item.price_id_cd,
            product_id_cd: symbol_item.product_id_cd,
            marketAt: marketAt,
            collectorAt: collectorAt,
            diff_ms: (collectorAt - marketAt) / 1000,
            open: Number(msg.op),
            high: Number(msg.hp),
            low: Number(msg.lp),
            close: Number(msg.tp),
            volume: Number(msg.atv24h),
          };
          ticker_items.push(ticker_item);
          // console.log("ticker_items", ticker_items);
        }
      }
    } else if (this.exchange_cd === "E0020001") {
      const symbol = msg.cd || msg.code;
      const symbol_item = this.symbols.get(symbol);
      if ( symbol_item != null ) {
        const marketAt = msg.tms;
        const collectorAt = new Date(Date.now()).getTime();
        if ( isTradeMsg ) {
          const trade_item = {
              sequential_id: msg.sid,
              symbol: symbol_item.symbol,
              exchange_cd: this.exchange_cd,
              exchange_nm: this.exchange_nm,
              price_id: symbol_item.price_id,
              product_id: symbol_item.product_id,
              price_id_cd: symbol_item.price_id_cd,
              product_id_cd: symbol_item.product_id_cd,
              trade_price: Number(msg.tp),
              trade_volumn: Number(msg.tv),
              buy_sell_gb: msg.ab =="BID" ? "B" : "A",
              marketAt: marketAt,
              collectorAt: collectorAt,
              diff_ms: (collectorAt - marketAt) / 1000,
          };
          trade_items.push(trade_item);
        }
        if ( isTickerMsg ) {
          // console.log("msg", msg);
          const ticker_item = {
            symbol: symbol_item.symbol,
            exchange_cd: this.exchange_cd,
            exchange_nm: this.exchange_nm,
            price_id: symbol_item.price_id,
            product_id: symbol_item.product_id,
            price_id_cd: symbol_item.price_id_cd,
            product_id_cd: symbol_item.product_id_cd,
            marketAt: marketAt,
            collectorAt: collectorAt,
            diff_ms: (collectorAt - marketAt) / 1000,
            open: Number(msg.op),
            high: Number(msg.hp),
            low: Number(msg.lp),
            close: Number(msg.tp),
            volume: Number(msg.atv24h),
          };
          ticker_items.push(ticker_item);
          // console.log("ticker_items", ticker_items);
        }
      }
    } else if (this.exchange_cd === "E0030001") {
      const symbol = `${msg.d.qc}-${msg.d.tc}`;
      const symbol_item = this.symbols.get(symbol);
      if ( symbol_item != null ) {
        const marketAt = msg?.d?.t;
        const collectorAt = new Date(Date.now()).getTime();
        if ( isTradeMsg ) {
          const trade_item = {
            sequential_id: msg?.d?.i,
            symbol: symbol_item.symbol,
            exchange_cd: this.exchange_cd,
            exchange_nm: this.exchange_nm,
            price_id: symbol_item.price_id,
            product_id: symbol_item.product_id,
            price_id_cd: symbol_item.price_id_cd,
            product_id_cd: symbol_item.product_id_cd,
            trade_price: Number(msg?.d?.p),
            trade_volumn: Number(msg?.d?.q),
            buy_sell_gb: msg?.d?.sm ? "B" : "A",
            marketAt: marketAt,
            collectorAt: collectorAt,
            diff_ms: (collectorAt - marketAt) / 1000,
          };
          trade_items.push(trade_item);
        }
        if ( isTickerMsg ) {
          // console.log("msg", msg);
          const ticker_item = {
            symbol: symbol_item.symbol,
            exchange_cd: this.exchange_cd,
            exchange_nm: this.exchange_nm,
            price_id: symbol_item.price_id,
            product_id: symbol_item.product_id,
            price_id_cd: symbol_item.price_id_cd,
            product_id_cd: symbol_item.product_id_cd,
            marketAt: marketAt,
            collectorAt: collectorAt,
            diff_ms: (collectorAt - marketAt) / 1000,
            open: Number(msg?.d?.fi),
            high: Number(msg?.d?.hi),
            low: Number(msg?.d?.lo),
            close: Number(msg?.d?.la),
            volume: Number(msg?.d?.tv),
          };
          ticker_items.push(ticker_item);
          // console.log("ticker_items", ticker_items);
        }
      }
    } else if (this.exchange_cd === "E0050001") {
      const symbol = msg.symbol;
      const symbol_item = this.symbols.get(symbol);
      if ( symbol_item != null ) {
        if ( isTradeMsg ) {
          for ( const trade of msg.data ) {
            const marketAt = trade?.timestamp;
            const collectorAt = new Date(Date.now()).getTime();
            const trade_item = {
              sequential_id: trade?.tradeId,
              symbol: symbol_item.symbol,
              exchange_cd: this.exchange_cd,
              exchange_nm: this.exchange_nm,
              price_id: symbol_item.price_id,
              product_id: symbol_item.product_id,
              price_id_cd: symbol_item.price_id_cd,
              product_id_cd: symbol_item.product_id_cd,
              trade_price: Number(trade?.price),
              trade_volumn: Number(trade?.qty),
              buy_sell_gb: trade?.isBuyerTaker ? "B" : "A",
              marketAt: marketAt,
              collectorAt: collectorAt,
              diff_ms: (collectorAt - marketAt) / 1000,
            };
            trade_items.push(trade_item);
          }
        }
        if ( isTickerMsg ) {
          // console.log("msg", msg);
          const marketAt = msg?.timestamp;
          const collectorAt = new Date(Date.now()).getTime();
          const ticker_item = {
            symbol: symbol_item.symbol,
            exchange_cd: this.exchange_cd,
            exchange_nm: this.exchange_nm,
            price_id: symbol_item.price_id,
            product_id: symbol_item.product_id,
            price_id_cd: symbol_item.price_id_cd,
            product_id_cd: symbol_item.product_id_cd,
            marketAt: marketAt,
            collectorAt: collectorAt,
            diff_ms: (collectorAt - marketAt) / 1000,
            open: Number(msg?.data?.open),
            high: Number(msg?.data?.high),
            low: Number(msg?.data?.low),
            close: Number(msg?.data?.close),
            volume: Number(msg?.data?.volume),
          };
          ticker_items.push(ticker_item);
          // console.log("ticker_items", ticker_items);
        }
      }
    } else if (this.exchange_cd === "E0080001") {
      if (msg.n === "PublicTradeEvent") {
        // console.log(msg);
        const trade = msg.o;
      }
    }
    if ( isTradeMsg ) {
      for ( const trade_item of trade_items ) {
        try {
          // console.log("trade_item", trade_item);
          await Promise.race([
            SendToTrade_ZMQ(trade_item, msg),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("SendToTrade_ZMQ timeout")),
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
      }
    }

    if ( isTickerMsg ) {
      for ( const ticker_item of ticker_items ) {
        try {
          await Promise.race([
            SendToTicker_ZMQ(ticker_item, msg),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("SendToTicker_ZMQ timeout")),
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
      }
    }
  }

  start(client) {
    this.websocket = new WebSocket(this.wss_url);
    this.websocket.on("open", () => {
      let sub = [
        { ticket: "execavg-tw" },
        { type: "orderbook", codes: [this.subscribe_symbol] },
        { format: "SIMPLE" },
      ];

      if (this.exchange_cd === "E0010001") {
        // 업비트 OK 
        let sub_symbols = [];
        for (const symbol_item of this.symbols.values()) {
          sub_symbols.push(symbol_item.subscribe_symbol);
        }
        let sub_trade = [
            { ticket: "bonanza-trade" },
            { type: "trade", codes: sub_symbols },
            { format: "SIMPLE" },
        ];
        this.websocket.send(Buffer.from(JSON.stringify(sub_trade), "utf8"));

        // let sub_ticker = [
        //   { ticket: "bonanza-ticker" },
        //   { type: "ticker", codes: sub_symbols },
        //   { format: "SIMPLE" },
        // ];
        // this.websocket.send(Buffer.from(JSON.stringify(sub_ticker), "utf8"));

        // logger.info({
        //   ex: this.exchange_nm,
        //   msg: "subscribed",
        //   sub_trade: sub_trade,
        //   sub_ticker: sub_ticker,
        // });

      } else if (this.exchange_cd === "E0020001") {
        // 빗썸 OK
        let sub_symbols = [];
        for (const symbol_item of this.symbols.values()) {
          sub_symbols.push(symbol_item.subscribe_symbol);
        }
        const sub_trade = [
          { "ticket": "realtime-only" },
          {
            "type": "trade",
            "codes": sub_symbols,
            "isOnlySnapshot": false,
            "isOnlyRealtime": true,
          },
          { "format": "SIMPLE" }
        ];
        this.websocket.send(Buffer.from(JSON.stringify(sub_trade), "utf8"));

        // const sub_ticker = [
        //   { "ticket": "realtime-only" },
        //   {
        //     "type": "ticker",
        //     "codes": sub_symbols,
        //     "isOnlySnapshot": false,
        //     "isOnlyRealtime": true
        //   },
        //   { "format": "SIMPLE" }
        // ];
        // this.websocket.send(Buffer.from(JSON.stringify(sub_ticker), "utf8"));
        // logger.info({
        //   ex: this.exchange_nm,
        //   msg: "subscribed",
        //   sub_trade: sub_trade,
        //   sub_ticker: sub_ticker,
        // });

      } else if (this.exchange_cd === "E0030001") {
        // 코인원
        for (const symbol_item of this.symbols.values()) {
          const sub_trade = {
            request_type: "SUBSCRIBE",
            channel: "TRADE",
            topic: { quote_currency: symbol_item.price_id_cd, target_currency: symbol_item.product_id_cd },
            format: "SHORT",
          };
          this.websocket.send(JSON.stringify(sub_trade));
          
          // const sub_ticker = {
          //   request_type: "SUBSCRIBE",
          //   channel: "TICKER",
          //   topic: { quote_currency: symbol_item.price_id_cd, target_currency: symbol_item.product_id_cd },
          //   format: "SHORT",
          // };
          // this.websocket.send(JSON.stringify(sub_ticker));

          // logger.info({
          //   ex: this.exchange_nm,
          //   msg: "subscribed",
          //   sub_trade: sub_trade,
          //   sub_ticker: sub_ticker,
          // });
        }
      } else if (this.exchange_cd === "E0050001") {
        // 코빗
        let sub_symbols = [];
        for (const symbol_item of this.symbols.values()) {
          let lower_symbol = `${symbol_item.product_id_cd}_${symbol_item.price_id_cd}`;
          sub_symbols.push(lower_symbol.toLowerCase());
        }
        const sub_trade = [
          {
            method: "subscribe",
            type: "trade",
            symbols: sub_symbols,
          },
        ];
        this.websocket.send(JSON.stringify(sub_trade));

        // const sub_ticker = [
        //   {
        //     method: "subscribe",
        //     type: "ticker",
        //     symbols: sub_symbols,
        //   },
        // ];
        // this.websocket.send(JSON.stringify(sub_ticker));
        // logger.info({
        //   ex: this.exchange_nm,
        //   msg: "subscribed",
        //   sub_trade: sub_trade,
        //   sub_ticker: sub_ticker,
        // });
      } else if (this.exchange_cd === "E0080001") {
        // 고팍스
        // GOPAX 거래소 오더북 구독 (ws 요청)
        for (const symbol_item of this.symbols.values()) {
          const subscribe_symbol = `${symbol_item.product_id_cd}-${symbol_item.price_id_cd}`;
          console.log("subscribe_symbol", subscribe_symbol);
          sub = {
            n: "SubscribeToTradingPair",
            o: { tradingPairName: subscribe_symbol },
          };
          this.websocket.send(JSON.stringify(sub));
          logger.info({
            ex: this.exchange_nm,
            msg: "subscribed",
            sub: sub,
          });
        }
      }
      if (this._reconnecting) {
        sendTelegramMessage(this.exchange_nm, `${this.exchange_nm} Trade-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.exchange_nm, `${this.exchange_nm} Trade-Collector WebSocket opened (initial connect).`, false);
      }
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
        // 큐에 메시지 추가
        // console.log(raw.toString());
        this.enqueue(raw);
      } catch (e) {
        logger.warn({ ex: this.exchange_nm, err: String(e) }, "queue enqueue error");
      }
    });

    // 큐 처리 시작
    this.queueProcessInterval = setInterval(() => {
      this.processQueue().catch(e => {
        logger.error({ ex: this.exchange_nm, err: String(e) }, "queue process interval error");
      });
    }, OPTIMAL_PROCESS_INTERVAL);
    this.websocket.on("close", () => {
      // 큐 처리 중지
      logger.info({ ex: this.exchange_nm, msg: "WebSocket closed" });
      if (this.queueProcessInterval) {
        clearInterval(this.queueProcessInterval);
        this.queueProcessInterval = null;
      }
      this._reconnecting = true;
      setTimeout(() => this.start(), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.exchange_nm, `${this.exchange_nm} Trade-Collector WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.websocket.on("error", (e) => {
      logger.error({ ex: this.exchange_nm, err: String(e) }, "ws error");
      sendTelegramMessage( this.exchange_nm, `[${this.exchange_nm}] Trade-Collector WebSocket error.`);
    });
  }
}

// Trade 데이터 전송 함수 
async function SendToTrade_ZMQ(trade_item, msg) {
  const topic = `${trade_item.exchange_cd}`;
  const raw_trade_item = {
    ...trade_item,
    "type": "trade",
    raw: msg,
  };
  const payload = {
    ...trade_item,
    "type": "trade",
  };
  const ts = Date.now();
  await Promise.all([
    send_push(topic, ts, payload),
    send_publisher(topic, raw_trade_item)
  ]);
}

async function SendToTicker_ZMQ(trade_item, msg) {
  const topic = `${trade_item.exchange_cd}`;
  const raw_trade_item = {
    ...trade_item,
    "type": "ticker",
    raw: msg,
  };
  const payload = {
    ...trade_item,
    "type": "ticker",
  };
  const ts = Date.now();
  await Promise.all([
    send_push(topic, ts, payload),
    send_publisher(topic, raw_trade_item)
  ]);
}

/** ------------------- 실행부 ------------------- */
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

    // startIntervals();
    // scheduleDailyReport();
    logger.info("All clients initialized and started");
  } catch (error) {
    logger.error(
      { err: String(error), stack: error.stack },
      "Failed to initialize clients"
    );
    throw error;
  }
}

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
  initializeWebsocketClients,
};