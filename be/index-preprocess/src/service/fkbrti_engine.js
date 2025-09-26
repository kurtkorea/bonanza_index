"use strict";

/**
 * FKBRTI (Mid VWAP) — single symbol
 * - Buy VWAP  : asks (low→high)
 * - Sell VWAP : bids (high→low)
 * - Index     : (Buy VWAP + Sell VWAP)/2
 * - Exclusions:
 *    * Stale books (ts older than STALE_MS)
 *    * Crossed books (bestBid > bestAsk)
 * - If ALL EXPECTED_EXCHANGES are unavailable → provisional(last).
 *   If this persists > PROV_MAX_MS → no_publish.
 */

const DEPTH        = num("DEPTH", 15);
const TICK_MS      = num("TICK_MS", 1000);
const DECIMALS     = num("DECIMALS", 2);
const STALE_MS     = num("STALE_MS", 30_000);
const PROV_MAX_MS  = num("PROV_MAX_MS", 60_000);
const EXPECTED_EXCHANGES = (process.env.EXPECTED_EXCHANGES || "UPBIT,BITHUMB,KORBIT,COINONE")
  .split(",").map(s => s.trim()).filter(Boolean);

function num(k, d) {
  const v = process.env[k];
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
}
const toNum  = (x) => {
  if (x === null || x === undefined) return 0;
  if (typeof x === "string") {
    const num = Number(x);
    return isNaN(num) ? 0 : num;
  }
  if (typeof x === "number") {
    return isNaN(x) ? 0 : x;
  }
  return 0;
};
const roundN = (x, n = 2) => { const k = 10 ** n; return Math.round(x * k) / k; };

function normalize(snapshot) {
  try {
    const bids = (snapshot.bid || [])
      .filter(item => Array.isArray(item) && item.length >= 2)
      .map(([p, q]) => ({ price: toNum(p), qty: toNum(q) }))
      .filter(item => item.price > 0 && item.qty > 0)
      .sort((a, b) => b.price - a.price)
      .slice(0, DEPTH);

    const asks = (snapshot.ask || [])
      .filter(item => Array.isArray(item) && item.length >= 2)
      .map(([p, q]) => ({ price: toNum(p), qty: toNum(q) }))
      .filter(item => item.price > 0 && item.qty > 0)
      .sort((a, b) => a.price - b.price)
      .slice(0, DEPTH);

    return { bids, asks };
  } catch (error) {
    console.error('normalize 함수 에러:', error);
    console.error('snapshot 데이터:', snapshot);
    return { bids: [], asks: [] };
  }
}

function isCrossed(book) {
  if (!book?.bids?.length || !book?.asks?.length) return true; // 결측도 제외
  return book.bids[0].price > book.asks[0].price; // bestBid > bestAsk
}

// VWAP = Σ(P*Q)/ΣQ
function vwap(levels) {
  let pq = 0, q = 0;
  for (const { price, qty } of levels) { pq += price * qty; q += qty; }
  return q > 0 ? pq / q : NaN;
}

class FkbrtiEngine {
  /**
   * opts?: { symbol?, depth?, tickMs?, decimals?, staleMs?, provMaxMs?, expectedExchanges? }
   * - 프로세스당 1개 심볼만 처리
   */
  constructor(opts = {}) {
    this.symbol    = opts.symbol || null; // 없으면 첫 스냅샷에서 채움
    this.depth     = Number(opts.depth     || DEPTH);
    this.tickMs    = Number(opts.tickMs    || TICK_MS);
    this.decimals  = Number(opts.decimals  || DECIMALS);
    this.staleMs   = Number(opts.staleMs   || STALE_MS);
    this.provMaxMs = Number(opts.provMaxMs || PROV_MAX_MS);
    this.expected  = (opts.expectedExchanges || EXPECTED_EXCHANGES).slice();

    // booksByEx[exchange] = { bids, asks, ts }
    this.booksByEx = Object.create(null);

    // last = { ts, buy, sell, mid, provisionalSince? }
    this.last = null;

    this._timer = null;
  }

  // 실시간 스냅샷 주입
  onSnapshot(snap) {
    try {
      if (!this.symbol) this.symbol = String(snap.symbol || "").trim() || "(UNKNOWN)";
      const ex = String(snap.exchange_name || snap.exchange_no || "UNKNOWN");

      const { bids, asks } = normalize(snap);
      
      // 타임스탬프 처리 개선
      let ts = Date.now(); // 기본값
      if (snap.createdAt) {
        if (typeof snap.createdAt === 'string') {
          ts = new Date(snap.createdAt).getTime();
        } else if (snap.createdAt instanceof Date) {
          ts = snap.createdAt.getTime();
        } else if (typeof snap.createdAt === 'number') {
          ts = snap.createdAt;
        }
      } else if (snap.fromAt) {
        if (typeof snap.fromAt === 'string') {
          ts = new Date(snap.fromAt).getTime();
        } else if (snap.fromAt instanceof Date) {
          ts = snap.fromAt.getTime();
        } else if (typeof snap.fromAt === 'number') {
          ts = snap.fromAt;
        }
      }
      
      // 유효하지 않은 타임스탬프 처리
      if (!Number.isFinite(ts) || ts <= 0) {
        ts = Date.now();
      }

      this.booksByEx[ex] = { bids, asks, ts };
    } catch (error) {
      console.error('FkbrtiEngine.onSnapshot 에러:', error);
      console.error('snap 데이터:', snap);
    }
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), this.tickMs);
  }
  stop() { if (this._timer) clearInterval(this._timer); this._timer = null; }

  _tick() {
    const now = Date.now();
    const cutoff = now - this.staleMs;

    // 병합: 스테일 & 역전 제외
    const bids = [], asks = [];
    const sources = [];
    for (const ex of Object.keys(this.booksByEx)) {
      const rec = this.booksByEx[ex];
      if (!rec) continue;
      if (rec.ts < cutoff) continue;                  // 30s 이상 지연 제외
      const book = { bids: rec.bids, asks: rec.asks };
      if (isCrossed(book)) continue;                  // 역전 제외
      if (rec.bids?.length) bids.push(...rec.bids);
      if (rec.asks?.length) asks.push(...rec.asks);
      sources.push(ex);
    }

    bids.sort((a,b)=>b.price-a.price);
    asks.sort((a,b)=>a.price-b.price);

    const mergedBids = bids.slice(0, this.depth);
    const mergedAsks = asks.slice(0, this.depth);

    const buyVWAP  = vwap(mergedAsks);
    const sellVWAP = vwap(mergedBids);
    const indexMid = (buyVWAP + sellVWAP) / 2;

    // 기대 거래소 상태 평가(스테일/역전/결측을 모두 무효 처리)
    const expected_status = this.expected.map(ex => {
      const rec = this.booksByEx[ex];
      if (!rec) return { exchange: ex, reason: "no_data" };
      if (rec.ts < cutoff) return { exchange: ex, reason: "stale" };
      const book = { bids: rec.bids, asks: rec.asks };
      if (isCrossed(book)) return { exchange: ex, reason: "crossed" };
      const ok = (rec.bids?.length || 0) > 0 || (rec.asks?.length || 0) > 0;
      return { exchange: ex, reason: ok ? "ok" : "empty_book" };
    });
    const anyExpectedOk = expected_status.some(s => s.reason === "ok");

    const shouldProvisional = !anyExpectedOk;

    if (!shouldProvisional && Number.isFinite(indexMid)) {
      const out = {
        type: "fkbrti",
        t: new Date(now).toISOString(),
        symbol: this.symbol || "(UNKNOWN)",
        depth: this.depth,
        stale_ms: this.staleMs,
        expected_exchanges: this.expected,
        vwap_buy:  roundN(buyVWAP,  this.decimals),
        vwap_sell: roundN(sellVWAP, this.decimals),
        index_mid: roundN(indexMid, this.decimals),
        sources,
        expected_status,
        provisional: false,
        no_publish: false
      };
      //console.log(JSON.stringify(out));
      this.last = {
        ts: now,
        buy: out.vwap_buy, sell: out.vwap_sell, mid: out.index_mid,
        provisionalSince: undefined
      };
    } else {
      // 잠정치 또는 미산출
      if (this.last) {
        if (!this.last.provisionalSince) this.last.provisionalSince = now;
        const elapsed = now - this.last.provisionalSince;
        const out = {
          type: "fkbrti",
          t: new Date(now).toISOString(),
          symbol: this.symbol || "(UNKNOWN)",
          depth: this.depth,
          stale_ms: this.staleMs,
          expected_exchanges: this.expected,
          vwap_buy:  this.last.buy,
          vwap_sell: this.last.sell,
          index_mid: this.last.mid,
          sources,
          expected_status,
          provisional: elapsed <= this.provMaxMs,
          no_publish: elapsed > this.provMaxMs,
          reason: "all_expected_exchanges_unavailable_or_invalid"
        };
        console.log(JSON.stringify(out));
      } else {
        // 직전값도 없음 → 미산출
        const out = {
          type: "fkbrti",
          t: new Date(now).toISOString(),
          symbol: this.symbol || "(UNKNOWN)",
          depth: this.depth,
          stale_ms: this.staleMs,
          expected_exchanges: this.expected,
          vwap_buy:  null,
          vwap_sell: null,
          index_mid: null,
          sources,
          expected_status,
          provisional: false,
          no_publish: true,
          reason: "no_history_and_all_expected_unavailable_or_invalid"
        };
        console.log(JSON.stringify(out));
      }
    }
  }
}

module.exports = { FkbrtiEngine };

