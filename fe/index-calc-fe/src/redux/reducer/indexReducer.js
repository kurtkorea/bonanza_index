import { produce } from 'immer';

const initState = {
  index_data: [],
  current_page: 1,
  MIN_MAX_INFO : {
    MIN_DIFF_1: 0,
    MIN_DIFF_2: 0,
    MIN_DIFF_3: 0,
    MAX_DIFF_1: 0,
    MAX_DIFF_2: 0,
    MAX_DIFF_3: 0,
    AVG_DIFF_1: 0,
    AVG_DIFF_2: 0,
    AVG_DIFF_3: 0,
    MIN_RATIO_1: 0,
    MIN_RATIO_2: 0,
    MIN_RATIO_3: 0,
    MAX_RATIO_1: 0,
    MAX_RATIO_2: 0,
    MAX_RATIO_3: 0,
    AVG_RATIO_1: 0,
    AVG_RATIO_2: 0,
    AVG_RATIO_3: 0,
    MIN_ACTUAL_AVG: 0,
    MAX_ACTUAL_AVG: 0,
    total_count: 0,
  },
  summaryStats: {
    '1D': {
      DIFF_1s: { MIN: 0, MAX: 0, AVG: 0 },
      RATIO_1s: { MIN: 0, MAX: 0, AVG: 0 },
      DIFF_5s: { MIN: 0, MAX: 0, AVG: 0 },
      RATIO_5s: { MIN: 0, MAX: 0, AVG: 0 },
      DIFF_10s: { MIN: 0, MAX: 0, AVG: 0 },
      RATIO_10s: { MIN: 0, MAX: 0, AVG: 0 },
    },
    '1W': {
      DIFF_1s: { MIN: 0, MAX: 0, AVG: 0 },
      RATIO_1s: { MIN: 0, MAX: 0, AVG: 0 },
      DIFF_5s: { MIN: 0, MAX: 0, AVG: 0 },
      RATIO_5s: { MIN: 0, MAX: 0, AVG: 0 },
      DIFF_10s: { MIN: 0, MAX: 0, AVG: 0 },
      RATIO_10s: { MIN: 0, MAX: 0, AVG: 0 },
    },
    '1M': {
      DIFF_1s: { MIN: 0, MAX: 0, AVG: 0 },
      RATIO_1s: { MIN: 0, MAX: 0, AVG: 0 },
      DIFF_5s: { MIN: 0, MAX: 0, AVG: 0 },
      RATIO_5s: { MIN: 0, MAX: 0, AVG: 0 },
      DIFF_10s: { MIN: 0, MAX: 0, AVG: 0 },
      RATIO_10s: { MIN: 0, MAX: 0, AVG: 0 },
    },
    '1Y': {
      DIFF_1s: { MIN: 0, MAX: 0, AVG: 0 },
      RATIO_1s: { MIN: 0, MAX: 0, AVG: 0 },
      DIFF_5s: { MIN: 0, MAX: 0, AVG: 0 },
      RATIO_5s: { MIN: 0, MAX: 0, AVG: 0 },
      DIFF_10s: { MIN: 0, MAX: 0, AVG: 0 },
      RATIO_10s: { MIN: 0, MAX: 0, AVG: 0 },
    },
  },
  total_count: 0,
};

const computeMinMaxInfo = (data) => {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      MIN_DIFF_1: 0,
      MIN_DIFF_2: 0,
      MIN_DIFF_3: 0,
      MAX_DIFF_1: 0,
      MAX_DIFF_2: 0,
      MAX_DIFF_3: 0,
      AVG_DIFF_1: 0,
      AVG_DIFF_2: 0,
      AVG_DIFF_3: 0,
      MIN_RATIO_1: 0,
      MIN_RATIO_2: 0,
      MIN_RATIO_3: 0,
      MAX_RATIO_1: 0,
      MAX_RATIO_2: 0,
      MAX_RATIO_3: 0,
      AVG_RATIO_1: 0,
      AVG_RATIO_2: 0,
      AVG_RATIO_3: 0,
      MIN_ACTUAL_AVG: 0,
      MAX_ACTUAL_AVG: 0,
      total_count: 0,
    };
  }

  let minDiff1 = Number.POSITIVE_INFINITY;
  let minDiff2 = Number.POSITIVE_INFINITY;
  let minDiff3 = Number.POSITIVE_INFINITY;
  let maxDiff1 = Number.NEGATIVE_INFINITY;
  let maxDiff2 = Number.NEGATIVE_INFINITY;
  let maxDiff3 = Number.NEGATIVE_INFINITY;

  let diff1Sum = 0;
  let diff2Sum = 0;
  let diff3Sum = 0;
  let diff1Count = 0;
  let diff2Count = 0;
  let diff3Count = 0;

  let minRatio1 = Number.POSITIVE_INFINITY;
  let minRatio2 = Number.POSITIVE_INFINITY;
  let minRatio3 = Number.POSITIVE_INFINITY;
  let maxRatio1 = Number.NEGATIVE_INFINITY;
  let maxRatio2 = Number.NEGATIVE_INFINITY;
  let maxRatio3 = Number.NEGATIVE_INFINITY;

  let ratio1Sum = 0;
  let ratio2Sum = 0;
  let ratio3Sum = 0;
  let ratio1Count = 0;
  let ratio2Count = 0;
  let ratio3Count = 0;

  let minActualAvg = Number.POSITIVE_INFINITY;
  let maxActualAvg = Number.NEGATIVE_INFINITY;

  for (const item of data) {
    const diff1 = Number(
      item?.diff_1 ??
      item?.diff1 ??
      item?.diff_1s ??
      item?.diff1s
    );
    const diff2 = Number(
      item?.diff_5 ??
      item?.diff2 ??
      item?.diff_5s ??
      item?.diff2s
    );
    const diff3 = Number(
      item?.diff_10 ??
      item?.diff3 ??
      item?.diff_10s ??
      item?.diff3s
    );
    const ratio1 = Number(
      item?.ratio_1 ??
      item?.ratio1 ??
      item?.ratio_1s ??
      item?.ratio1s
    );
    const ratio2 = Number(
      item?.ratio_5 ??
      item?.ratio2 ??
      item?.ratio_5s ??
      item?.ratio2s
    );
    const ratio3 = Number(
      item?.ratio_10 ??
      item?.ratio3 ??
      item?.ratio_10s ??
      item?.ratio3s
    );
    const actualAvg = Number(item?.actual_avg ?? item?.actualAvg);

    if (Number.isFinite(diff1)) {
      if (diff1 < minDiff1) minDiff1 = diff1;
      if (diff1 > maxDiff1) maxDiff1 = diff1;
      diff1Sum += diff1;
      diff1Count += 1;
    }
    if (Number.isFinite(diff2)) {
      if (diff2 < minDiff2) minDiff2 = diff2;
      if (diff2 > maxDiff2) maxDiff2 = diff2;
      diff2Sum += diff2;
      diff2Count += 1;
    }
    if (Number.isFinite(diff3)) {
      if (diff3 < minDiff3) minDiff3 = diff3;
      if (diff3 > maxDiff3) maxDiff3 = diff3;
      diff3Sum += diff3;
      diff3Count += 1;
    }

    if (Number.isFinite(ratio1)) {
      if (ratio1 < minRatio1) minRatio1 = ratio1;
      if (ratio1 > maxRatio1) maxRatio1 = ratio1;
      ratio1Sum += ratio1;
      ratio1Count += 1;
    }
    if (Number.isFinite(ratio2)) {
      if (ratio2 < minRatio2) minRatio2 = ratio2;
      if (ratio2 > maxRatio2) maxRatio2 = ratio2;
      ratio2Sum += ratio2;
      ratio2Count += 1;
    }
    if (Number.isFinite(ratio3)) {
      if (ratio3 < minRatio3) minRatio3 = ratio3;
      if (ratio3 > maxRatio3) maxRatio3 = ratio3;
      ratio3Sum += ratio3;
      ratio3Count += 1;
    }

    if (Number.isFinite(actualAvg)) {
      if (actualAvg < minActualAvg) minActualAvg = actualAvg;
      if (actualAvg > maxActualAvg) maxActualAvg = actualAvg;
    }
  }

  const safeValue = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
  const safeAverage = (sum, count) => (count > 0 ? sum / count : 0);

  return {
    MIN_DIFF_1: safeValue(minDiff1),
    MIN_DIFF_2: safeValue(minDiff2),
    MIN_DIFF_3: safeValue(minDiff3),
    MAX_DIFF_1: safeValue(maxDiff1),
    MAX_DIFF_2: safeValue(maxDiff2),
    MAX_DIFF_3: safeValue(maxDiff3),
    AVG_DIFF_1: safeAverage(diff1Sum, diff1Count),
    AVG_DIFF_2: safeAverage(diff2Sum, diff2Count),
    AVG_DIFF_3: safeAverage(diff3Sum, diff3Count),
    MIN_RATIO_1: safeValue(minRatio1),
    MIN_RATIO_2: safeValue(minRatio2),
    MIN_RATIO_3: safeValue(minRatio3),
    MAX_RATIO_1: safeValue(maxRatio1),
    MAX_RATIO_2: safeValue(maxRatio2),
    MAX_RATIO_3: safeValue(maxRatio3),
    AVG_RATIO_1: safeAverage(ratio1Sum, ratio1Count),
    AVG_RATIO_2: safeAverage(ratio2Sum, ratio2Count),
    AVG_RATIO_3: safeAverage(ratio3Sum, ratio3Count),
    MIN_ACTUAL_AVG: safeValue(minActualAvg),
    MAX_ACTUAL_AVG: safeValue(maxActualAvg),
    total_count: data.length,
  };
};

export default (state = initState, { type, payload }) => {
  switch (type) {   
    case 'fkbrti/update_min_max_info':
      return produce(state, draft => {
        draft.MIN_MAX_INFO = payload;
        draft.total_count = payload.total_count;
      });
    case 'fkbrti/set_stats':
      return produce(state, draft => {
        const incoming = payload || {};
        for (const period of Object.keys(incoming)) {
          draft.summaryStats[period] = {
            ...draft.summaryStats[period],
            ...incoming[period],
          };
        }
      });
    case 'fkbrti/update_total_count':
      return produce(state, draft => {
        draft.total_count = payload;
      });
    case 'fkbrti/init':
      return produce(state, draft => {
        draft.current_page = 1;
        draft.index_data = payload.datalist;
        // const stats = computeMinMaxInfo(draft.index_data);
        // draft.MIN_MAX_INFO = stats;
        // draft.total_count = stats.total_count;
      });
    case 'fkbrti/update':
      return produce(state, draft => {
        if (Array.isArray(draft.index_data) && draft.index_data.length > 0) 
        {
          let new_datalist = [];
          for (const item of payload.datalist) {
            let new_item = {
              createdAt: item.createdAt,
              fkbrti_1s: item.fkbrti_1s,
              fkbrti_5s: item.fkbrti_5s,
              fkbrti_10s: item.fkbrti_10s,
              expected_status: item.expected_status,
              expected_exchanges: item.expected_exchanges,
              sources: item.sources,
              vwap_buy: item.vwap_buy,
              vwap_sell: item.vwap_sell,
              no_publish: item.no_publish,
              provisional: item.provisional,
              BITTHUMB: item.expected_status.find(item => item.exchange == "102")?.price,
              COINONE: item.expected_status.find(item => item.exchange == "104")?.price,
              KORBIT: item.expected_status.find(item => item.exchange == "103")?.price,
              UPBIT: item.expected_status.find(item => item.exchange == "101")?.price,
              diff_1: item.diff_1,
              diff_5: item.diff_5,
              diff_10: item.diff_10,
              ratio_1: item.ratio_1,
              ratio_5: item.ratio_5,
              ratio_10: item.ratio_10,
              actual_avg: item.actual_avg,
            };
            new_datalist.push(new_item);
          }

          new_datalist = new_datalist.filter(item => !draft.index_data.some(existingItem => existingItem.createdAt >= item.createdAt));
          draft.index_data = [...new_datalist, ...draft.index_data];

          // const stats = computeMinMaxInfo(draft.index_data);
          // draft.MIN_MAX_INFO = stats;
          // draft.total_count = stats.total_count;
        }
      });
    case 'fkbrti/append':
      return produce(state, draft => {
        if (Array.isArray(draft.index_data) && draft.index_data.length > 0) {
          draft.current_page = payload.current_page + 1;

          let new_datalist = [];
          for (const item of payload.datalist) {
            let new_item = {
              createdAt: item.createdAt,
              fkbrti_1s: item.fkbrti_1s,
              fkbrti_5s: item.fkbrti_5s,
              fkbrti_10s: item.fkbrti_10s,
              expected_status: item.expected_status,
              expected_exchanges: item.expected_exchanges,
              sources: item.sources,
              vwap_buy: item.vwap_buy,
              diff_1: item.diff_1,
              diff_5: item.diff_5,
              diff_10: item.diff_10,
              ratio_1: item.ratio_1,
              ratio_5: item.ratio_5,
              ratio_10: item.ratio_10,
              vwap_sell: item.vwap_sell,
              no_publish: item.no_publish,
              provisional: item.provisional,
              BITTHUMB: item.expected_status.find(item => item.exchange == "102")?.price,
              COINONE: item.expected_status.find(item => item.exchange == "104")?.price,
              KORBIT: item.expected_status.find(item => item.exchange == "103")?.price,
              UPBIT: item.expected_status.find(item => item.exchange == "101")?.price,
              actual_avg: item.actual_avg,    
            };

            let sum = 0;
            let count = 0;
            for (const expected_status of item.expected_status) {
              if (expected_status.reason == "ok") {
                sum += expected_status.price;
                count++;
              }
            }
            new_item.actual_avg = count > 0 ? sum / count : 0;

            new_datalist.push(new_item);
          }

          draft.index_data = [...draft.index_data, ...new_datalist];

          // const stats = computeMinMaxInfo(draft.index_data);
          // draft.MIN_MAX_INFO = stats;
          // draft.total_count = stats.total_count;

        }

        if (payload.pagination?.totalCount) {
          draft.total_count = payload.pagination.totalCount;
        }
      });
    default:
      return state;
  }
};
