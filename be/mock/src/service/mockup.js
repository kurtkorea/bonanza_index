"use strict";

/**
 * 국내 4대 거래소(업비트/빗썸/코빗/코인원) 오더북 통합 VWAP & Mid 산출
 * - 심볼: BTC/KRW (각 거래소 형식으로 매핑)
 * - depth: 15단계 고정 (매수 15, 매도 15)
 * - 1초 주기 산출 (TICK_MS 환경변수로 조절 가능)
 * - 로깅: Winston
 */

const WebSocket = require("ws");
const winston = require("winston");

// ===== 설정 =====
const DEPTH   = 15; // 요청하신대로 15단계 고정
const TICK_MS = Number(process.env.TICK_MS || 1000);

// ===== Winston 로거 =====
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// ===== 공통 유틸 =====
const toNum = (x) => (typeof x === "string" ? Number(x) : x);

function vwap(levels) {
  let sumPQ = 0, sumQ = 0;
  for (const { price, qty } of levels) {
    if (price > 0 && qty > 0) { sumPQ += price * qty; sumQ += qty; }
  }
  return sumQ > 0 ? sumPQ / sumQ : 0;
}

function computeIndex(books) {
  const allAsks = [], allBids = [];
  for (const ex in books) {
    const b = books[ex];
    if (!b) continue;
    if (b.asks?.length) allAsks.push(...b.asks);
    if (b.bids?.length) allBids.push(...b.bids);
  }
  const askVWAP = vwap(allAsks);
  const bidVWAP = vwap(allBids);
  const mid = (askVWAP + bidVWAP) / 2;
  return { askVWAP, bidVWAP, mid };
}

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

// ===== 1) 업비트 =====
class UpbitClient {
  constructor(code = "KRW-BTC") {
    this.name = "upbit";
    this.url = "wss://api.upbit.com/websocket/v1";
    this.code = code;
    /** @type {WebSocket|null} */
    this.ws = null;
    this.book = { bids: [], asks: [] };
  }
  start(onbook) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = [
        { ticket: "vwap-sample" },
        { type: "orderbook", codes: [this.code] },
        { format: "SIMPLE" }, // SIMPLE: ap/bp/as/bs, obu
      ];
      this.ws.send(Buffer.from(JSON.stringify(req), "utf8"));
      logger.info({ ex: this.name, code: this.code, msg: "subscribed" });
    });
    this.ws.on("message", (buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        if ((msg.ty || msg.type) === "orderbook") {
          const units = msg.obu || msg.orderbook_units || [];
          const bids = units.map((u) => [u.bp ?? u.bid_price, u.bs ?? u.bid_size]);
          const asks = units.map((u) => [u.ap ?? u.ask_price, u.as ?? u.ask_size]);
          this.book = normalize(bids, asks);
          onbook(this.name, this.book);
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => setTimeout(() => this.start(onbook), 1500));
    this.ws.on("error", (e) => logger.error({ ex: this.name, err: String(e) }, "ws error"));
  }
}

// ===== 2) 빗썸 =====
class BithumbClient {
  constructor(code = "KRW-BTC") {
    this.name = "bithumb";
    this.url = "wss://ws-api.bithumb.com/websocket/v1";
    this.code = code;
    this.ws = null;
    this.book = { bids: [], asks: [] };
  }
  start(onbook) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = [
        { ticket: "vwap-sample" },
        { type: "orderbook", codes: [this.code] },
        { format: "SIMPLE" },
      ];
      this.ws.send(JSON.stringify(req));
      logger.info({ ex: this.name, code: this.code, msg: "subscribed" });
    });
    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if ((msg.ty ?? msg.type) === "orderbook") {
          const units = msg.obu || msg.orderbook_units || [];
          const bids = units.map((u) => [u.bp ?? u.bid_price, u.bs ?? u.bid_size]);
          const asks = units.map((u) => [u.ap ?? u.ask_price, u.as ?? u.ask_size]);
          this.book = normalize(bids, asks);
          onbook(this.name, this.book);
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => setTimeout(() => this.start(onbook), 1700));
    this.ws.on("error", (e) => logger.error({ ex: this.name, err: String(e) }, "ws error"));
  }
}

// ===== 3) 코빗 =====
class KorbitClient {
  constructor(symbol = "btc_krw") {
    this.name = "korbit";
    this.url = "wss://ws-api.korbit.co.kr/v2/public";
    this.symbol = symbol;
    this.ws = null;
    this.book = { bids: [], asks: [] };
  }
  start(onbook) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = JSON.stringify([{ method: "subscribe", type: "orderbook", symbols: [this.symbol] }]);
      this.ws.send(req);
      logger.info({ ex: this.name, symbol: this.symbol, msg: "subscribed" });
    });
    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "orderbook" && msg.data) {
          const a = (msg.data.asks || []).map((x) => [x.price ?? x[0], x.quantity ?? x[1]]);
          const b = (msg.data.bids || []).map((x) => [x.price ?? x[0], x.quantity ?? x[1]]);
          this.book = normalize(b, a);
          onbook(this.name, this.book);
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => setTimeout(() => this.start(onbook), 2000));
    this.ws.on("error", (e) => logger.error({ ex: this.name, err: String(e) }, "ws error"));
  }
}

// ===== 4) 코인원 =====
class CoinoneClient {
  constructor(qc = "KRW", tc = "BTC") {
    this.name = "coinone";
    this.url = "wss://stream.coinone.co.kr";
    this.qc = qc;
    this.tc = tc;
    this.ws = null;
    this.book = { bids: [], asks: [] };
    this.pingInterval = null;
  }
  start(onbook) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const sub = {
        request_type: "SUBSCRIBE",
        channel: "ORDERBOOK",
        topic: { quote_currency: this.qc, target_currency: this.tc },
        format: "SHORT", // p/q
      };
      this.ws.send(JSON.stringify(sub));
      logger.info({ ex: this.name, qc: this.qc, tc: this.tc, msg: "subscribed" });

      // 권장: 주기적 PING (유휴 연결 종료 방지)
      this.pingInterval = setInterval(() => {
        try { this.ws?.send(JSON.stringify({ request_type: "PING" })); } catch {}
      }, 20 * 60 * 1000);
    });
    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if ((msg.c === "ORDERBOOK" || msg.channel === "ORDERBOOK") && (msg.d || msg.data)) {
          const d = msg.d || msg.data;
          const a = (d.a || d.asks || []).map((u) => [u.p ?? u.price, u.q ?? u.qty]);
          const b = (d.b || d.bids || []).map((u) => [u.p ?? u.price, u.q ?? u.qty]);
          this.book = normalize(b, a);
          onbook(this.name, this.book);
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => {
      if (this.pingInterval) clearInterval(this.pingInterval);
      setTimeout(() => this.start(onbook), 2200);
    });
    this.ws.on("error", (e) => logger.error({ ex: this.name, err: String(e) }, "ws error"));
  }
}

// ===== 실행부 =====
const books = {};
const clients = [
  new UpbitClient("KRW-BTC"),
  new BithumbClient("KRW-BTC"),
  new KorbitClient("btc_krw"),
  new CoinoneClient("KRW", "BTC"),
];

clients.forEach((c) => {
  c.start((name, book) => {
    books[name] = book;
  });
});

// 1초마다 지수 산출
setInterval(() => {

  
  if (Object.keys(books).length === 0) return;
  const { askVWAP, bidVWAP, mid } = computeIndex(books);
  if (askVWAP && bidVWAP) {
    logger.info({
      t: new Date().toISOString(),
      bidVWAP: Number(bidVWAP.toFixed(2)),
      askVWAP: Number(askVWAP.toFixed(2)),
      midVWAP: Number(mid.toFixed(2)),
      sources: Object.keys(books),
      depth: DEPTH,
    });
  }
}, TICK_MS);

// 안전 종료
process.on("SIGINT", () => {
  logger.warn("Stopping...");
  try { clients.forEach((c) => c.ws && c.ws.close()); } catch {}
  process.exit(0);
});
