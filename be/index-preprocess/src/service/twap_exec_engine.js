"use strict";

/**
 * TWAP of Exec(Q) Engine (with reason logging)
 *
 * 입력 스냅샷 (거래소별):
 * {
 *   symbol: 'KRW-BTC',
 *   exchange_no: 101,
 *   exchange_name: 'UPBIT',
 *   bid: [[price, qty], ...],
 *   ask: [[price, qty], ...],
 *   fromAt: '2025-09-24T17:11:53.832Z',
 *   createdAt: '2025-09-24T17:11:53.928Z'
 * }
 *
 * 산식:
 *   - 통합 북(유효 거래소만) 생성
 *   - VWAP_buy = asks 기준(오름차순), VWAP_sell = bids 기준(내림차순)
 *   - index_mid = (VWAP_buy + VWAP_sell) / 2
 *   - 1초(기본) 창에서 TWAP: Σ(value×Δt)/ΣΔt
 * 예외/정책:
 *   - 스테일(>= STALE_MS): 제외
 *   - 호가 역전(bid > ask): 제외
 *   - 결측/형식오류: 제외
 *   - sources가 0이면 직전값을 provisional 최대 PROV_MAX_MS 까지 출력,
 *     초과 시 no_publish
 */

const winston = require("winston");

// ===== Config (env overridable) =====
const DEPTH        = Number(process.env.DEPTH || 15);
const TICK_MS      = Number(process.env.TICK_MS || 1000);
const STALE_MS     = Number(process.env.STALE_MS || 30_000);
const PROV_MAX_MS  = Number(process.env.PROV_MAX_MS || 60_000);
const LOG_LEVEL    = process.env.LOG_LEVEL || "info";
const Q_TARGET     = Number(process.env.Q || 0.5); // 목표 수량 Q

// ===== Logger =====
const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// ===== Helpers =====
const toNum = (x) => (typeof x === "string" ? Number(x) : x);
const round2 = (x) => Math.round(x * 100) / 100;

function normalizeBook(raw) {
  const bids = (raw.bid || [])
    .map(([p, q]) => ({ price: toNum(p), qty: toNum(q) }))
    .filter(l => l.price > 0 && l.qty > 0)
    .sort((a, b) => b.price - a.price)   // high → low
    .slice(0, DEPTH);

  const asks = (raw.ask || [])
    .map(([p, q]) => ({ price: toNum(p), qty: toNum(q) }))
    .filter(l => l.price > 0 && l.qty > 0)
    .sort((a, b) => a.price - b.price)   // low → high
    .slice(0, DEPTH);

  return { bids, asks };
}

function isCrossed(book) {
  if (!book || !book.bids?.length || !book.asks?.length) return true;
  return book.bids[0].price > book.asks[0].price; // (>=) 사용 시 locked 북도 제외
}

// Exec(Q): 상단부터 목표 수량 체결 가정
function execAvg(levels, Q) {
  let remain = Q, cost = 0, filled = 0;
  for (const { price, qty } of levels) {
    if (remain <= 0) break;
    const take = Math.min(remain, qty);
    cost += price * take;
    filled += take;
    remain -= take;
  }
  return filled > 0 ? cost / filled : null; // all-or-nothing 원하면 if (filled < Q) return null;
}

// 즉시 Exec(Q) 튜플
function instantExec(merged, Q) {
  const buy  = execAvg(merged.asks, Q);  // 매수는 asks에서 체결
  const sell = execAvg(merged.bids, Q);  // 매도는 bids에서 체결
  if (buy == null || sell == null) return { buy: null, sell: null, mid: null };
  return { buy, sell, mid: (buy + sell) / 2 };
}

// 병합(유효 거래소만)
function mergeBooks(validBooks) {
  const bids=[], asks=[];
  for (const b of validBooks) {
    if (b.bids?.length) bids.push(...b.bids);
    if (b.asks?.length) asks.push(...b.asks);
  }
  bids.sort((a,b)=>b.price-a.price);
  asks.sort((a,b)=>a.price-b.price);
  return { bids: bids.slice(0, DEPTH), asks: asks.slice(0, DEPTH) };
}

// ===== 시간가중 누적기 =====
function makeAcc() {
  return {
    lastTs: null,
    last: { buy:null, sell:null, mid:null },
    sum:  { buyDt:0, sellDt:0, midDt:0, dt:0 }
  };
}
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
function setLast(acc, inst) {
  acc.last.buy  = inst.buy;
  acc.last.sell = inst.sell;
  acc.last.mid  = inst.mid;
}
function clearLast(acc) { acc.last.buy = acc.last.sell = acc.last.mid = null; }
function reportTW(acc) {
  if (acc.sum.dt <= 0) return null;
  return {
    buy:  acc.sum.buyDt  / acc.sum.dt,
    sell: acc.sum.sellDt / acc.sum.dt,
    mid:  acc.sum.midDt  / acc.sum.dt,
  };
}
function resetSums(acc) {
  acc.sum.buyDt = acc.sum.sellDt = acc.sum.midDt = acc.sum.dt = 0;
}

// ===== 원인 로깅 =====
function validityReason(rec, now, staleMs) {
  if (!rec) return "missing_record";
  if (!rec.book) return "missing_book";
  if (!rec.book.bids?.length || !rec.book.asks?.length) return "empty_side";
  if ((now - rec.ts) >= staleMs) return "stale";
  if (isCrossed(rec.book)) return "crossed";
  return "ok";
}

// ===== 엔진 =====
class TwapExecEngine {
  /**
   * opts = { depth?, tickMs?, staleMs?, provMax?, q? }
   */
  constructor(opts = {}) {
    this.depth   = Number(opts.depth   || DEPTH);
    this.tickMs  = Number(opts.tickMs  || TICK_MS);
    this.staleMs = Number(opts.staleMs || STALE_MS);
    this.provMax = Number(opts.provMax || PROV_MAX_MS);
    this.Q       = Number(opts.q ?? Q_TARGET);

    // 최신 북 저장: books[symbol][exchange] = { book, ts }
    this.books = Object.create(null);
    // 심볼별 누적기(통합)
    this.acc = Object.create(null);
    // 마지막 산출값(잠정치)
    // last[symbol] = { ts, buy, sell, mid, provisionalSince? }
    this.last = Object.create(null);

    this._timer = null;
  }

  onSnapshot(snap) {
    const symbol = String(snap.symbol || "").trim();
    if (!symbol) return;
    const exchange = String(snap.exchange_name || snap.exchange_no || "UNKNOWN");

    const tRaw = snap.createdAt || snap.fromAt || Date.now();
    let ts = new Date(tRaw).getTime();
    if (!Number.isFinite(ts)) ts = Date.now();

    const book = normalizeBook(snap);

    if (!this.books[symbol]) this.books[symbol] = Object.create(null);
    this.books[symbol][exchange] = { book, ts };

    if (!this.acc[symbol]) this.acc[symbol] = makeAcc();

    // 이벤트 시점에서도 상태 갱신
    this._updateMerged(symbol, ts);
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._flushAll(), this.tickMs);
  }
  stop() { if (this._timer) clearInterval(this._timer); this._timer = null; }

  // 유효 거래소 선별 + 병합 + 제외 사유
  _mergeSymbolBooks(symbol, now) {
    const rows = this.books[symbol] || {};
    const cutoff = now - this.staleMs;

    const mBids = [], mAsks = [];
    const sources = [];
    const excluded = [];

    for (const ex of Object.keys(rows)) {
      const rec = rows[ex];
      const reason = validityReason(rec, now, this.staleMs);

      if (reason === "ok") {
        if (rec.ts >= cutoff && !isCrossed(rec.book)) {
          if (rec.book.bids?.length) mBids.push(...rec.book.bids);
          if (rec.book.asks?.length) mAsks.push(...rec.book.asks);
          sources.push(ex);
        } else {
          excluded.push({ exchange: ex, reason: rec.ts < cutoff ? "stale" : "crossed" });
        }
      } else {
        excluded.push({ exchange: ex, reason });
      }
    }

    mAsks.sort((a,b)=>a.price-b.price);
    mBids.sort((a,b)=>b.price-a.price);

    return {
      bids: mBids.slice(0, this.depth),
      asks: mAsks.slice(0, this.depth),
      sources,
      excluded
    };
  }

  _updateMerged(symbol, eventTs) {
    const acc = this.acc[symbol];
    const now = eventTs || Date.now();
    const merged = this._mergeSymbolBooks(symbol, now);

    if (!merged.bids.length || !merged.asks.length || isCrossed(merged)) {
      acc.lastTs = Math.max(acc.lastTs ?? now, now);
      clearLast(acc);
      return merged;
    }

    const safeNow = Math.max(acc.lastTs ?? now, now);
    accumulate(acc, safeNow);

    const inst = instantExec(merged, this.Q);
    if (inst.buy != null && inst.sell != null && inst.mid != null) setLast(acc, inst);
    else clearLast(acc);

    return merged;
  }

  _flushAll() {
    const now = Date.now();
    for (const symbol of Object.keys(this.acc)) {
      this._flushSymbol(symbol, now);
    }
  }

  _flushSymbol(symbol, now) {
    const acc = this.acc[symbol];

    const merged = this._updateMerged(symbol, now); // 최신 반영
    accumulate(acc, now);                            // 창 마감
    const rep = reportTW(acc);

    const haveValid = merged && merged.sources && merged.sources.length > 0;

    if (rep && haveValid) {
      const out = {
        type: "twap-exec",
        symbol,
        t: new Date(now).toISOString(),
        depth: this.depth,
        Q: this.Q,
        exec_buy:  round2(rep.buy),   // KRW, 소수점 둘째 자리
        exec_sell: round2(rep.sell),
        exec_mid:  round2(rep.mid),
        sources: merged.sources,
        excluded: merged.excluded,
        provisional: false,
        no_publish: false
      };
      logger.info(out);

      this.last[symbol] = {
        ts: now, buy: out.exec_buy, sell: out.exec_sell, mid: out.exec_mid,
        provisionalSince: undefined,
      };
    } else {
      const last = this.last[symbol];
      const excluded = merged?.excluded ?? [];

      if (last) {
        if (!last.provisionalSince) last.provisionalSince = now;
        const elapsed = now - last.provisionalSince;

        const out = {
          type: "twap-exec",
          symbol,
          t: new Date(now).toISOString(),
          depth: this.depth,
          Q: this.Q,
          exec_buy:  round2(last.buy),
          exec_sell: round2(last.sell),
          exec_mid:  round2(last.mid),
          sources: [],
          excluded,
          provisional: elapsed <= this.provMax,
          no_publish: elapsed > this.provMax,
          reason: "no_valid_sources_or_no_twap"
        };
        if (out.provisional) logger.warn(out); else logger.error(out);
      } else {
        logger.error({
          type: "twap-exec",
          symbol,
          t: new Date(now).toISOString(),
          message: "no valid sources and no history",
          sources: [],
          excluded,
          provisional: false,
          no_publish: true
        });
      }
    }

    resetSums(acc);
    acc.lastTs = now;
  }
}

module.exports = { TwapExecEngine };
