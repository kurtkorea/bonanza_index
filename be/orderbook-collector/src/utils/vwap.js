"use strict";

/**
 * 기본 VWAP = (Σ P_i * Q_i) / (Σ Q_i)
 * levels: [{ price:number, qty:number }, ...]
 */
function vwap(levels) {
  let sumPQ = 0, sumQ = 0;
  for (const { price, qty } of levels) {
    if (qty > 0) { sumPQ += price * qty; sumQ += qty; }
  }
  return sumQ > 0 ? sumPQ / sumQ : 0;
}

/**
 * 문서 정의에 따른 "매수 VWAP":
 * - 통합 오더북의 매도(Ask) 가격·잔량 사용
 * - 저가→고가 정렬, depth 제한
 */
function vwapBuyFromAsk(asks, depth = Infinity) {
  const sorted = [...asks]
    .filter(l => l.qty > 0)
    .sort((a, b) => a.price - b.price)
    .slice(0, depth);
  return vwap(sorted);
}

/**
 * "매도 VWAP":
 * - 통합 오더북의 매수(Bid) 가격·잔량 사용
 * - 고가→저가 정렬, depth 제한
 */
function vwapSellFromBid(bids, depth = Infinity) {
  const sorted = [...bids]
    .filter(l => l.qty > 0)
    .sort((a, b) => b.price - a.price)
    .slice(0, depth);
  return vwap(sorted);
}

/**
 * (옵션) 목표 누적수량까지 VWAP 계산
 * - levels는 적절히 정렬되어 있어야 함
 */
function vwapUpToQty(levels, targetQty) {
  let need = targetQty, sumPQ = 0, sumQ = 0;
  for (const { price, qty } of levels) {
    if (need <= 0) break;
    const take = Math.min(qty, need);
    sumPQ += price * take;
    sumQ  += take;
    need  -= take;
  }
  return sumQ > 0 ? sumPQ / sumQ : 0;
}

module.exports = { vwap, vwapBuyFromAsk, vwapSellFromBid, vwapUpToQty };
