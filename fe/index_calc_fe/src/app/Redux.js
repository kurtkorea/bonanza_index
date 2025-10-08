import React from 'react';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware, compose, combineReducers } from 'redux';
import createSagaMiddleware from 'redux-saga';

import rootSaga from '../redux/saga';
import * as reducer from '../redux/reducer';

const sagaMiddleware = createSagaMiddleware();

const enhancers = [];
const middleware = [sagaMiddleware];

if (process.env.NODE_ENV !== 'production') {
  const devToolsExtension = window.__REDUX_DEVTOOLS_EXTENSION__;

  if (typeof devToolsExtension === 'function') {
    enhancers.push(devToolsExtension());
  }
}

const store = createStore(
  combineReducers({
    ...reducer,
  }),
  {},
  compose(applyMiddleware(...middleware), ...enhancers)
);

sagaMiddleware.run(rootSaga);

const Redux = props => {
  return <Provider store={store}>{props.children}</Provider>;
};

export default Redux;
