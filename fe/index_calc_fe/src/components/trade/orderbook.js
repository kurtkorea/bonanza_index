import axios from "axios";
import classNames from "classnames";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import common from "../../common";
import { throttle } from "lodash";
import Lang from "../lang";

const initState = {
  bids: [],
  asks: [],
};

let subscribeSocket;

const TradeOrderbook = () => {
  const symbol = useSelector((store) => store.OrderReducer.symbol);
  const [orderBookData, setOrderBookData] = useState(initState);

  // const updateWindowDimensions = () => {
  //   const newWidth = window.innerWidth;
  //   // setHeight(newHeight);
  //   console.log("updating Width");
  // };

  /* 스크롤변경 */
  // const docu = document.querySelector(".thbit-trade-container .container.on")?.className === "container orderbook on" ? true : false;
  const scrollRef = useRef();
  const [width, setWidth] = useState(window.innerWidth);
  const handleResize = throttle(() => {
    setWidth(window.innerWidth);
  }, 1500);
  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => {
      // cleanup
      window.removeEventListener("resize", handleResize);
    };
  }, []);
  useEffect(() => {
    scrollToBottom();
  }, [width, subscribeSocket]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };
  /* 스크롤변경 */

  const depth_time = useSelector((store) => store.TradeReducer.hotime);

  useEffect(() => {
    /* 오더북 */
    $(document).on("click", "[data-price-pick]", function (e) {
      var price = $(this).data("price-pick");
      $("input[data-price-put]").val(price);
    });
    $(".thbit-trade-price-list .list-ctr .sort").on("click", function (e) {
      var sort = $(this).data("sort");
      $(".thbit-trade-price-list").attr("data-sort", "sort-" + sort);
    });
    /* 오더북 */
    // $("#myElement").animate({ scrollTop: $("#myElement").prop("scrollHeight") }, 300);
  }, []);

  useEffect(() => {

    //requestBinanceOrderBook(symbol + override);
    // subscribeBinanceOrderBook(symbol + override);
    return () => subscribeSocket?.close();
  }, [symbol]);

  return (
    <>
      <div className="thbit-trade-price-list trade-orderbook on thbit-tooltip" data-sort="sort-orderbook">

        <div className="list-time">
          <strong> 호가시간 {common.convertTimeString(depth_time.toString())}</strong>
        </div>

        <div className="list-wrap list-header">
          <div className="list list-sell">
            <div className="col price">
              가격
            </div>
            <div className="col amount">
              수량
            </div>
          </div>
          <div className="list list-buy">
            <div className="col price">
            가격
            </div>
            <div className="col amount">
            수량
            </div>
          </div>
        </div>

        <div className="list-group list-sell" ref={scrollRef} id="myElement">
          <TradeOrderbookAsklist datalist={orderBookData.asks} />
        </div>
        <div className="list-sum">
          <TradeOrderbookTicker />
        </div>
        <div className="list-group list-buy" id="myElement2">
          <TradeOrderbookBidlist datalist={orderBookData.bids} />
        </div>

        <div className="list-comparison"></div>
      </div>
      {/* <TradeOrderlist /> */}
      {/* <TradeAsset /> */}
    </>
  );
};

const TradeOrderbookAsklist = () => {
  const askList = useSelector((store) => store.TradeReducer.askList);
  const price_precision = useSelector((store) => store.TradeReducer.price_precision);
  const max = Math.max(...askList.map((item) => parseFloat(item[1])));
  const tick_precision = useSelector((store) => store.TradeReducer.tick_precision);

  return (
    <div className="list-wrap asklist">
      {askList.map((item, index) => (
        <TradeOrderbookAskitem
          key={"ask" + index}
          price={item["price"] / 10000}
          volume={item["volume"]}
          remain={item["remain"]}
          max={max}
          price_precision={price_precision}
          tick_precision={tick_precision}
        />
      ))}
    </div>
  );
};

const TradeOrderbookAskitem = ({ price = "0", volume = "0", remain = "0", max = 0, price_precision = "2", tick_precision = "3" }) => {
  const dispatch = useDispatch();
  const onClickItem = useCallback(() => {
    dispatch({
      type: "order/price",
      payload: { data: common.pricisionFormat_Precision(price, 2) },
    });
  }, [price, price_precision, tick_precision]);

  const barStyle = { width: (parseFloat(volume) / max) * 100 + "%" };

  const trading_unit = useSelector((store) => store.TradeReducer.current_symbol.trading_unit);

  const diff = useSelector((store) => store.TradeReducer.diff);

  let str_price_clr = "col price sell-color";

  if ( diff < 0 )
  {
    str_price_clr = "col price sell-color";
  } else {
    str_price_clr = "col price buy-color";
  }

  let str_price = common.pricisionFormat_Precision(price, 2);
  return (
    <div className="list" onClick={onClickItem}>
      <div className="col price">{str_price}</div>
      <div className="col amount">{common.pricisionFormat_Precision(volume * trading_unit, 0)}</div>
      <i className="bar buy-bg" style={barStyle}></i>
    </div>
  );
};

const TradeOrderbookBidlist = () => {
  const bidList = useSelector((store) => store.TradeReducer.bidList);
  const price_precision = useSelector((store) => store.TradeReducer.price_precision);
  const max = Math.max(...bidList.map((item) => parseFloat(item[1])));
  const tick_precision = useSelector((store) => store.TradeReducer.tick_precision);

  return (
    <div className="list-wrap">
      {bidList.map((item, index) => (
        <TradeOrderbookBiditem
          key={"buy" + index}
          price={item["price"] / 10000}
          volume={item["volume"]}
          remain={item["remain"]}
          max={max}
          price_precision={price_precision}
          tick_precision={tick_precision}
        />
      ))}
    </div>
  );
};

const TradeOrderbookBiditem = ({ price = "0", volume = "0", remain = "0", max = 0, price_precision = "2", tick_precision = "3" }) => {

  const dispatch = useDispatch();
  const onClickItem = useCallback(() => {
    dispatch({
      type: "order/price",
      payload: { data: common.pricisionFormat_Precision(price, 2) },
    });
  }, [price, price_precision]);

  const diff = useSelector((store) => store.TradeReducer.diff);

  const trading_unit = useSelector((store) => store.TradeReducer.current_symbol.trading_unit);

  let str_price_clr = "col price buy-color";

  if ( diff < 0 )
  {
    str_price_clr = "col price sell-color";
  } else {
    str_price_clr = "col price buy-color";
  }

  let str_price = common.pricisionFormat_Precision(price, 2);

  const barStyle = { width: (parseFloat(volume) / max) * 100 + "%" };
  return (
    <div className="list" onClick={onClickItem}>
      <div className="col price">{str_price}</div>
      <div className="col amount">{common.pricisionFormat_Precision(volume * trading_unit, 0)}</div>
      <i className="bar buy-bg" style={barStyle}></i>
    </div>
  );
};

const TradeOrderbookTicker = () => {
  const dispatch = useDispatch();
  const close = useSelector((store) => store.TradeReducer.close);
  const volume_sum = useSelector((store) => store.TradeReducer.volume_sum);
  const depth_time = useSelector((store) => store.TradeReducer.hotime);
  const color = common.judgeChangeVariable("change_symbol", ["buy-color", "", "sell-color"]);

  const trading_unit = useSelector((store) => store.TradeReducer.current_symbol.trading_unit);

  const onClickItem = useCallback(() => {
    dispatch({
      type: "order/price",
      payload: { data: common.pricisionFormat_Precision(close / 10000, 2) },
    });
  }, [close]);

  return (
    <div onClick={onClickItem}>
      <strong className={classNames("contract", color)}>현재가 : {common.pricisionFormat_Precision(close / 10000, 2)}</strong>
      {/* <strong className={classNames("contract", color)}>총거래량 : {common.pricisionFormat_Precision(volume_sum * trading_unit, 0)}</strong> */}
      {/* <strong className={classNames("contract", color)}>{common.pricisionFormat_Precision(volume_sum, 0)}</strong> */}
      {/* <strong className={classNames("contract", color)}>{common.convertTimeString(depth_time.toString())}</strong> */}
      {/* <span className={classNames("market", color)}>{common.judgeChangeChar(change_symbol) + " " + common.pricisionFormat_Precision(change, price_precision)}</span> */}
      {/* <a className="more">More</a> */}
    </div>
  );
};

export default TradeOrderbook;
