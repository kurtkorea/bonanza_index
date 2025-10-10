import { produce } from 'immer';

const initState = {
  index_data: [],
  current_page: 1,
};

export default (state = initState, { type, payload }) => {
  switch (type) {   
    case 'fkbrti/init':
      return produce(state, draft => {
        // console.log("fkbrti/init", payload);
        draft.current_page = 1;
        draft.index_data = payload.datalist;
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

          new_datalist = new_datalist.filter(item => !draft.index_data.some(existingItem => existingItem.createdAt === item.createdAt));

          if ( process.env.IS_DEBUG == "true" ) {
            draft.index_data = [...new_datalist, ...draft.index_data].slice(0, 5000);
          } else {
            draft.index_data = [...new_datalist, ...draft.index_data].slice(0, 50000);
          }
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

          if ( process.env.IS_DEBUG == "true" ) {
            draft.index_data = [...draft.index_data, ...new_datalist].slice(0, 5000);
          } else {
            draft.index_data = [...draft.index_data, ...new_datalist].slice(0, 50000);
          }
        }
      });

    default:
      return state;
  }
};
