"use strict";

/**
 * 국내 4대 거래소(업비트/빗썸/코빗/코인원)
 * - depth: 15
 * - 목표수량 Q 실행평단(매수/매도, mid)을 스냅샷마다 계산
 * - 시간가중(TW): 직전 실행평단 × Δt(ms) 누적 → 1초마다 ∑(price×Δt)/∑Δt 출력
 * - 호가 역전(베스트 매수 > 베스트 매도) 발생 구간은 완전히 제외
 * - 개별 거래소 + 집계(합산 북) 모두 동일 규칙 적용
 */

const WebSocket = require("ws");
const winston = require("winston");
const { execAvgBuyFromAsk, execAvgSellFromBid } = require("../utils/vwap_exec");
const { MARKET_NO_ENUM, MARKET_NAME_ENUM } = require("../utils/common");
const { send_push } = require("../utils/zmq-sender-push.js");
const { send_publisher } = require("../utils/zmq-sender-pub.js");
const  { sendTelegramMessageSource } = require('../utils/telegram_push.js')

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

/** 역전(매수호가 > 매도호가) 여부 */
function isCrossed(book) {
  if (!book || !book.bids?.length || !book.asks?.length) return true;
  return book.bids[0].price > book.asks[0].price; // 필요시 >= 로 변경
}

/** 현재 북 → 목표수량 Q 실행평단(매수/매도) 및 mid */
function instantExecFromBook(book) {
  const buy  = execAvgBuyFromAsk(book.asks, TARGET_Q, DEPTH);
  const sell = execAvgSellFromBid(book.bids, TARGET_Q, DEPTH);
  if (buy == null || sell == null) return { buy: null, sell: null, mid: null };
  return { buy, sell, mid: (buy + sell) / 2 };
}

/** 합산 북(여러 거래소) 생성: 역전 거래소는 제외 */
function mergeBooks(latest) {
  const asks = [], bids = [];
  for (const ex of Object.keys(latest)) {
    const b = latest[ex];
    if (!b || isCrossed(b)) continue; // 역전 제외
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

/** 역전 제외를 위해 last를 비움(이후 Δt 누적이 안 됨) */
function clearLast(acc) {
  acc.last.buy = acc.last.sell = acc.last.mid = null;
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

/** ------------------- 전역 상태 ------------------- */

// 최신 스냅샷 (집계용)
const latestBook = {
  [MARKET_NO_ENUM.UPBIT]:   null,
  [MARKET_NO_ENUM.BITHUMB]: null,
  [MARKET_NO_ENUM.KORBIT]:  null,
  [MARKET_NO_ENUM.COINONE]: null,
};

// 개별 거래소 TW 누적기
const exchAcc = {
  [MARKET_NO_ENUM.UPBIT]:   makeAcc(),
  [MARKET_NO_ENUM.BITHUMB]: makeAcc(),
  [MARKET_NO_ENUM.KORBIT]:  makeAcc(),
  [MARKET_NO_ENUM.COINONE]: makeAcc(),
};

// 집계 TW 누적기
const aggAcc = makeAcc();

/** 스냅샷 처리: 역전 제외 로직 포함(개별/집계) */
function onSnapshot(exchangeNo, bookStd) {
  const now = Date.now();

  // ===== 1) 개별 거래소 =====
  {
    const acc = exchAcc[exchangeNo];

    if (isCrossed(bookStd)) {
      // 역전 구간 완전 제외: Δt 누적 안 하고, 기준시각만 이동 + last 비우기
      acc.lastTs = now;
      clearLast(acc);
      latestBook[exchangeNo] = null; // 집계에서도 제외
    } else {
      // 정상 북: 직전 구간 Δt 누적 → 즉시값 반영
      accumulate(acc, now);
      const inst = instantExecFromBook(bookStd);
      if (inst.buy != null && inst.sell != null) setLast(acc, inst);
      latestBook[exchangeNo] = bookStd;
    }
  }

  // ===== 2) 집계(aggregate) =====
  {
    const merged = mergeBooks(latestBook);
    if (!merged.asks.length || !merged.bids.length || isCrossed(merged)) {
      aggAcc.lastTs = now;
      clearLast(aggAcc);
    } else {
      accumulate(aggAcc, now);
      const instAgg = instantExecFromBook(merged);
      if (instAgg.buy != null && instAgg.sell != null) setLast(aggAcc, instAgg);
    }
  }
}

/** ------------------- 거래소별 WS 클라이언트 ------------------- */

class UpbitClient {
  constructor(code = "KRW-BTC") {
    this.name = MARKET_NAME_ENUM.UPBIT;
    this.market_no = MARKET_NO_ENUM.UPBIT;
    this.url  = "wss://api.upbit.com/websocket/v1";
    this.code = code;
    this.ws   = null;
    this._reconnecting = false;
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
      if (this._reconnecting) {
        sendTelegramMessageSource(this.name, `${this.name} WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessageSource(this.name, `${this.name} WebSocket opened (initial connect).`);
      }
      this._reconnecting = false;
    });
    this.ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if ((msg.ty || msg.type) === "orderbook") {
          const units = msg.obu || msg.orderbook_units || [];
          const marketAt = msg.tms;
          const coollectorAt = new Date(Date.now()).getTime();

          // console.log(marketAt);
          // 15개까지만 자르기
          const bids = units.slice(0, 15).map(u => [u.bp ?? u.bid_price, u.bs ?? u.bid_size]);
          const asks = units.slice(0, 15).map(u => [u.ap ?? u.ask_price, u.as ?? u.ask_size]);

          //ZMQ 로 다른 DB 저장 프로세스에 전달한다. => 거래소 별로 처리할지 거래소_코드 별로 처리할지 고민해야될듯.
          const orderbook_item = {
            symbol: process.env.SYMBOL ?? "KRW-BTC",
            exchange_no: this.market_no,
            exchange_name: this.name,
            bid: bids,
            ask: asks,
            marketAt: marketAt,
            coollectorAt: coollectorAt,
            diff_ms: (coollectorAt - marketAt) / 1000,
          };
          await SendToOrderBook_ZMQ(orderbook_item, raw.toString());
          cb(this.market_no, normalize(bids, asks));
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => {
      this._reconnecting = true;
      setTimeout(() => this.start(cb), 200);
      sendTelegramMessageSource(this.name, `${this.name} WebSocket closed.`);
    });
    this.ws.on("error", (e) => { 
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessageSource(this.name, `${this.name} WebSocket error: ${String(e)}`);
    });
  }
}

class BithumbClient {
  constructor(code = "KRW-BTC") {
    this.name = MARKET_NAME_ENUM.BITHUMB;
    this.market_no = MARKET_NO_ENUM.BITHUMB;
    this.fromAt = null;
    this.url  = "wss://ws-api.bithumb.com/websocket/v1";
    this.code = code;
    this.ws   = null;
    this._reconnecting = false;
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
      if (this._reconnecting) {
        sendTelegramMessageSource(this.name, `${this.name} WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessageSource(this.name, `${this.name} WebSocket opened (initial connect).`);
      }
      this._reconnecting = false;
    });
    this.ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if ((msg.ty ?? msg.type) === "orderbook") {
          const marketAt = parseInt(msg.tms / 1000);
          const coollectorAt = new Date(Date.now()).getTime();
          // console.log(marketAt);

          const units = msg.obu || msg.orderbook_units || [];
          // 15개까지만 추출
          const bids = units.slice(0, 15).map(u => [u.bp ?? u.bid_price, u.bs ?? u.bid_size]);
          const asks = units.slice(0, 15).map(u => [u.ap ?? u.ask_price, u.as ?? u.ask_size]);

          //ZMQ 로 다른 DB 저장 프로세스에 전달한다. => 거래소 별로 처리할지 거래소_코드 별로 처리할지 고민해야될듯.
          const orderbook_item = {
            symbol: process.env.SYMBOL ?? "KRW-BTC",
            exchange_no: this.market_no,
            exchange_name: this.name,
            bid: bids,
            ask: asks,
            marketAt: marketAt,
            coollectorAt: coollectorAt,
            diff_ms: (coollectorAt - marketAt) / 1000,
          };
          await SendToOrderBook_ZMQ(orderbook_item, raw.toString());
          cb(this.market_no, normalize(bids, asks));
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => {
      this._reconnecting = true;
      setTimeout(() => this.start(cb), 200);
      sendTelegramMessage(`${this.name} WebSocket closed.`);
    });
    this.ws.on("error", (e) => { 
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage(`${this.name} WebSocket error: ${String(e)}`);
    });
  }
}

class KorbitClient {
  constructor(symbol = "btc_krw") {
    this.name = MARKET_NAME_ENUM.KORBIT;
    this.market_no = MARKET_NO_ENUM.KORBIT;
    this.fromAt = null;
    this.url  = "wss://ws-api.korbit.co.kr/v2/public";
    this.symbol = symbol;
    this.ws   = null;
    this._reconnecting = false;
  }
  start(cb) {
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      const req = JSON.stringify([{ method: "subscribe", type: "orderbook", symbols: [this.symbol] }]);
      this.ws.send(req);
      logger.info({ ex: this.name, msg: "subscribed", symbol: this.symbol });
      if (this._reconnecting) {
        sendTelegramMessageSource(this.name, `${this.name} WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessageSource(this.name, `${this.name} WebSocket opened (initial connect).`);
      }
      this._reconnecting = false;
    });
    this.ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "orderbook" && msg.data) {
          const marketAt = msg.timestamp;
          const coollectorAt = new Date(Date.now()).getTime();

          // console.log(marketAt);
          // 15개까지만 추출
          const bids = (msg.data.bids || []).slice(0, 15).map(x => [Number(x.price), Number(x.qty)]);
          const asks = (msg.data.asks || []).slice(0, 15).map(x => [Number(x.price), Number(x.qty)]);

          const orderbook_item = {
            symbol: process.env.SYMBOL ?? "KRW-BTC",
            exchange_no: this.market_no,
            exchange_name: this.name,
            bid: bids,  
            ask: asks,
            marketAt: marketAt,
            coollectorAt: coollectorAt,
            diff_ms: (coollectorAt - marketAt) / 1000,
          };
          await SendToOrderBook_ZMQ(orderbook_item, raw.toString());
          cb(this.market_no, normalize(bids, asks));
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => {
      this._reconnecting = true;
      setTimeout(() => this.start(cb), 200);
      sendTelegramMessage(`${this.name} WebSocket closed.`);
    });
    this.ws.on("error", (e) => { 
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage(`${this.name} WebSocket error: ${String(e)}`);
    });
  }
}

class CoinoneClient {
  constructor(qc = "KRW", tc = "BTC") {
    this.name = MARKET_NAME_ENUM.COINONE;
    this.market_no = MARKET_NO_ENUM.COINONE;
    this.url  = "wss://stream.coinone.co.kr";
    this.qc   = qc;
    this.tc   = tc;
    this.ws   = null;
    this.pingInterval = null;
    this._reconnecting = false;
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
      if (this._reconnecting) {
        sendTelegramMessageSource(this.name, `${this.name} WebSocket reopened (reconnected).`);
      } else {
        sendTelegramMessageSource(this.name,`${this.name} WebSocket opened (initial connect).`);
      }
      this._reconnecting = false;
    });
    this.ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if ((msg.c === "ORDERBOOK" || msg.channel === "ORDERBOOK") && (msg.d || msg.data)) {
          const d = msg.d || msg.data;
          const marketAt = d.t;
          const coollectorAt = new Date(Date.now()).getTime();


          //코인원은 String 타입이다.
          // 15개까지만 자르기
          const bids = (d.b || d.bids || []).map(u => [Number(u.p ?? u.price), Number(u.q ?? u.qty)]).slice(0, 15);
          const asks = (d.a || d.asks || []).reverse().map(u => [Number(u.p ?? u.price), Number(u.q ?? u.qty)]).slice(0, 15);

          const orderbook_item = {
            symbol: process.env.SYMBOL ?? "KRW-BTC",
            exchange_no: this.market_no,
            exchange_name: this.name,
            bid: bids,
            ask: asks,
            marketAt: marketAt,
            coollectorAt: coollectorAt,
            diff_ms: (coollectorAt - marketAt) / 1000,
          };
          await SendToOrderBook_ZMQ(orderbook_item, raw.toString());
          cb(this.market_no, normalize(bids, asks));
        }
      } catch (e) {
        logger.warn({ ex: this.name, err: String(e) }, "parse error");
      }
    });
    this.ws.on("close", () => {
      if (this.pingInterval) clearInterval(this.pingInterval);
      this._reconnecting = true;
      setTimeout(() => this.start(cb), 200);
      sendTelegramMessage(`${this.name} WebSocket closed.`);
    });
    this.ws.on("error", (e) => { 
      logger.error({ ex: this.name, err: String(e) }, "ws error");
      sendTelegramMessage(`${this.name} WebSocket error: ${String(e)}`);
    });
  }
}

// OrderBook에 데이터를 전송하는 함수
async function SendToOrderBook_ZMQ(orderbook_item, raw = null) {
  const topic = `${orderbook_item.exchange_no}/${orderbook_item.symbol}`;
  const ts = Date.now();

  const raw_orderbook_item = { ...orderbook_item };
  raw_orderbook_item.raw = raw;

  await Promise.all([
    send_push(topic, ts, orderbook_item),
    send_publisher(raw_orderbook_item.symbol, raw_orderbook_item)
  ]);
}
/** ------------------- 실행부 ------------------- */

// 스냅샷 수신 → 역전 제외 포함한 시간가중 누적(개별/집계)
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
  for (const exchange_no of Object.keys(exchAcc).map(Number)) {    
    accumulate(exchAcc[exchange_no], now); // 창 끝까지 Δt 반영
    const rep = reportTW(exchAcc[exchange_no]); // 역전/데이터 없음이면 null
    if (rep) {

      const orderbook_item = {
        exchange_no: exchange_no,
        exchange_name: Object.keys(MARKET_NAME_ENUM).find(key => MARKET_NO_ENUM[key] === exchange_no) || exchange_no,
        bid:  Number(rep.buy.toFixed(2)),
        ask: Number(rep.sell.toFixed(2)),
        mid:  Number(rep.mid.toFixed(2)),
        createdAt: new Date(now),
      };

      // console.log( JSON.stringify(orderbook_item, null, 2) );

      // logger.info(orderbook_item);
    }
    resetSums(exchAcc[exchange_no]);      // 누적만 리셋
    exchAcc[exchange_no].lastTs = now;    // 기준시각 갱신
  }

  // 집계
  accumulate(aggAcc, now);
  const aggRep = reportTW(aggAcc);
  if (aggRep) {
    const sources = Object.keys(latestBook).filter(k => latestBook[k]);

    const orderbook_item = {
      exchange_no: 999,
      exchange_name: "aggregate",
      bid:  Number(aggRep.buy.toFixed(2)),
      ask: Number(aggRep.sell.toFixed(2)),
      mid:  Number(aggRep.mid.toFixed(2)),
      createdAt: new Date(now),
      // sources,
    };
  }

  resetSums(aggAcc);
  aggAcc.lastTs = now; // 기준시각 갱신
}, TICK_MS);

// Export the client classes
module.exports = {
  UpbitClient,
  BithumbClient,
  KorbitClient,
  CoinoneClient
};