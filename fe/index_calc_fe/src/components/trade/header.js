import axios from "axios";
import classNames from "classnames";
import React, { useEffect } from "react";
import { useQuery } from "react-query";
import { useSelector } from "react-redux";
import common from "../../common";
import { setQueryData } from "../../common/queryState";
import { isUndefined } from "lodash";

const TradeHeader = () => {
  const login = useSelector((store) => store.UserReducer.login);
  return (
    <>
      <div className="item-wrapper">
        <TradeHeaderItemInfo />     
        <TradeHeaderItemTicker />
      </div>    
      <div className="item-wrapper">        
        <TradeHeaderItemDay />
      </div>
    </>
  );
};

const TradeHeaderItemInfo = () => {
  const symbol_name = useSelector((store) => store.OrderReducer.symbol_name);
  // const symbol = useSelector((store) => store.OrderReducer.symbol);
  return (
    <div className="item">
      <h2 className="item-name">
        {symbol_name} <span className="coin-list-trigger material-symbols-rounded">arrow_drop_down</span><button>종목변경</button>
      </h2>
    </div>
  );
};

const TradeHeaderItemTicker = () => {

  const close = useSelector((store) => store.TradeReducer.close);
  const rate = useSelector((store) => store.TradeReducer.rate);
  const diff = useSelector((store) => store.TradeReducer.diff);
  const change_symbol = useSelector((store) => store.TradeReducer.change_symbol);
  const volume_sum = useSelector((store) => store.TradeReducer.volume_sum);
  const color = common.judgeChangeVariable(change_symbol, ["up-color", "", "dn-color"]);
  const boxcolor = common.judgeChangeVariable(diff, ["up-color", "eq-color", "dn-color"]);
  const trading_unit = useSelector((store) => store.TradeReducer.current_symbol.trading_unit);

  return (
    <>
      <div className="item">
        <strong className={classNames("item-value main", color)}>{common.pricisionFormat_Precision(close / 10000, 2)}</strong>
        {/* <span className={classNames("item-label", boxcolor)}>  { common.judgeChangeChar(change_symbol) + " " + common.pricisionFormat_Precision(change, price_precision) }</span> */}
        {/* <span className={classNames("item-label", boxcolor)}>  { common.pricisionFormat_Precision(diff, 2) }%</span> */}
        <span className={classNames("item-label", boxcolor)}>  { common.pricisionFormat_Precision(diff / 10000, 2) }</span>
        <span className={classNames("item-label", boxcolor)}>  { common.pricisionFormat_Precision(rate / 10000, 2) }%</span>
        <span className={classNames("item-label", boxcolor)}>  거래량 { common.pricisionFormat_Precision(volume_sum * trading_unit, 0) }</span>
      </div>    
    </>
  );
};

const TradeHeaderItemDay = () => {

  const open = useSelector((store) => store.TradeReducer.open);
  const high = useSelector((store) => store.TradeReducer.high);
  const low = useSelector((store) => store.TradeReducer.low);
  const last_price = useSelector((store) => store.TradeReducer.last_price);

  return (
    <>
      <div className="item">
        <span className="item-cate">시</span>
        <strong className="item-value eq-color">{common.pricisionFormat_Precision(open / 10000, 2)}</strong>
      </div>
      <div className="item">
        <span className="item-cate">고</span>
        <strong className="item-value up-color">{common.pricisionFormat_Precision(high / 10000, 2)}</strong>
      </div>
      <div className="item">
        <span className="item-cate">저</span>
        <strong className="item-value dn-color">{common.pricisionFormat_Precision(low / 10000, 2)}</strong>
      </div>      
      <div className="item">
        <span className="item-cate">전일종가</span>
        <strong className="item-value dn-color">{common.pricisionFormat_Precision(last_price / 10000, 2)}</strong>
      </div>       
    </>
  );
};

export default TradeHeader;
