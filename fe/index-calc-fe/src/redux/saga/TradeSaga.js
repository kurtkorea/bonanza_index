import { takeEvery, put, select } from 'redux-saga/effects';
import axios from 'axios';
import moment from 'moment';
import { notification  } from 'antd';
import common from '../../common';
import { isUndefined } from "lodash";

function* tradeInit() {
  try {      

    const new_data = yield axios.get("/service/v1/master");
    yield put({
      type: "trade/codeList",
      payload: new_data.data,
    });  
    sessionStorage.setItem( "master_list", JSON.stringify(new_data.data) );

    let market_status = yield get_market_status;
    yield put({
      type: "trade/market_status/init",
      payload: market_status,
    });    

    let system_message_list = yield get_system_message;
    yield put({
      type: "trade/system_log/init",
      payload: system_message_list,
    });

    let message_list = yield get_messages;
    yield put({
      type: "trade/messages",
      payload: message_list,
    });

    let first_symbol = localStorage.getItem("first_symbol");
    let first_symbol_name = localStorage.getItem("first_symbol_name");

    let stockList = yield select(({ TradeReducer: { stockList } }) => stockList);    

    let findStockItem = stockList.find((item) => item.symbol.trim() === first_symbol.trim());

    if ( common.chk_symbol(first_symbol) )
    {
      first_symbol = stockList[0].symbol.trim();
      first_symbol_name = stockList[0].kor_name.trim();
      localStorage.setItem("first_symbol", first_symbol);
      localStorage.setItem("first_symbol_name", first_symbol_name);      
    }

    if ( findStockItem != null )
    {      
      yield put({
        type: "trade/current_symbol",
        payload: first_symbol,
      });    
      yield put({
        type: "order/symbol",
        payload: {
          symbol: first_symbol,
          symbol_name: first_symbol_name,
          style : "tradeInit-2",
        },          
      });        
    }
    
  } catch (error) {
    console.log(error);
  }
}

export default [
  // takeEvery('init', tradeInit),
  // takeEvery('order/symbol', tradeSymbolChange),
  // takeEvery('user/login/success', tradeInit),
];

  // const get_market_status = axios.get('/service/v1/market_status').then(resp => resp.data);
  // const get_system_message = axios.get('/service/v1/system_message').then(resp => resp.data);
  // const get_messages = axios.get('/service/v1/messages').then(resp => resp.data);

  const get_snapshot = (symbol, id) => axios.get('/service/v1/snapshot?symbol=' + symbol).then(resp => resp.data);
