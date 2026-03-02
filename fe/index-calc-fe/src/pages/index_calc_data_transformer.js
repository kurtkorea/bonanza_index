/**
 * 지수 계산 데이터 변환 유틸리티
 * 한 번만 계산하고 재사용하도록 최적화
 */

// 거래소별 가격 추출 (메모이제이션용 캐시)
const priceCache = new WeakMap();

export const getExchangePrice = (expectedStatus, exchangeId) => {
  if (!expectedStatus) return 0;
  
  // 캐시 확인
  const cacheKey = `${exchangeId}`;
  if (priceCache.has(expectedStatus)) {
    const cached = priceCache.get(expectedStatus);
    if (cached[cacheKey] !== undefined) {
      return cached[cacheKey];
    }
  }
  
  // 계산
  const item = expectedStatus.find(x => x.exchange === exchangeId);
  const price = item?.price || 0;
  
  // 캐시 저장
  if (!priceCache.has(expectedStatus)) {
    priceCache.set(expectedStatus, {});
  }
  priceCache.get(expectedStatus)[cacheKey] = price;
  
  return price;
};

// ACTUAL_AVG 계산 (OK 상태인 거래소들의 평균가)
export const calculateActualAvg = (expectedStatus) => {
  if (!expectedStatus || !Array.isArray(expectedStatus)) return 0;
  
  let sum = 0;
  let count = 0;
  
  for (const item of expectedStatus) {
    if (item.reason === "ok") {
      sum += item.price;
      count++;
    }
  }
  
  return count > 0 ? sum / count : 0;
};

// 베이스 가격 계산 (UPBIT 우선, 없으면 BITHUMB)
export const calculateBasePrice = (upbit, bithumb) => {
  return upbit || bithumb || 0;
};

// DIFF 및 RATIO 계산
export const calculateDiffAndRatio = (base, fkbrti) => {
  const diff = base - fkbrti;
  const ratio = Math.abs(diff / (base || 1)) * 100;
  return { diff, ratio };
};

/**
 * API 응답 데이터를 테이블용 데이터로 변환
 * 모든 계산을 한 번에 수행하여 렌더링 시 재계산 방지
 * 거래소별 가격이 0인 경우 직전에 찍힌 현재가로 채움
 */
export const transformIndexCalcData = (apiDataList) => {
  if (!Array.isArray(apiDataList)) return [];
  
  const lastPrices = { UPBIT: 0, BITHUMB: 0, COINONE: 0, KORBIT: 0 };

  return apiDataList.map((item) => {
    const expectedStatus = item.expected_status || [];
    
    let upbit = getExchangePrice(expectedStatus, "E0010001");
    let bithumb = getExchangePrice(expectedStatus, "E0020001");
    let korbit = getExchangePrice(expectedStatus, "E0050001");
    let coinone = getExchangePrice(expectedStatus, "E0030001");
    
    if (upbit === 0 && lastPrices.UPBIT > 0) upbit = lastPrices.UPBIT;
    if (bithumb === 0 && lastPrices.BITHUMB > 0) bithumb = lastPrices.BITHUMB;
    if (korbit === 0 && lastPrices.KORBIT > 0) korbit = lastPrices.KORBIT;
    if (coinone === 0 && lastPrices.COINONE > 0) coinone = lastPrices.COINONE;
    
    if (upbit > 0) lastPrices.UPBIT = upbit;
    if (bithumb > 0) lastPrices.BITHUMB = bithumb;
    if (korbit > 0) lastPrices.KORBIT = korbit;
    if (coinone > 0) lastPrices.COINONE = coinone;
    
    const pricesForAvg = [upbit, bithumb, korbit, coinone].filter((p) => p > 0);
    const actualAvg = pricesForAvg.length > 0
      ? pricesForAvg.reduce((a, b) => a + b, 0) / pricesForAvg.length
      : 0;
    
    // 베이스 가격 (UPBIT 우선)
    const basePrice = calculateBasePrice(upbit, bithumb);
    
    // DIFF와 RATIO 계산 (1s, 5s, 10s)
    const { diff: diff1, ratio: ratio1 } = calculateDiffAndRatio(basePrice, item.fkbrti_1s);
    const { diff: diff2, ratio: ratio2 } = calculateDiffAndRatio(basePrice, item.fkbrti_5s);
    const { diff: diff3, ratio: ratio3 } = calculateDiffAndRatio(basePrice, item.fkbrti_10s);
    
    return {
      // 원본 데이터
      createdAt: item.createdAt,
      fkbrti_1s: item.fkbrti_1s,
      fkbrti_5s: item.fkbrti_5s,
      fkbrti_10s: item.fkbrti_10s,
      expected_status: expectedStatus,
      
      // 계산된 데이터 (미리 계산하여 렌더링 시 재계산 방지)
      UPBIT: upbit,
      BITHUMB: bithumb,
      KORBIT: korbit,
      COINONE: coinone,
      ACTUAL_AVG: actualAvg,
      BASE_PRICE: basePrice,
      
      // DIFF 값들
      DIFF_1: diff1,
      DIFF_2: diff2,
      DIFF_3: diff3,
      
      // RATIO 값들
      RATIO_1: ratio1,
      RATIO_2: ratio2,
      RATIO_3: ratio3,
    };
  });
};

/**
 * 통계 계산 (MIN, MAX, AVG)
 */
export const calculateStats = (dataList) => {
  if (!dataList || dataList.length === 0) {
    return {
      MIN_DIFF_1: 0,
      MAX_DIFF_1: 0,
      AVG_RATIO_1: 0,
    };
  }
  
  const stats = dataList.reduce(
    (acc, row) => {
      acc.MIN_DIFF_1 = Math.min(acc.MIN_DIFF_1, row.DIFF_1 || 0);
      acc.MAX_DIFF_1 = Math.max(acc.MAX_DIFF_1, row.DIFF_1 || 0);
      acc.AVG_RATIO_1 += row.RATIO_1 || 0;
      return acc;
    },
    { MIN_DIFF_1: Infinity, MAX_DIFF_1: -Infinity, AVG_RATIO_1: 0 }
  );
  
  stats.AVG_RATIO_1 = stats.AVG_RATIO_1 / dataList.length;
  
  // Infinity 값 처리
  if (!isFinite(stats.MIN_DIFF_1)) stats.MIN_DIFF_1 = 0;
  if (!isFinite(stats.MAX_DIFF_1)) stats.MAX_DIFF_1 = 0;
  
  return stats;
};

/**
 * 거래소별 가격이 0인 경우 직전에 찍힌 현재가로 채움 (배열 순서 = 시간 순서 가정)
 * @param {Array<{ UPBIT?, BITHUMB?, COINONE?, KORBIT? }>} dataList
 */
export const fillZeroPricesWithPrevious = (dataList) => {
  if (!Array.isArray(dataList) || dataList.length === 0) return;
  const last = { UPBIT: 0, BITHUMB: 0, COINONE: 0, KORBIT: 0 };
  for (const row of dataList) {
    if (Number(row.UPBIT) === 0 && last.UPBIT > 0) row.UPBIT = last.UPBIT;
    if (Number(row.UPBIT) > 0) last.UPBIT = Number(row.UPBIT);
    if (Number(row.BITHUMB) === 0 && last.BITHUMB > 0) row.BITHUMB = last.BITHUMB;
    if (Number(row.BITHUMB) > 0) last.BITHUMB = Number(row.BITHUMB);
    if (Number(row.COINONE) === 0 && last.COINONE > 0) row.COINONE = last.COINONE;
    if (Number(row.COINONE) > 0) last.COINONE = Number(row.COINONE);
    if (Number(row.KORBIT) === 0 && last.KORBIT > 0) row.KORBIT = last.KORBIT;
  }
};

/**
 * 채워진 거래소 가격 기준으로 actual_avg, diff_1/5/10, ratio_1/5/10 재계산
 * (직전가로 0을 채운 후 DIFF/RATIO가 잘못된 경우 보정)
 * @param {Array<{ UPBIT?, BITHUMB?, COINONE?, KORBIT?, fkbrti_1s?, fkbrti_5s?, fkbrti_10s? }>} dataList
 */
export const recalculateDerivedFromFilledPrices = (dataList) => {
  if (!Array.isArray(dataList) || dataList.length === 0) return;
  for (const row of dataList) {
    const upbit = Number(row.UPBIT) || 0;
    const bithumb = Number(row.BITHUMB) || 0;
    const coinone = Number(row.COINONE) || 0;
    const korbit = Number(row.KORBIT) || 0;
    const pricesForAvg = [upbit, bithumb, coinone, korbit].filter((p) => p > 0);
    row.actual_avg = pricesForAvg.length > 0
      ? pricesForAvg.reduce((a, b) => a + b, 0) / pricesForAvg.length
      : 0;
    const basePrice = upbit || bithumb || 0;
    const f1 = Number(row.fkbrti_1s);
    const f5 = Number(row.fkbrti_5s);
    const f10 = Number(row.fkbrti_10s);
    row.diff_1 = basePrice - f1;
    row.diff_5 = basePrice - f5;
    row.diff_10 = basePrice - f10;
    row.ratio_1 = basePrice > 0 ? Math.abs(row.diff_1 / basePrice) * 100 : 0;
    row.ratio_5 = basePrice > 0 ? Math.abs(row.diff_5 / basePrice) * 100 : 0;
    row.ratio_10 = basePrice > 0 ? Math.abs(row.diff_10 / basePrice) * 100 : 0;
  }
};
