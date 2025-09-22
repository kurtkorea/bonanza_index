"use strict";

/**
 * 국내 4대 거래소(업비트/빗썸/코빗/코인원)
 * - depth: 15
 * - 목표수량 Q에 대한 "실행평단(Execution Avg Price)"을 스냅샷마다 계산
 * - 시간가중(TW): 직전 실행평단 × Δt(ms) 누적 → 1초마다 ∑(price×Δt)/∑Δt 출력
 * - 거래소별 + 집계(합산 북) 처리
 */

const WebSocket = require("ws");
const winston = require("winston");
const { execAvgBuyFromAsk, execAvgSellFromBid } = require("../utils/vwap_exec");

// ===== 설정 =====
const DEPTH    = 15;
const TICK_MS  = Number(process.env.TICK_MS || 1000);
const TARGET_Q = Number(process.env.Q || 0.5); // 예: 0.5 BTC

// ===== 로거 =====
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

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

/** 현재 북 → 목표수량 Q 실행평단(매수/매도) 및 mid(평균) */
function instantExecFromBook(book) {
  const buy  = execAvgBuyFromAsk(book.asks, TARGET_Q, DEPTH);   // Q에 대한 매수 실행평단
  const sell = execAvgSellFromBid(book.bids, TARGET_Q, DEPTH);  // Q에 대한 매도 실행평단
  if (buy == null || sell == null) return { buy: null, sell: null, mid: null };
  const mid  = (buy + sell) / 2;
  return { buy, sell, mid };
}

/** 합산 북(여러 거래소) 생성 */
function mergeBooks(latest) {
  const asks = [];
  const bids = [];
  for (const ex of Object.keys(latest)) {
    const b = latest[ex]; if (!b) continue;
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

/** ------------------- 전역 상태 (중복 제거됨) ------------------- */

// 최신 스냅샷
const latestBook = {
  upbit:   null,
  bithumb: null,
  korbit:  null,
  coinone: null,
};

// 개별 거래소 TW 누적기
const exchAcc = {
  upbit:   makeAcc(),
  bithumb: makeAcc(),
  korbit:  makeAcc(),
  coinone: makeAcc(),
};

// 집계 TW 누적기
const aggAcc = makeAcc();

/** 스냅샷 처리: 개별/집계 각각 Δt 누적 후 즉시값 갱신 */
function onSnapshot(exchangeName, bookStd) {
  const now = Date.now();

  // 1) 개별
  {
    const acc = exchAcc[exchangeName];
    accumulate(acc, now);
    const inst = instantExecFromBook(bookStd);
    if (inst.buy != null && inst.sell != null) setLast(acc, inst);
  }

  latestBook[exchangeName] = bookStd;

  // 2) 집계
  {
    accumulate(aggAcc, now);
    const merged = mergeBooks(latestBook);
    const instAgg = instantExecFromBook(merged);
    if (instAgg.buy != null && instAgg.sell != null) setLast(aggAcc, instAgg);
  }
}

/** ------------------- 거래소별 WS 클라이언트 ------------------- */

class UpbitClient {
  constructor(code = "KRW-BTC") {
    this.name = "upbit";
    this.url  = "wss://api.upbit.com/websocket/v1";
    this.code = code;
    this.ws   = null;
  }
  start(cb) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = [
        { ticket: "execavg-tw" },
        { type: "orderbook", codes: [this.code] },
        { format: "SIMPLE" },
      ];
      this.ws.send(Buffer.from(JSON.stringify(req), "utf8"));
      logger.info({ ex: this.name, msg: "subscribed", code: this.code });
    });
    this.ws.on("message", (buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        if ((msg.ty || msg.type) === "orderbook") {
          const units = msg.obu || msg.orderbook_units || [];
          const bids = units.map(u => [u.bp ?? u.bid_price, u.bs ?? u.bid_size]);
          const asks = units.map(u => [u.ap ?? u.ask_price, u.as ?? u.ask_size]);
          cb(this.name, normalize(bids, asks));
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => setTimeout(() => this.start(cb), 1500));
    this.ws.on("error", (e) => logger.error({ ex: this.name, err: String(e) }, "ws error"));
  }
}

class BithumbClient {
  constructor(code = "KRW-BTC") {
    this.name = "bithumb";
    this.url  = "wss://ws-api.bithumb.com/websocket/v1";
    this.code = code;
    this.ws   = null;
  }
  start(cb) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = [
        { ticket: "execavg-tw" },
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
          const bids = units.map(u => [u.bp ?? u.bid_price, u.bs ?? u.bid_size]);
          const asks = units.map(u => [u.ap ?? u.ask_price, u.as ?? u.ask_size]);
          cb(this.name, normalize(bids, asks));
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => setTimeout(() => this.start(cb), 1700));
    this.ws.on("error", (e) => logger.error({ ex: this.name, err: String(e) }, "ws error"));
  }
}

class KorbitClient {
  constructor(symbol = "btc_krw") {
    this.name = "korbit";
    this.url  = "wss://ws-api.korbit.co.kr/v2/public";
    this.symbol = symbol;
    this.ws   = null;
  }
  start(cb) {
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
          const a = (msg.data.asks || []).map(x => [x.price ?? x[0], x.quantity ?? x[1]]);
          const b = (msg.data.bids || []).map(x => [x.price ?? x[0], x.quantity ?? x[1]]);
          cb(this.name, normalize(b, a));
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => setTimeout(() => this.start(cb), 2000));
    this.ws.on("error", (e) => logger.error({ ex: this.name, err: String(e) }, "ws error"));
  }
}

class CoinoneClient {
  constructor(qc = "KRW", tc = "BTC") {
    this.name = "coinone";
    this.url  = "wss://stream.coinone.co.kr";
    this.qc   = qc;
    this.tc   = tc;
    this.ws   = null;
    this.pingInterval = null;
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
        try { this.ws?.send(JSON.stringify({ request_type: "PING" })); } catch {}
      }, 20 * 60 * 1000);
    });
    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if ((msg.c === "ORDERBOOK" || msg.channel === "ORDERBOOK") && (msg.d || msg.data)) {
          const d = msg.d || msg.data;
          const a = (d.a || d.asks || []).map(u => [u.p ?? u.price, u.q ?? u.qty]);
          const b = (d.b || d.bids || []).map(u => [u.p ?? u.price, u.q ?? u.qty]);
          cb(this.name, normalize(b, a));
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => {
      if (this.pingInterval) clearInterval(this.pingInterval);
      setTimeout(() => this.start(cb), 2200);
    });
    this.ws.on("error", (e) => logger.error({ ex: this.name, err: String(e) }, "ws error"));
  }
}

/** ------------------- 실행부 ------------------- */

// 스냅샷 수신 → 시간가중 누적(개별/집계)
const clients = [
  new UpbitClient("KRW-BTC"),
  new BithumbClient("KRW-BTC"),
  new KorbitClient("btc_krw"),
  new CoinoneClient("KRW", "BTC"),
];

clients.forEach(c => c.start((name, bookStd) => onSnapshot(name, bookStd)));

// 1초마다 창 닫고 보고
setInterval(() => {
  const now = Date.now();

  // 개별
  for (const ex of Object.keys(exchAcc)) {
    accumulate(exchAcc[ex], now); // 창 끝까지 Δt 반영
    const rep = reportTW(exchAcc[ex]);
    if (rep) {
      logger.info({
        type: "per-exchange-execavg-timeweighted",
        exchange: ex,
        t: new Date(now).toISOString(),
        depth: DEPTH,
        Q: TARGET_Q,
        buyTWExec:  Number(rep.buy.toFixed(2)),
        sellTWExec: Number(rep.sell.toFixed(2)),
        midTWExec:  Number(rep.mid.toFixed(2))
      });
    }
    resetSums(exchAcc[ex]); // 누적만 리셋
    exchAcc[ex].lastTs = now; // 기준 시각 갱신
  }

  // 집계
  accumulate(aggAcc, now);
  const aggRep = reportTW(aggAcc);
  if (aggRep) {
    const sources = Object.keys(latestBook).filter(k => latestBook[k]);
    logger.info({
      type: "aggregate-execavg-timeweighted",
      t: new Date(now).toISOString(),
      depth: DEPTH,
      Q: TARGET_Q,
      sources,
      buyTWExec:  Number(aggRep.buy.toFixed(2)),
      sellTWExec: Number(aggRep.sell.toFixed(2)),
      midTWExec:  Number(aggRep.mid.toFixed(2))
    });
  }
  resetSums(aggAcc);
  aggAcc.lastTs = now; // 기준 시각 갱신
}, TICK_MS);
