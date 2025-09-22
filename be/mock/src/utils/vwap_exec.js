"use strict";

/**
 * 오더북을 따라 목표수량 Q만큼 즉시 체결한다고 가정했을 때의 실행평단.
 * levels: [{price, qty}, ...] 정렬된 레벨(asks: 저가→고가, bids: 고가→저가)
 * Q 단위: 거래 수량(예: BTC 수량). 부분 체결 허용.
 * 반환: 평균 체결단가 (체결 불가 시 null)
 */
function executionAverage(levels, Q) {
  if (!Array.isArray(levels) || levels.length === 0) return null;
  let remain = Q;
  let cost = 0;   // Σ(price * filledQty)
  let filled = 0; // Σ(filledQty)

  for (const { price, qty } of levels) {
    if (remain <= 0) break;
    if (qty <= 0 || price <= 0) continue;
    const take = Math.min(remain, qty);
    cost   += price * take;
    filled += take;
    remain -= take;
  }
  if (filled <= 0) return null;
  // 목표수량을 모두 못 채웠다면, 여기서는 부분 체결 평균 반환(원하면 null로 바꿀 수 있음)
  return cost / filled;
}

/** 매수 실행평단(Ask를 따라 감) */
function execAvgBuyFromAsk(asks, Q, depth = Infinity) {
  const levels = [...asks]
    .filter(l => l.qty > 0 && l.price > 0)
    .sort((a, b) => a.price - b.price)
    .slice(0, depth);
  return executionAverage(levels, Q);
}

/** 매도 실행평단(Bid를 따라 감) */
function execAvgSellFromBid(bids, Q, depth = Infinity) {
  const levels = [...bids]
    .filter(l => l.qty > 0 && l.price > 0)
    .sort((a, b) => b.price - a.price)
    .slice(0, depth);
  return executionAverage(levels, Q);
}

module.exports = { executionAverage, execAvgBuyFromAsk, execAvgSellFromBid };
