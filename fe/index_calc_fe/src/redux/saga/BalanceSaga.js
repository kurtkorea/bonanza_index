import axios from 'axios';
import { put, select, takeEvery } from 'redux-saga/effects';
import common from '../../common';

function* balanceInit({ payload }) {
  try {
    const balanceData = yield getBalanceInfo(payload.username);   
    yield put({
      type: 'balance/init',
      payload: balanceData,
    });
  } catch (error) {
    console.log(error);
  }
}

function* balanceRefresh({ payload }) {
  try {
    if ( payload.login )
    {
      const { data } = yield axios.post("/hts/order_info", {
        id: payload.username,
        symbol: payload.symbol,
        price: payload.price,
      });
      yield put({
        type: "order/order_info",
        payload: data,
      });
      yield put({
        type: "balance/update",
        payload: data,
      });
      yield put({
        type: "balance/order_info",
        payload: data,
      });
    } else {
      const { data } = yield axios.post("/hts/order_info", {
        id: "",
        symbol: payload.symbol,
        price: payload.price,
      });     
      yield put({
        type: "order/order_info_guest",
        payload: data,
      });     
    }
  } catch (error) {
    console.log(error);
  }
}


export default [
  // takeEvery('user/login/success', balanceInit),
  //takeEvery('orderinfo/refresh', balanceRefresh),
];

const getBalanceInfo = username =>
  axios.get('/hts/balance?id=' + username).then(resp => resp.data);


