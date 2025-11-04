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

// 베이스 가격 계산 (UPBIT 우선, 없으면 BITTHUMB)
export const calculateBasePrice = (upbit, bitthumb) => {
  return upbit || bitthumb || 0;
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
 */
export const transformIndexCalcData = (apiDataList) => {
  if (!Array.isArray(apiDataList)) return [];
  
  return apiDataList.map((item) => {
    const expectedStatus = item.expected_status || [];
    
    // 거래소별 가격 추출
    const upbit = getExchangePrice(expectedStatus, "101");
    const bitthumb = getExchangePrice(expectedStatus, "102");
    const korbit = getExchangePrice(expectedStatus, "103");
    const coinone = getExchangePrice(expectedStatus, "104");
    
    // 평균가 계산
    const actualAvg = calculateActualAvg(expectedStatus);
    
    // 베이스 가격 (UPBIT 우선)
    const basePrice = calculateBasePrice(upbit, bitthumb);
    
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
      BITTHUMB: bitthumb,
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

