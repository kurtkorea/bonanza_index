"use strict";

/**
 * 국내 4대 거래소(업비트/빗썸/코빗/코인원) 실시간 오더북 통합
 * - 심볼: BTC/KRW (각 거래소 포맷으로 매핑)
 * - depth: 15호가
 * - 1초 주기 산출 (TICK_MS로 조절)
 * - 로그: Winston(JSON)
 */

const WebSocket = require("ws");
const winston = require("winston");
const { vwapBuyFromAsk, vwapSellFromBid } = require("../utils/vwap");

// ===== 설정 =====
const DEPTH   = 15;
const TICK_MS = Number(process.env.TICK_MS || 1000);

// ===== 로거 =====
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

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

function computeAll(books) {
  const allAsks = [], allBids = [];
  for (const ex in books) {
    const b = books[ex]; if (!b) continue;
    if (b.asks?.length) allAsks.push(...b.asks);
    if (b.bids?.length) allBids.push(...b.bids);
  }
  const buyVWAP  = vwapBuyFromAsk(allAsks, DEPTH);  // 매수 VWAP (Ask 기준)
  const sellVWAP = vwapSellFromBid(allBids, DEPTH); // 매도 VWAP (Bid 기준)
  const midVWAP  = (buyVWAP + sellVWAP) / 2;
  return { buyVWAP, sellVWAP, midVWAP };
}

// ===== 거래소별 클라이언트 =====

// 업비트
class UpbitClient {
  constructor(code = "KRW-BTC") {
    this.name = "upbit";
    this.url  = "wss://api.upbit.com/websocket/v1";
    this.code = code;
    this.ws   = null;
    this.book = { bids: [], asks: [] };
  }
  start(onbook) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = [
        { ticket: "vwap-sample" },
        { type: "orderbook", codes: [this.code] },
        { format: "SIMPLE" }, // ap/bp/as/bs, obu
      ];
      this.ws.send(Buffer.from(JSON.stringify(req), "utf8"));
      logger.info({ ex: this.name, msg: "subscribed", code: this.code });
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

// 빗썸
class BithumbClient {
  constructor(code = "KRW-BTC") {
    this.name = "bithumb";
    this.url  = "wss://ws-api.bithumb.com/websocket/v1";
    this.code = code;
    this.ws   = null;
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
      logger.info({ ex: this.name, msg: "subscribed", code: this.code });
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

// 코빗
class KorbitClient {
  constructor(symbol = "btc_krw") {
    this.name = "korbit";
    this.url  = "wss://ws-api.korbit.co.kr/v2/public";
    this.symbol = symbol;
    this.ws   = null;
    this.book = { bids: [], asks: [] };
  }
  start(onbook) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = JSON.stringify([{ method: "subscribe", type: "orderbook", symbols: [this.symbol] }]);
      this.ws.send(req);
      logger.info({ ex: this.name, msg: "subscribed", symbol: this.symbol });
    });
    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "orderbook" && msg.data) {
          const a = (msg.data.asks || []).map((x) => [x.price ?? x[0], x.qty ?? x[1]]);
          const b = (msg.data.bids || []).map((x) => [x.price ?? x[0], x.qty ?? x[1]]);
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

// 코인원
class CoinoneClient {
  constructor(qc = "KRW", tc = "BTC") {
    this.name = "coinone";
    this.url  = "wss://stream.coinone.co.kr";
    this.qc   = qc;
    this.tc   = tc;
    this.ws   = null;
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
        format: "SHORT",
      };
      this.ws.send(JSON.stringify(sub));
      logger.info({ ex: this.name, msg: "subscribed", qc: this.qc, tc: this.tc });

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

function computePerExchange(book) {
  const buyVWAP  = vwapBuyFromAsk(book.asks, DEPTH);   // 매수 VWAP = Ask 기반
  const sellVWAP = vwapSellFromBid(book.bids, DEPTH);  // 매도 VWAP = Bid 기반
  const midVWAP  = (buyVWAP + sellVWAP) / 2;
  return { buyVWAP, sellVWAP, midVWAP };
}

// ---- 기존: 통합 VWAP (모든 거래소 합산)
function computeAggregate(books) {
  const allAsks = [], allBids = [];
  for (const ex in books) {
    const b = books[ex]; if (!b) continue;
    if (b.asks?.length) allAsks.push(...b.asks);
    if (b.bids?.length) allBids.push(...b.bids);
  }
  const buyVWAP  = vwapBuyFromAsk(allAsks, DEPTH);
  const sellVWAP = vwapSellFromBid(allBids, DEPTH);
  const midVWAP  = (buyVWAP + sellVWAP) / 2;
  return { buyVWAP, sellVWAP, midVWAP };
}

// ===== 실행부 =====
const books = {};
const clients = [
  new UpbitClient("KRW-BTC"),
  new BithumbClient("KRW-BTC"),
  new KorbitClient("btc_krw"),
  new CoinoneClient("KRW", "BTC"),
];

// clients.forEach((c) => c.start((name, book) => { books[name] = book; }));

// setInterval(() => {
//   const names = Object.keys(books);
//   if (!names.length) return;

//   // 1) 거래소별 로그
//   for (const name of names) {
//     const { buyVWAP, sellVWAP, midVWAP } = computePerExchange(books[name]);
//     if (buyVWAP && sellVWAP) {
//       console.log({
//         type: "per-exchange",
//         exchange: name,
//         t: new Date().toISOString(),
//         depth: DEPTH,
//         buyVWAP:  Number(buyVWAP.toFixed(2)),   // 매수 VWAP (Ask 기반)
//         sellVWAP: Number(sellVWAP.toFixed(2)),  // 매도 VWAP (Bid 기반)
//         midVWAP:  Number(midVWAP.toFixed(2)),
//       });
//     }
//   }

//   // 2) 통합(집계) 로그
//   const agg = computeAggregate(books);
//   if (agg.buyVWAP && agg.sellVWAP) {
//     console.log({
//       type: "aggregate",
//       t: new Date().toISOString(),
//       depth: DEPTH,
//       sources: names,
//       buyVWAP:  Number(agg.buyVWAP.toFixed(2)),
//       sellVWAP: Number(agg.sellVWAP.toFixed(2)),
//       midVWAP:  Number(agg.midVWAP.toFixed(2)),
//     });
//   }
// }, TICK_MS);

// // 안전 종료 핸들러 동일
// process.on("SIGINT", () => {
//   logger.warn("Stopping...");
//   try { clients.forEach((c) => c.ws && c.ws.close()); } catch {}
//   process.exit(0);
// });