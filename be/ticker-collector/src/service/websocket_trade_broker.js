"use strict";

/**
 * 국내 4대 거래소(업비트/빗썸/코빗/코인원)
 * - trade: 실시간 체결 데이터
 * - 각 거래소별 체결 데이터를 수집
 */

const WebSocket = require("ws");
const winston = require("winston");
const { MARKET_NO_ENUM, MARKET_NAME_ENUM, RECONNECT_INTERVAL } = require("../utils/common.js");
const { send_push } = require("../utils/zmq-sender-push.js");
const { send_publisher } = require("../utils/zmq-sender-pub.js");

const { sendTelegramMessage } = require("../utils/telegram_push.js");

// ===== 로거 =====
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

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
  }
  start() {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = [
        { ticket: "execavg-tw" },
        { type: "trade", codes: [this.code] },
        { format: "SIMPLE" },
      ];
      this.ws.send(Buffer.from(JSON.stringify(req), "utf8"));
      logger.info({ ex: this.name, msg: "subscribed", code: this.code });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket opened (initial connect).`, false);
      }
      this._reconnecting = false;
      this._closeNotified = false;
    });
    this.ws.on("message", async (raw) => {
      try {
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
          // console.log( JSON.stringify(trade_item, null, 2) );
          await SendToTrade_ZMQ(trade_item, msg);
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => {
      this._reconnecting = true;
      setTimeout(() => this.start(), RECONNECT_INTERVAL);
      if (!this._closeNotified) {
        sendTelegramMessage(this.name, `${this.name} WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => logger.error({ ex: this.name, err: String(e) }, "ws error"));
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
      this.ws.send(JSON.stringify(req));
      logger.info({ ex: this.name, msg: "subscribed", code: this.code });
      if (this._reconnecting) {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessage(this.name, `${this.name} Trade-Collector WebSocket opened (initial connect).`, false);
      }
      this._reconnecting = false;
      this._closeNotified = false;
    });
    this.ws.on("message", async (raw) => {
      try {
        // 빗썸 체결 데이터 요청 포맷 수정
        // 빗썸 공식 문서 기준, 체결 데이터 구독은 다음과 같이 요청해야 함
        // {
        //   "type":"transaction",
        //   "symbols":["BTC_KRW"]
        // }
        // 기존 코드에서 tickTypes는 필요 없음
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
            // console.log( new Date(trade_item.marketAt).toISOString(), new Date(trade_item.collectorAt).toISOString() );
            // console.log( JSON.stringify(trade_item, null, 2) );
            await SendToTrade_ZMQ(trade_item, msg);
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
        sendTelegramMessage(this.name, `${this.name} WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => logger.error({ ex: this.name, err: String(e) }, "ws error"));
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
    });
    this.ws.on("message", async (raw) => {
      try {
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
            // console.log( new Date(trade_item.marketAt).toISOString(), new Date(trade_item.collectorAt).toISOString() );
            // console.log( JSON.stringify(trade_item, null, 2) );
            await SendToTrade_ZMQ(trade_item, msg);
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
        sendTelegramMessage(this.name, `${this.name} WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => logger.error({ ex: this.name, err: String(e) }, "ws error"));
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
      }, 20 * 60 * 1000);
    });
    this.ws.on("message", async (raw) => {
      try {
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
            // console.log( new Date(trade_item.marketAt).toISOString(), new Date(trade_item.collectorAt).toISOString() );
            // console.log( JSON.stringify(trade_item, null, 2) );
            await SendToTrade_ZMQ(trade_item, msg);
          }
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
        sendTelegramMessage(this.name, `${this.name} WebSocket closed.`);
        this._closeNotified = true;
      }
    });
    this.ws.on("error", (e) => logger.error({ ex: this.name, err: String(e) }, "ws error"));
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


// Export the client classes
module.exports = {
  UpbitClientTrade,
  BithumbClientTrade,
  KorbitClientTrade,
  CoinoneClientTrade
};