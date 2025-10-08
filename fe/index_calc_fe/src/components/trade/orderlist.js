import classNames from "classnames";
import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import common from "../../common";

const TradeOrderlist = () => {
  // useEffect(() => {
  //   $(".trade-price .thbit-trade-tab .tab").on("click", function () {
  //     var tabGroup = $(this).data("tab-group");
  //     var tabID = $(this).data("tab-id");
  //     $('[data-tab-group="' + tabGroup + '"]').removeClass("on");
  //     $('[data-tab-group="' + tabGroup + '"][data-tab-id="' + tabID + '"]').addClass("on");
  //     $('[data-tab-group="' + tabGroup + '"] input').attr("disabled", true);
  //     $('[data-tab-group="' + tabGroup + '"][data-tab-id="' + tabID + '"] input').attr("disabled", false);
  //   });
  // }, []);

  return (
    <div className="thbit-trade-price-list trade-price">
      <div className="list-wrap list-header">
        <div className="list">          
          {/* <div className="col center">순번</div> */}
          <div className="col center">시장상태</div>
          <div className="col center">체결시간</div>
          <div className="col center">가격</div>          
          <div className="col center">수량</div>
        </div>
      </div>
      <div className="list-group on" data-simplebar data-tab-group="trade" data-tab-id="market">
        <TradeOrderlistMarket />
      </div>
    </div>
  );
};

const TradeOrderlistMarket = () => {

  const price_precision = useSelector((store) => store.TradeReducer.price_precision);
  const tickerList = useSelector((store) => store.TradeReducer.tickerList);
  const trading_unit = useSelector((store) => store.TradeReducer.current_symbol.trading_unit);

  let order_list = [];
  let count = tickerList.length;
  for ( let i=0; i<tickerList.length; i++ )
  {
    let item = tickerList[i];
    let newItem = {
      id : count,
      market_status : item.market_status,
      filled_type : item.filled_type,
      time : item.time,
      price : item.price,
      volume : item.volume * trading_unit,
    }
    order_list.unshift ( newItem );
    count --;
  }

  useEffect(() => {

  }, []);

  return (
    <div className="list-wrap">
      {order_list.map((item) => (
        <div className="list" key={item.id}>
          {/* <div className="col center">{item.id}</div> */}
          <div className="col center">{common.get_market_status(item.market_status)}</div>
          <div className="col center">{common.convertTimeString(item.time.toString())}</div>
          <div className={classNames("col center", item.filled_type === 1  ? "BID" : "ASK")}>{common.pricisionFormat_Precision(item.price / 10000, 2)}</div>
          <div className={classNames("col amount", item.filled_type === 1  ? "BID" : "ASK")}>{common.pricisionFormat_Precision(item.volume, 0)}</div>          
        </div>
      ))}
    </div>
  );
};

export default TradeOrderlist;
