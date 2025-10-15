"use strict";

/**
 * 국내 4대 거래소(업비트/빗썸/코빗/코인원)
 * - ticker: 실시간 체결/가격 정보
 * - 각 거래소별 ticker 가격을 스냅샷마다 수집
 * - 시간가중(TW): 직전 가격 × Δt(ms) 누적 → 1초마다 ∑(price×Δt)/∑Δt 출력
 * - 개별 거래소 + 집계(평균) 모두 동일 규칙 적용
 * - 시고저종(시가, 고가, 저가, 종가) 데이터 추가
 */

const WebSocket = require("ws");
const winston = require("winston");
const { MARKET_NO_ENUM, MARKET_NAME_ENUM, RECONNECT_INTERVAL, isJsonValue, PING_INTERVAL } = require("../utils/common.js");
const { send_push } = require("../utils/zmq-sender-push.js");
const { send_publisher } = require("../utils/zmq-sender-pub.js");

const { sendTelegramMessage } = require("../utils/telegram_push.js");

// ===== 로거 =====
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

/** ------------------- 거래소별 WS 클라이언트 (ticker) ------------------- */

class UpbitClientTicker { 
  constructor(code = "KRW-BTC") {
    this.name = MARKET_NAME_ENUM.UPBIT;
    this.market_no = MARKET_NO_ENUM.UPBIT;
    this.url  = "wss://api.upbit.com/websocket/v1";
    this.code = code;
    this.ws   = null;
    this._reconnecting = false;
    this._closeNotified = false;  
    this.pingInterval = null;
  }
  start() {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = [
        { ticket: "execavg-tw" },
        { type: "ticker", codes: [this.code] },
        { format: "SIMPLE" },
      ];
      // try {
      //   console.log( `${this.name} Ticker PING` );
      //   this.ws?.send("PING"); 
      // } catch {

      // }
      this.ws.send(Buffer.from(JSON.stringify(req), "utf8"));
      logger.info({ ex: this.name, msg: "subscribed", code: this.code });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} Ticker-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} Ticker-Collector WebSocket opened (initial connect).`, false);
      }
      this._reconnecting = false;
      this._closeNotified = false;
      // this.pingInterval = setInterval(() => {
      //   try { this.ws?.send("PING"); } catch {}
      // }, PING_INTERVAL);
    });
    this.ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if ((msg.ty || msg.type) === "ticker") {
          const marketAt = msg.tms;
          const coollectorAt = new Date(Date.now()).getTime();
          const ticker_item = {
            symbol: process.env.SYMBOL ?? "KRW-BTC",
            exchange_no: this.market_no,
            exchange_name: this.name,
            marketAt: marketAt,
            collectorAt: coollectorAt,
            diff_ms: (coollectorAt - marketAt) / 1000,
            open: Number(msg.op),
            high: Number(msg.hp),
            low: Number(msg.lp),
            close: Number(msg.tp),
            volume: Number(msg.atv24h),
          };
          // console.log( new Date(ticker_item.marketAt).toISOString(), new Date(ticker_item.collectorAt).toISOString() );
          // console.log( JSON.stringify(ticker_item, null, 2) );
          await SendToTicker_ZMQ(ticker_item, msg);
        } else {
          if ( msg.status === "UP" ) {
            console.log( `${this.name} Ticker PONG`, msg );
          }
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => {
      this._reconnecting = true;
      setTimeout(() => this.start(), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} Ticker-CollectorWebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => {
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage( this.name, `[${this.name}] Ticker-Collector WebSocket error.`);
    });
  }
}

class BithumbClientTicker {
  constructor(code = "KRW-BTC") {
    this.name = MARKET_NAME_ENUM.BITHUMB;
    this.market_no = MARKET_NO_ENUM.BITHUMB;
    this.marketAt = null;
    this.url  = "wss://ws-api.bithumb.com/websocket/v1";
    this.code = code;
    this.ws   = null;
    this._reconnecting = false;
    this._closeNotified = false;  
    this.pingInterval = null;
  }
  start() {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = [
        { ticket: "execavg-tw" },
        { type: "ticker", codes: [this.code] },
        { format: "SIMPLE" },
      ];
      try {
        console.log( `${this.name} Ticker PING` );
        this.ws?.send("PING"); 
      } catch {}
      this.ws.send(JSON.stringify(req));
      logger.info({ ex: this.name, msg: "subscribed", code: this.code });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} Ticker-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} Ticker-Collector WebSocket opened (initial connect).`, false);
      }
      this._reconnecting = false;
      this._closeNotified = false;
      this.pingInterval = setInterval(() => {
        try { this.ws?.send("PING"); } catch {}
      }, PING_INTERVAL);
    });
    this.ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if ((msg.ty ?? msg.type) === "ticker") {
          const marketAt = msg.tms;
          const coollectorAt = new Date(Date.now()).getTime();
          const ticker_item = {
            symbol: process.env.SYMBOL ?? "KRW-BTC",
            exchange_no: this.market_no,
            exchange_name: this.name,
            marketAt: marketAt,
            collectorAt: coollectorAt,
            diff_ms: (coollectorAt - marketAt) / 1000,
            open: Number(msg.op),
            high: Number(msg.hp),
            low: Number(msg.lp),
            close: Number(msg.tp),
            volume: Number(msg.atv24h),
          };
          // console.log( new Date(ticker_item.marketAt).toISOString(), new Date(ticker_item.collectorAt).toISOString() );
          // console.log( JSON.stringify(ticker_item, null, 2) );
          await SendToTicker_ZMQ(ticker_item, msg);
        } else {
          if ( msg.status === "UP" ) {
            console.log( `${this.name} Ticker PONG`, msg );
          }
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => {
      this._reconnecting = true;
      setTimeout(() => this.start(), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} Ticker-Collector WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => {
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage( this.name, `[${this.name}] Ticker-Collector WebSocket error.`);
    });
  }
}

class KorbitClientTicker {
  constructor(symbol = "btc_krw") {
    this.name = MARKET_NAME_ENUM.KORBIT;
    this.market_no = MARKET_NO_ENUM.KORBIT;
    this.marketAt = null;
    this.url  = "wss://ws-api.korbit.co.kr/v2/public";
    this.symbol = symbol;
    this.ws   = null;
    this._reconnecting = false;
    this._closeNotified = false;  
    this.pingInterval = null;
  }
  start() {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = JSON.stringify([{ method: "subscribe", type: "ticker", symbols: [this.symbol] }]);
      this.ws.send(req);
      logger.info({ ex: this.name, msg: "subscribed", symbol: this.symbol });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} Ticker-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} Ticker-Collector WebSocket opened (initial connect).`, false);
      }
      this._reconnecting = false;
      this._closeNotified = false;
      this.pingInterval = setInterval(() => {
        try { this.ws?.send("PING"); } catch {}
      }, PING_INTERVAL);
    });
    this.ws.on("message", async (raw) => {
      try {
        if ( !isJsonValue(raw.toString()) ) {
          console.log( `${this.name} Ticker PONG`, raw.toString() );
        } else {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "ticker" && msg.data) {
            const marketAt = msg.timestamp;
            const coollectorAt = new Date(Date.now()).getTime();
            const ticker_item = {
              symbol: process.env.SYMBOL ?? "KRW-BTC",
              exchange_no: this.market_no,
              exchange_name: this.name,
              marketAt: marketAt,
              collectorAt: coollectorAt,
              diff_ms: (coollectorAt - marketAt) / 1000,
              open: Number(msg.data.open),
              high: Number(msg.data.high),
              low: Number(msg.data.low),
              close: Number(msg.data.close),
              volume: Number(msg.data.volume),
            };
            //console.log( new Date(ticker_item.marketAt).toISOString(), new Date(ticker_item.collectorAt).toISOString() );
            // console.log( JSON.stringify(ticker_item, null, 2) );
            await SendToTicker_ZMQ(ticker_item, msg);
          }
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => {
      this._reconnecting = true;
      setTimeout(() => this.start(), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} Ticker-Collector WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => {
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage( this.name, `[${this.name}] Ticker-Collector WebSocket error.`);
    });
  }
}

class CoinoneClientTicker {
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
  }
  start() {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const sub = {
        request_type: "SUBSCRIBE",
        channel: "TICKER",
        topic: { quote_currency: this.qc, target_currency: this.tc },
        format: "SHORT",
      };
      this.ws.send(JSON.stringify(sub));
      logger.info({ ex: this.name, msg: "subscribed", qc: this.qc, tc: this.tc });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} Ticker-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} Ticker-Collector WebSocket opened (initial connect).`, false);
      }
      this._reconnecting = false;
      this._closeNotified = false;
      this.pingInterval = setInterval(() => {
        try { this.ws?.send(JSON.stringify({ request_type: "PING" })); } catch {}
      }, PING_INTERVAL);
    });
    this.ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if ((msg.c === "TICKER" || msg.channel === "TICKER") && (msg.d || msg.data)) {
          const d = msg.d || msg.data;
          const marketAt = d.t;
          const coollectorAt = new Date(Date.now()).getTime();
          const ticker_item = {
            symbol: process.env.SYMBOL ?? "KRW-BTC",
            exchange_no: this.market_no,
            exchange_name: this.name,
            marketAt: marketAt,
            collectorAt: coollectorAt,
            diff_ms: (coollectorAt - marketAt) / 1000,
            open: Number(d.fi),
            high: Number(d.hi),
            low: Number(d.lo),
            close: Number(d.la),
            volume: Number(d.tv),
          }
          // console.log( new Date(ticker_item.marketAt).toISOString(), new Date(ticker_item.collectorAt).toISOString() );
          // console.log( JSON.stringify(ticker_item, null, 2) );
          await SendToTicker_ZMQ(ticker_item, msg);
        } else {
          console.log( `${this.name} Ticker PONG`, msg );
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => {
      if (this.pingInterval) clearInterval(this.pingInterval);
      this._reconnecting = true;
      setTimeout(() => this.start(), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} Ticker-Collector WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => {
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage( this.name, `[${this.name}] Ticker-Collector WebSocket error.`);
    });
  }
}

// Ticker에 데이터를 전송하는 함수
async function SendToTicker_ZMQ(ticker_item, msg) {
  // console.log( JSON.stringify(ticker_item, null, 2) )
  const topic = `${ticker_item.exchange_no}/${ticker_item.symbol}/ticker`;

  const raw_ticker_item = {
    ...ticker_item,
    raw: msg,
  };

  const ts = Date.now();

  // ZMQ PUSH 방식으로 전송 => DB에 ticker를 저장하는 프로세스에 전송
  // ZMQ PUB 방식으로 전송 => 각 거래소/SYMBOL 별로 전송하고 각 프로세스에서 지수 산출하고 DB 저장
  await Promise.all([
    send_push(topic, ts, ticker_item),
    send_publisher(ticker_item.symbol + "/ticker", raw_ticker_item)
  ]);
}
/** ------------------- 실행부 ------------------- */

// 스냅샷 수신 → 시간가중 누적(개별/집계)
const clients = [
  new UpbitClientTicker("KRW-BTC"),
  new BithumbClientTicker("KRW-BTC"),
  new KorbitClientTicker("btc_krw"),
  new CoinoneClientTicker("KRW", "BTC"),
];

clients.forEach(c => c.start());

// Export the client classes
module.exports = {
  UpbitClientTicker,
  BithumbClientTicker,
  KorbitClientTicker,
  CoinoneClientTicker
};