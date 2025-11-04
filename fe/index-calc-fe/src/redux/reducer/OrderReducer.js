import { produce } from "immer";
import common from "../../common";

const initState = {
  theme: localStorage.getItem("save-theme") ?? "Light",
  prev_symbol : "",
  broker_id : "1234",
  account   : "123456789012",
  symbol    : "",
  symbol_name: "",
  side      : 0,    // 0 : 매수, 1 : 매도  
  market_type: 0,   // 0 : 지정가, 1 : 시장가  
  order_type: 0,    // 0 : EOT_REGULAR, EOT_MARGIN_PURCHASE, EOT_SHORT_SALE, EOT_SBL_SHORT_SALE, EOT_MARGIN_PURCHASE_DAY_TRADING, EOT_SHORT_SALE_DAY_TRADING, EOT_REGULAR_WITHOUT_SB_DAY_TRADE
  fill_type  : 0,   // 0 : EOTIF_DAY, EOTIF_IOC, EOTIF_FOK, EOTIF_UNKNOW
  trade_type : 0,   // 0 : EOTT_REGULAR, EOTT_FIXED, EOTT_ODD_LOT, EOTT_UNKNOW, EOTT_INTRADAY_ODD_LOT  
  replace_type : 0, //0 : 가격정정, 1 : 수량정정
  price     : 0,    
  volume    : 0,
  user_data : "123456789012",

};

export default (state = initState, { type, payload }) => {
  switch (type) {

    case "order/order_info":
      return produce(state, (draft) => {        
        draft.ableBuy = payload.매수가능;
        draft.ableSell = payload.매도가능;
      });    

    case "order/order_item":
      return produce(state, (draft) => {        
        /*
        draft.broker_id = payload.broker_id;
        draft.account = payload.account;
        draft.symbol = payload.symbol;
        draft.symbol_name = payload.symbol_name;
        draft.side = payload.side;
        draft.market_type = payload.market_type;
        draft.order_type = payload.order_type;
        draft.fill_type = payload.fill_type;
        draft.trade_type = payload.trade_type;
        draft.replace_type = payload.replace_type;
        draft.price = payload.price;
        draft.trade_type = payload.trade_type;
        draft.volume = payload.volume;
        draft.user_data = payload.user_data;
        */
      });         

    case "order/change":
      return produce(state, (draft) => {
        draft[payload.name] = payload.value;
      });      

    case "order/symbol":      
      return produce(state, (draft) => {
        draft.symbol = payload.symbol;
        draft.symbol_name = payload.symbol_name;
        draft.prev_symbol = draft.symbol;
      });      
    case "order/side":
      return {
        ...state,
        side: payload.data,
      };
    case "order/price":
      return {
        ...state,
        price: payload.data,
      };
    case "order/volume":
      return {
        ...state,
        volume: payload.data,
      };
    case "order/market_type":
      return {
        ...state,
        market_type: payload.data,
      };
    case "order/order_type":
      return {
        ...state,
        order_type: payload.data,
      };
    case "order/fill_type":
      return {
        ...state,
        fill_type: payload.data,
      };    
    case "order/trade_type":
      return {
        ...state,
        trade_type: payload.data,
      };    
    case "order/replace_type":
      return {
        ...state,
        replace_type: payload.data,
      };                      
    case "user/logout":
      return produce(state, (draft) => {

      });
    default:
      return state;
  }
};
