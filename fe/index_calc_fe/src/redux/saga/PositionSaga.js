import axios from 'axios';
import { put, takeEvery } from 'redux-saga/effects';
import common from '../../common';

function* positionInit({ payload }) {

  if ( !common.isEmpty(payload) )
  {  
    try {
     
      // const positionList = yield getPositionList(payload.account);

      // const orderList = yield getOrderList(payload.account);

      // if ( orderList != null )
      // {
      //   yield put({
      //     type: 'orderList/init',
      //     payload: orderList.datalist,
      //   });
      // }

      // if ( positionList != null )
      // {
      //   yield put({
      //     type: 'positionList/init',
      //     payload: positionList.datalist,
      //   });
      // }    

    } catch (error) {
      console.log(error);
    }
  }
}

function* positionReset() {
  try {
    yield put({
      type: 'position/reset',
    });
  } catch (error) {
    console.log(error);
  }
}

function* positionRefresh(data) {
  yield positionReset();
  yield positionInit(data);
}

export default [
  takeEvery('user/login/success', positionInit),
  takeEvery('user/logout', positionReset),
  takeEvery('position/refresh', positionInit),

  takeEvery('init', positionInit),
];

// const getPositionList = account =>
//   axios.get('/order/v1/position_orders?account=' + account).then(resp => resp.data);
// const getOrderList = account =>
//   axios.get('/order/v1/active_orders?account=' + account).then(resp => resp.data);

