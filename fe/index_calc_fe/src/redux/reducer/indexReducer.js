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
    AVG_RATIO_1: 0,
    AVG_RATIO_2: 0,
    AVG_RATIO_3: 0,
    MAX_RATIO_1: 0,
    MAX_RATIO_2: 0,
    MAX_RATIO_3: 0,
    MIN_ACTUAL_AVG: 0,
    MAX_ACTUAL_AVG: 0,
  }
};

export default (state = initState, { type, payload }) => {
  switch (type) {   
    case 'fkbrti/update_min_max_info':
      return produce(state, draft => {
        draft.MIN_MAX_INFO = payload;
      });
    case 'fkbrti/init':
      return produce(state, draft => {
        // console.log("fkbrti/init", payload);
        draft.current_page = 1;
        draft.index_data = payload.datalist;

        for (const new_item of payload.datalist) {
          if (new_item.DIFF_1 < draft.MIN_MAX_INFO.MIN_DIFF_1) {
            draft.MIN_MAX_INFO.MIN_DIFF_1 = new_item.DIFF_1;
          }
          if (new_item.DIFF_1 > draft.MIN_MAX_INFO.MAX_DIFF_1) {
            draft.MIN_MAX_INFO.MAX_DIFF_1 = new_item.DIFF_1;
          }
          if (new_item.DIFF_2 < draft.MIN_MAX_INFO.MIN_DIFF_2) {
            draft.MIN_MAX_INFO.MIN_DIFF_2 = new_item.DIFF_2;
          }
          if (new_item.DIFF_2 > draft.MIN_MAX_INFO.MAX_DIFF_2) {
            draft.MIN_MAX_INFO.MAX_DIFF_2 = new_item.DIFF_2;
          }
          if (new_item.DIFF_3 < draft.MIN_MAX_INFO.MIN_DIFF_3) {
            draft.MIN_MAX_INFO.MIN_DIFF_3 = new_item.DIFF_3;
          }
          if (new_item.DIFF_3 > draft.MIN_MAX_INFO.MAX_DIFF_3) {
            draft.MIN_MAX_INFO.MAX_DIFF_3 = new_item.DIFF_3;
          }

          if (new_item.RATIO_1 > draft.MIN_MAX_INFO.MAX_RATIO_1) {
            draft.MIN_MAX_INFO.MAX_RATIO_1 = new_item.RATIO_1;
          }

          if (new_item.RATIO_2 > draft.MIN_MAX_INFO.MAX_RATIO_2) {
            draft.MIN_MAX_INFO.MAX_RATIO_2 = new_item.RATIO_2;
          }

          if (new_item.RATIO_3 > draft.MIN_MAX_INFO.MAX_RATIO_3) {
            draft.MIN_MAX_INFO.MAX_RATIO_3 = new_item.RATIO_3;
          }

          if (new_item.ACTUAL_AVG < draft.MIN_MAX_INFO.MIN_ACTUAL_AVG) {
            draft.MIN_MAX_INFO.MIN_ACTUAL_AVG = new_item.ACTUAL_AVG;
          }
          if (new_item.ACTUAL_AVG > draft.MIN_MAX_INFO.MAX_ACTUAL_AVG) {
            draft.MIN_MAX_INFO.MAX_ACTUAL_AVG = new_item.ACTUAL_AVG;
          }

          if (!isNaN(new_item.RATIO_1)) {
            if (!draft.MIN_MAX_INFO._ratio1_sum_count) {
              draft.MIN_MAX_INFO._ratio1_sum_count = { sum: 0, count: 0 };
            }
            draft.MIN_MAX_INFO._ratio1_sum_count.sum += new_item.RATIO_1;
            draft.MIN_MAX_INFO._ratio1_sum_count.count += 1;
            draft.MIN_MAX_INFO.AVG_RATIO_1 = draft.MIN_MAX_INFO._ratio1_sum_count.sum / draft.MIN_MAX_INFO._ratio1_sum_count.count;
          }

          if (!isNaN(new_item.RATIO_2)) {
            if (!draft.MIN_MAX_INFO._ratio2_sum_count) {
              draft.MIN_MAX_INFO._ratio2_sum_count = { sum: 0, count: 0 };
            }
            draft.MIN_MAX_INFO._ratio2_sum_count.sum += new_item.RATIO_2;
            draft.MIN_MAX_INFO._ratio2_sum_count.count += 1;
            draft.MIN_MAX_INFO.AVG_RATIO_2 = draft.MIN_MAX_INFO._ratio2_sum_count.sum / draft.MIN_MAX_INFO._ratio2_sum_count.count;
          }
  
          // RATIO_3 의 평균값을 구하라
  
          if (!isNaN(new_item.RATIO_3)) {
              if (!draft.MIN_MAX_INFO._ratio3_sum_count) {
              draft.MIN_MAX_INFO._ratio3_sum_count = { sum: 0, count: 0 };
            }
            draft.MIN_MAX_INFO._ratio3_sum_count.sum += new_item.RATIO_3;
            draft.MIN_MAX_INFO._ratio3_sum_count.count += 1;
            draft.MIN_MAX_INFO.AVG_RATIO_3 = draft.MIN_MAX_INFO._ratio3_sum_count.sum / draft.MIN_MAX_INFO._ratio3_sum_count.count;
          }
        }

      });
    case 'fkbrti/update':
      return produce(state, draft => {
        // console.log("fkbrti/update", draft.current_page);
        if (Array.isArray(draft.index_data)) {
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
              DIFF_1: 0,
              DIFF_2: 0,
              DIFF_3: 0,
              RATIO_1: 0,
              RATIO_2: 0,
              RATIO_3: 0,
              ACTUAL_AVG: 0,
            };

            let sum = 0;
            let count = 0;
            for (const expected_status of item.expected_status) {
              if (expected_status.reason == "ok") {
                sum += expected_status.price;
                count++;
              }
            }
            new_item.ACTUAL_AVG = sum / count;

            let colF = new_item.BITTHUMB;
            let colI = new_item.UPBIT;
    
            if (!colI && colI !== 0) {
              new_item.DIFF_1 = colF - new_item.fkbrti_1s;
            } else {
              new_item.DIFF_1 = colI - new_item.fkbrti_1s;
            }
    
            if (!colI && colI !== 0) {
              new_item.DIFF_2 = colF - new_item.fkbrti_5s;
            } else {
              new_item.DIFF_2 = colI - new_item.fkbrti_5s;
            }
    
            if (!colI && colI !== 0) {
              new_item.DIFF_3 = colF - new_item.fkbrti_10s;
            } else {
              new_item.DIFF_3 = colI - new_item.fkbrti_10s;
            }
    
            if (!colI && colI !== 0) {
              new_item.RATIO_1 = Math.abs(new_item.DIFF_1 / colF);
            } else {
              new_item.RATIO_1 = Math.abs(new_item.DIFF_1 / colI);
            }
            new_item.RATIO_1 = new_item.RATIO_1 * 100;
    
            if (!colI && colI !== 0) {
              new_item.RATIO_2 = Math.abs(new_item.DIFF_2 / colF);
            } else {
              new_item.RATIO_2 = Math.abs(new_item.DIFF_2 / colI);
            }
            new_item.RATIO_2 = new_item.RATIO_2 * 100;
    
            if (!colI && colI !== 0) {
              new_item.RATIO_3 = Math.abs(new_item.DIFF_3 / colF);
            } else {
              new_item.RATIO_3 = Math.abs(new_item.DIFF_3 / colI);
            }
            new_item.RATIO_3 = new_item.RATIO_3 * 100;

            if (new_item.DIFF_1 < draft.MIN_MAX_INFO.MIN_DIFF_1) {
              draft.MIN_MAX_INFO.MIN_DIFF_1 = new_item.DIFF_1;
            }
            if (new_item.DIFF_1 > draft.MIN_MAX_INFO.MAX_DIFF_1) {
              draft.MIN_MAX_INFO.MAX_DIFF_1 = new_item.DIFF_1;
            }
            if (new_item.DIFF_2 < draft.MIN_MAX_INFO.MIN_DIFF_2) {
              draft.MIN_MAX_INFO.MIN_DIFF_2 = new_item.DIFF_2;
            }
            if (new_item.DIFF_2 > draft.MIN_MAX_INFO.MAX_DIFF_2) {
              draft.MIN_MAX_INFO.MAX_DIFF_2 = new_item.DIFF_2;
            }
            if (new_item.DIFF_3 < draft.MIN_MAX_INFO.MIN_DIFF_3) {
              draft.MIN_MAX_INFO.MIN_DIFF_3 = new_item.DIFF_3;
            }
            if (new_item.DIFF_3 > draft.MIN_MAX_INFO.MAX_DIFF_3) {
              draft.MIN_MAX_INFO.MAX_DIFF_3 = new_item.DIFF_3;
            }

            if (new_item.RATIO_1 > draft.MIN_MAX_INFO.MAX_RATIO_1) {
              draft.MIN_MAX_INFO.MAX_RATIO_1 = new_item.RATIO_1;
            }

            if (new_item.RATIO_2 > draft.MIN_MAX_INFO.MAX_RATIO_2) {
              draft.MIN_MAX_INFO.MAX_RATIO_2 = new_item.RATIO_2;
            }

            if (new_item.RATIO_3 > draft.MIN_MAX_INFO.MAX_RATIO_3) {
              draft.MIN_MAX_INFO.MAX_RATIO_3 = new_item.RATIO_3;
            }

            if (new_item.ACTUAL_AVG < draft.MIN_MAX_INFO.MIN_ACTUAL_AVG) {
              draft.MIN_MAX_INFO.MIN_ACTUAL_AVG = new_item.ACTUAL_AVG;
            }
            if (new_item.ACTUAL_AVG > draft.MIN_MAX_INFO.MAX_ACTUAL_AVG) {
              draft.MIN_MAX_INFO.MAX_ACTUAL_AVG = new_item.ACTUAL_AVG;
            }

            if (!isNaN(new_item.RATIO_1)) {
              if (!draft.MIN_MAX_INFO._ratio1_sum_count) {
                draft.MIN_MAX_INFO._ratio1_sum_count = { sum: 0, count: 0 };
              }
              draft.MIN_MAX_INFO._ratio1_sum_count.sum += new_item.RATIO_1;
              draft.MIN_MAX_INFO._ratio1_sum_count.count += 1;
              draft.MIN_MAX_INFO.AVG_RATIO_1 = draft.MIN_MAX_INFO._ratio1_sum_count.sum / draft.MIN_MAX_INFO._ratio1_sum_count.count;
            }

            if (!isNaN(new_item.RATIO_2)) {
              if (!draft.MIN_MAX_INFO._ratio2_sum_count) {
                draft.MIN_MAX_INFO._ratio2_sum_count = { sum: 0, count: 0 };
              }
              draft.MIN_MAX_INFO._ratio2_sum_count.sum += new_item.RATIO_2;
              draft.MIN_MAX_INFO._ratio2_sum_count.count += 1;
              draft.MIN_MAX_INFO.AVG_RATIO_2 = draft.MIN_MAX_INFO._ratio2_sum_count.sum / draft.MIN_MAX_INFO._ratio2_sum_count.count;
            }
    
            // RATIO_3 의 평균값을 구하라
    
            if (!isNaN(new_item.RATIO_3)) {
                if (!draft.MIN_MAX_INFO._ratio3_sum_count) {
                draft.MIN_MAX_INFO._ratio3_sum_count = { sum: 0, count: 0 };
              }
              draft.MIN_MAX_INFO._ratio3_sum_count.sum += new_item.RATIO_3;
              draft.MIN_MAX_INFO._ratio3_sum_count.count += 1;
              draft.MIN_MAX_INFO.AVG_RATIO_3 = draft.MIN_MAX_INFO._ratio3_sum_count.sum / draft.MIN_MAX_INFO._ratio3_sum_count.count;
            }

            new_datalist.push(new_item);
          }

          new_datalist = new_datalist.filter(item => !draft.index_data.some(existingItem => existingItem.createdAt === item.createdAt));

          draft.index_data = [...new_datalist, ...draft.index_data];
        }
      });
    case 'fkbrti/append':
      return produce(state, draft => {
        if (Array.isArray(draft.index_data)) {
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
              vwap_sell: item.vwap_sell,
              no_publish: item.no_publish,
              provisional: item.provisional,
              BITTHUMB: item.expected_status.find(item => item.exchange == "102")?.price,
              COINONE: item.expected_status.find(item => item.exchange == "104")?.price,
              KORBIT: item.expected_status.find(item => item.exchange == "103")?.price,
              UPBIT: item.expected_status.find(item => item.exchange == "101")?.price,
              ACTUAL_AVG: 0,
            };

            let sum = 0;
            let count = 0;
            for (const expected_status of item.expected_status) {
              if (expected_status.reason == "ok") {
                sum += expected_status.price;
                count++;
              }
            }
            new_item.ACTUAL_AVG = sum / count;

            new_datalist.push(new_item);
          }

          draft.index_data = [...draft.index_data, ...new_datalist];

          // console.log("fkbrti/append", draft.index_data.length);

          for (const new_item of draft.index_data) {
            if (new_item.DIFF_1 < draft.MIN_MAX_INFO.MIN_DIFF_1) {
              draft.MIN_MAX_INFO.MIN_DIFF_1 = new_item.DIFF_1;
            }
            if (new_item.DIFF_1 > draft.MIN_MAX_INFO.MAX_DIFF_1) {
              draft.MIN_MAX_INFO.MAX_DIFF_1 = new_item.DIFF_1;
            }
            if (new_item.DIFF_2 < draft.MIN_MAX_INFO.MIN_DIFF_2) {
              draft.MIN_MAX_INFO.MIN_DIFF_2 = new_item.DIFF_2;
            }
            if (new_item.DIFF_2 > draft.MIN_MAX_INFO.MAX_DIFF_2) {
              draft.MIN_MAX_INFO.MAX_DIFF_2 = new_item.DIFF_2;
            }
            if (new_item.DIFF_3 < draft.MIN_MAX_INFO.MIN_DIFF_3) {
              draft.MIN_MAX_INFO.MIN_DIFF_3 = new_item.DIFF_3;
            }
            if (new_item.DIFF_3 > draft.MIN_MAX_INFO.MAX_DIFF_3) {
              draft.MIN_MAX_INFO.MAX_DIFF_3 = new_item.DIFF_3;
            }
  
            if (new_item.RATIO_1 > draft.MIN_MAX_INFO.MAX_RATIO_1) {
              draft.MIN_MAX_INFO.MAX_RATIO_1 = new_item.RATIO_1;
            }
  
            if (new_item.RATIO_2 > draft.MIN_MAX_INFO.MAX_RATIO_2) {
              draft.MIN_MAX_INFO.MAX_RATIO_2 = new_item.RATIO_2;
            }
  
            if (new_item.RATIO_3 > draft.MIN_MAX_INFO.MAX_RATIO_3) {
              draft.MIN_MAX_INFO.MAX_RATIO_3 = new_item.RATIO_3;
            }
  
            if (new_item.ACTUAL_AVG < draft.MIN_MAX_INFO.MIN_ACTUAL_AVG) {
              draft.MIN_MAX_INFO.MIN_ACTUAL_AVG = new_item.ACTUAL_AVG;
            }
            if (new_item.ACTUAL_AVG > draft.MIN_MAX_INFO.MAX_ACTUAL_AVG) {
              draft.MIN_MAX_INFO.MAX_ACTUAL_AVG = new_item.ACTUAL_AVG;
            }

            if (!isNaN(new_item.RATIO_1)) {
              if (!draft.MIN_MAX_INFO._ratio1_sum_count) {
                draft.MIN_MAX_INFO._ratio1_sum_count = { sum: 0, count: 0 };
              }
              draft.MIN_MAX_INFO._ratio1_sum_count.sum += new_item.RATIO_1;
              draft.MIN_MAX_INFO._ratio1_sum_count.count += 1;
              draft.MIN_MAX_INFO.AVG_RATIO_1 = draft.MIN_MAX_INFO._ratio1_sum_count.sum / draft.MIN_MAX_INFO._ratio1_sum_count.count;
            }
  
            if (!isNaN(new_item.RATIO_2)) {
              if (!draft.MIN_MAX_INFO._ratio2_sum_count) {
                draft.MIN_MAX_INFO._ratio2_sum_count = { sum: 0, count: 0 };
              }
              draft.MIN_MAX_INFO._ratio2_sum_count.sum += new_item.RATIO_2;
              draft.MIN_MAX_INFO._ratio2_sum_count.count += 1;
              draft.MIN_MAX_INFO.AVG_RATIO_2 = draft.MIN_MAX_INFO._ratio2_sum_count.sum / draft.MIN_MAX_INFO._ratio2_sum_count.count;
            }
    
            // RATIO_3 의 평균값을 구하라
    
            if (!isNaN(new_item.RATIO_3)) {
                if (!draft.MIN_MAX_INFO._ratio3_sum_count) {
                draft.MIN_MAX_INFO._ratio3_sum_count = { sum: 0, count: 0 };
              }
              draft.MIN_MAX_INFO._ratio3_sum_count.sum += new_item.RATIO_3;
              draft.MIN_MAX_INFO._ratio3_sum_count.count += 1;
              draft.MIN_MAX_INFO.AVG_RATIO_3 = draft.MIN_MAX_INFO._ratio3_sum_count.sum / draft.MIN_MAX_INFO._ratio3_sum_count.count;
            }
          }

          // console.log("fkbrti/append", JSON.stringify(draft.MIN_MAX_INFO, null, 2));

        }
      });

    default:
      return state;
  }
};
