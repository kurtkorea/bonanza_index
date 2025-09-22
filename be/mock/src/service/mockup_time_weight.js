"use strict";

/**
 * 국내 4대 거래소(업비트/빗썸/코빗/코인원)
 * - WS 실시간 오더북 수신
 * - depth: 15 고정
 * - 스냅샷 도착 이벤트마다: 직전 시점부터 현재까지 Δt로 "직전 VWAP" 가중 합 누적
 * - 1초마다: 각 거래소 및 집계의 TW-VWAP 산출 후, 누적값 리셋(상태는 유지)
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

/** 현재 북 → buy/sell/mid 즉시값 */
function instantFromBook(book) {
  const buy  = vwapBuyFromAsk(book.asks, DEPTH);   // 매수 VWAP: Ask 기반
  const sell = vwapSellFromBid(book.bids, DEPTH);  // 매도 VWAP: Bid 기반
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
  return { asks, bids };
}

/** ------------------- 시간가중 누적 구조 ------------------- */
/**
 * acc 구조(개별/집계 동일):
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

/** 윈도우 종료 시 TW-VWAP 산출 */
function reportTW(acc) {
  if (acc.sum.dt <= 0) return null;
  return {
    buy:  acc.sum.buyDt  / acc.sum.dt,
    sell: acc.sum.sellDt / acc.sum.dt,
    mid:  acc.sum.midDt  / acc.sum.dt,
  };
}

/** 누적 초기화(상태는 유지) */
function resetSums(acc) {
  acc.sum.buyDt = acc.sum.sellDt = acc.sum.midDt = acc.sum.dt = 0;
}

/** ------------------- 실시간 관리 상태 ------------------- */

// 최신 스냅샷(표준화) 저장
const latestBook = {
  upbit:   null,
  bithumb: null,
  korbit:  null,
  coinone: null,
};

// 개별 거래소 시간가중 누적기
const exchAcc = {
  upbit:   makeAcc(),
  bithumb: makeAcc(),
  korbit:  makeAcc(),
  coinone: makeAcc(),
};

// 집계(4거래소 합산 북) 시간가중 누적기
const aggAcc = makeAcc();

/** 스냅샷 수신 시 공통 처리:
 *  1) 개별 거래소 acc: (a) 직전값을 Δt로 누적 → (b) 새 즉시값 반영
 *  2) 집계 acc: (a) 직전값을 Δt로 누적 → (b) 최신 스냅샷 묶어 새 즉시값 반영
 */
function onSnapshot(exchangeName, bookStd) {
  const now = Date.now();

  // 1) 개별 거래소
  {
    const acc = exchAcc[exchangeName];
    // (a) 직전값을 Δt로 누적
    accumulate(acc, now);
    // (b) 새 즉시값 계산 & 저장
    const inst = instantFromBook(bookStd);
    setLast(acc, inst);
  }

  // latestBook 업데이트 (집계 계산에 쓰임)
  latestBook[exchangeName] = bookStd;

  // 2) 집계
  {
    // (a) 직전값을 Δt로 누적
    accumulate(aggAcc, now);
    // (b) 합친 북으로 즉시값 재계산 & 저장
    const merged = mergeBooks(latestBook);
    const instAgg = instantFromBook(merged);
    setLast(aggAcc, instAgg);
  }
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
  start(cb) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = [
        { ticket: "vwap-tw" },
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

// 빗썸
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
        { ticket: "vwap-tw" },
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

// 코빗
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
          const a = (msg.data.asks || []).map(x => [x.price, x.qty]);
          const b = (msg.data.bids || []).map(x => [x.price, x.qty]);
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

      // 권장: 주기적 PING (유휴 종료 방지)
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

// 각 거래소 최신 스냅샷 → 시간가중 누적 처리
const clients = [
  new UpbitClient("KRW-BTC"),
  new BithumbClient("KRW-BTC"),
  new KorbitClient("btc_krw"),
  new CoinoneClient("KRW", "BTC"),
];

clients.forEach(c =>
  c.start((name, bookStd) => {
    // 최신 스냅샷 전달 → 시간가중 누적(개별 + 집계)
    onSnapshot(name, bookStd);
  })
);

// 1초마다 창 닫기: 지금 시각까지의 Δt도 누적한 다음 보고 & 리셋
setInterval(() => {
  const now = Date.now();

  // --- 개별 거래소 TW-VWAP ---
  for (const ex of Object.keys(exchAcc)) {
    // 창 끝까지 Δt 누적
    accumulate(exchAcc[ex], now);
    const rep = reportTW(exchAcc[ex]);
    if (rep) {
      logger.info({
        type: "per-exchange-timeweighted",
        exchange: ex,
        t: new Date(now).toISOString(),
        depth: DEPTH,
        buyTW:  Number(rep.buy.toFixed(2)),
        sellTW: Number(rep.sell.toFixed(2)),
        midTW:  Number(rep.mid.toFixed(2))
      });
    }
    // 누적값만 리셋(상태는 유지)
    resetSums(exchAcc[ex]);
  }

  // --- 집계 TW-VWAP ---
  accumulate(aggAcc, now);
  const aggRep = reportTW(aggAcc);
  if (aggRep) {
    const sources = Object.keys(latestBook).filter(k => latestBook[k]);
    logger.info({
      type: "aggregate-timeweighted",
      t: new Date(now).toISOString(),
      depth: DEPTH,
      sources,
      buyTW:  Number(aggRep.buy.toFixed(2)),
      sellTW: Number(aggRep.sell.toFixed(2)),
      midTW:  Number(aggRep.mid.toFixed(2))
    });
  }
  resetSums(aggAcc);

  // 중요: 창을 닫고 다시 열었으니, 기준 시간을 now로 고정
  // (last 값은 유지되며, 다음 Δt는 now부터 쌓임)
  exchAcc.upbit.lastTs   = now;
  exchAcc.bithumb.lastTs = now;
  exchAcc.korbit.lastTs  = now;
  exchAcc.coinone.lastTs = now;
  aggAcc.lastTs          = now;
}, TICK_MS);
