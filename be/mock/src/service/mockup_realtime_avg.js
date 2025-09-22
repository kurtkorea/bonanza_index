"use strict";

/**
 * 국내 4대 거래소(업비트/빗썸/코빗/코인원)
 * - 실시간 오더북 수신 (WS)
 * - 각 거래소별 1초 윈도우 동안 들어온 모든 스냅샷의 "레벨별 평균 호가" 생성
 * - 그 평균 오더북으로 개별 거래소 VWAP(매수=Ask기반, 매도=Bid기반) 산출
 * - 동시에 4거래소 평균오더북 총합으로 "집계 VWAP" 산출
 * - depth: 15 고정
 * - 주기: TICK_MS(기본 1000ms)
 * - 로깅: Winston(JSON)
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

/** bids/asks 를 표준형으로: bids 내림차순, asks 오름차순, 상위 DEPTH */
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

/** -------- 1초 윈도우 버퍼(거래소별) --------
 * windowBuffers[exchange] = { asks: Array<Array<{price,qty}>>, bids: Array<Array<{price,qty}>> }
 */
const windowBuffers = {};
const latestSnapshot = {}; // 디버그/백업용 최신 스냅샷

function pushSnapshotToBuffer(name, book) {
  if (!windowBuffers[name]) windowBuffers[name] = { asks: [], bids: [] };
  const asks15 = book.asks.slice(0, DEPTH);
  const bids15 = book.bids.slice(0, DEPTH);
  windowBuffers[name].asks.push(asks15);
  windowBuffers[name].bids.push(bids15);
  latestSnapshot[name] = book;
}

/** 버퍼에서 레벨별 평균 오더북 생성 */
function buildAveragedBookFromBuffer(buf, depth = DEPTH) {
  const avgSide = (sideArr) => {
    const out = [];
    for (let i = 0; i < depth; i++) {
      let c = 0, sumP = 0, sumQ = 0;
      for (const snap of sideArr) {
        const lvl = snap[i];
        if (!lvl) continue;
        sumP += lvl.price;
        sumQ += lvl.qty;
        c++;
      }
      if (c > 0) out.push({ price: sumP / c, qty: sumQ / c });
    }
    return out;
  };
  return { asks: avgSide(buf.asks), bids: avgSide(buf.bids) };
}

/** 개별 거래소 VWAP */
function computePerExchange(book) {
  const buyVWAP  = vwapBuyFromAsk(book.asks, DEPTH);   // 매수 VWAP = Ask 기반
  const sellVWAP = vwapSellFromBid(book.bids, DEPTH);  // 매도 VWAP = Bid 기반
  const midVWAP  = (buyVWAP + sellVWAP) / 2;
  return { buyVWAP, sellVWAP, midVWAP };
}

/** 여러 거래소 평균오더북 합산 → 집계 VWAP */
function computeAggregateFromAveragedBooks(avgBooks) {
  const mergedAsks = [];
  const mergedBids = [];
  for (const name of Object.keys(avgBooks)) {
    mergedAsks.push(...avgBooks[name].asks);
    mergedBids.push(...avgBooks[name].bids);
  }
  const buyVWAP  = vwapBuyFromAsk(mergedAsks, DEPTH);
  const sellVWAP = vwapSellFromBid(mergedBids, DEPTH);
  const midVWAP  = (buyVWAP + sellVWAP) / 2;
  return { buyVWAP, sellVWAP, midVWAP };
}

/** ------------------- 거래소별 WS 클라이언트 ------------------- */

// 업비트
class UpbitClient {
  constructor(code = "KRW-BTC") {
    this.name = "upbit";
    this.url  = "wss://api.upbit.com/websocket/v1";
    this.code = code;
    this.ws   = null;
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
          onbook(this.name, normalize(bids, asks));
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
          onbook(this.name, normalize(bids, asks));
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
          const a = (msg.data.asks || []).map(x => [x.price, x.qty]);
          const b = (msg.data.bids || []).map(x => [x.price, x.qty]);
          cb(this.name, normalize(b, a));
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

      // 유휴 종료 방지용 PING (권장)
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
          onbook(this.name, normalize(b, a));
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

/** ------------------- 실행부 ------------------- */

// onbook: 스냅샷을 윈도우 버퍼에 적재
const clients = [
  new UpbitClient("KRW-BTC"),
  new BithumbClient("KRW-BTC"),
  new KorbitClient("btc_krw"),
  new CoinoneClient("KRW", "BTC"),
];

clients.forEach((c) =>
  c.start((name, book) => {
    pushSnapshotToBuffer(name, book);
  })
);

// 1초마다: 버퍼→평균오더북→VWAP 산출 후 버퍼 초기화
setInterval(() => {
  const names = Object.keys(windowBuffers);
  if (!names.length) return;

  // 1) 거래소별 평균오더북 생성 & VWAP 로그
  const averagedBooks = {};
  for (const name of names) {
    const buf = windowBuffers[name];
    if (!buf.asks.length && !buf.bids.length) continue;

    const avgBook = buildAveragedBookFromBuffer(buf, DEPTH);
    averagedBooks[name] = avgBook;

    const { buyVWAP, sellVWAP, midVWAP } = computePerExchange(avgBook);
    if (buyVWAP && sellVWAP) {
      logger.info({
        type: "per-exchange",
        exchange: name,
        t: new Date().toISOString(),
        depth: DEPTH,
        snaps: { asks: buf.asks.length, bids: buf.bids.length }, // 윈도우 내 스냅샷 개수
        buyVWAP:  Number(buyVWAP.toFixed(2)),
        sellVWAP: Number(sellVWAP.toFixed(2)),
        midVWAP:  Number(midVWAP.toFixed(2)),
      });
    }
  }

  // 2) 집계 VWAP (평균오더북들을 합쳐서)
  if (Object.keys(averagedBooks).length) {
    const agg = computeAggregateFromAveragedBooks(averagedBooks);
    if (agg.buyVWAP && agg.sellVWAP) {
      logger.info({
        type: "aggregate",
        t: new Date().toISOString(),
        depth: DEPTH,
        sources: Object.keys(averagedBooks),
        buyVWAP:  Number(agg.buyVWAP.toFixed(2)),
        sellVWAP: Number(agg.sellVWAP.toFixed(2)),
        midVWAP:  Number(agg.midVWAP.toFixed(2)),
      });
    }
  }

  // 3) 윈도우 리셋
  for (const name of names) {
    windowBuffers[name].asks = [];
    windowBuffers[name].bids = [];
  }
}, TICK_MS);

// 안전 종료
process.on("SIGINT", () => {
  logger.warn("Stopping...");
  try { clients.forEach((c) => c.ws && c.ws.close()); } catch {}
  process.exit(0);
});
