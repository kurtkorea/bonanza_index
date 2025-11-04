import classNames from "classnames";
import React, { useCallback, useState } from "react";
import OrderTable from "./order";
import PositionTable from "./position";
import ProfitTable from "./profit";
import RequestTable from "./request";
import TradeTable from "./trade";
import Lang from "../../lang";

const TradePositionlist = () => {
  const [tab, setTab] = useState("position");

  const onClickTab = useCallback(({ currentTarget }) => {
    const clickTab = currentTarget.getAttribute("data");
    setTab(clickTab);
  }, []);

  return (
    <div className="thbit-trade-list">
      <div className="thbit-index-tab">
        <a className={classNames("tab", { on: tab === "position" })} data="position" onClick={onClickTab} data-tab-group="list" data-tab-id="position">
        보유포지션
        </a>
        <a className={classNames("tab", { on: tab === "order" })} data="order" onClick={onClickTab} data-tab-group="list" data-tab-id="nodeal">
        미체결
        </a>
        <a className={classNames("tab", { on: tab === "trade" })} data="trade" onClick={onClickTab} data-tab-group="list" data-tab-id="trade">
        거래내역
        </a>
        {/* <a className={classNames("tab", { on: tab === "profit" })} data="profit" onClick={onClickTab} data-tab-group="list" data-tab-id="margin">
        손익
        </a> */}
      </div>
      <div className="thbit-trade-table-wrapper on">
        {tab === "position" && <PositionTable />}
        {tab === "order" && <OrderTable />}
        {tab === "trade" && <TradeTable />}
        {/* {tab === "profit" && <ProfitTable />} */}
      </div>
    </div>
  );
};

export default TradePositionlist;
