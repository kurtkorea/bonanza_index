import classNames from "classnames";
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import PageLayout from "../components/layout";
import LogList from "../components/trade/loglist";
import TradeOrderbook from "../components/trade/orderbook";
import TradeOrderform from "../components/trade/orderform";
import TradeOrderlist from "../components/trade/orderlist";
import TradePositionlist from "../components/trade/positionlist";
import Status from "../components/trade/status";
import "../components/trade/style.less";
import axios from "axios";
import StockChart from "../components/trade/stock/chart";
import TradeHeader from "../components/trade/stock/header";
import StockData from "../components/trade/stock/stockdata";
import common from "../common/index";
import StockChartProgram from "../components/trade/stock/chart_program";

import IndexCalcTable from "./index_calc";

const TradePage = () => {
	const dispatch = useDispatch();

	const { login, username } = useSelector((store) => store.UserReducer);
	const [chart_hide, set_chart_hide] = useState(false);
	const [tab_num, set_tab_num] = useState(1);

	useEffect(() => {

	}, []);	

	return useMemo(
		() => (
			<>
				<PageLayout>
					<div className="thbit-trade-section" data-layout="side-right">
						<div className="thbit-trade-main">
							<div className="thbit-wrapper">
								<div className="thbit-inner">
								<div style={{ display: "flex", width: "100%", padding: "5px" }}>
									<div style={{ flex: "0 0 100%", maxWidth: "100%" }}>
										{/* 왼쪽 70% 영역 - 여기에 원하는 컴포넌트나 내용을 넣으세요 */}
										<div style={{ height: "100%", background: "#f9fafb", borderRight: "1px solid #e9ecf1" }}>
											<IndexCalcTable />
										</div>
									</div>

									{/* <div style={{ flex: "0 0 50%", maxWidth: "50%", background: "#fff", marginLeft: "5px" }}>
										<div style={{ height: "100%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
										</div>
									</div> */}
								</div>
								</div>
							</div>
						</div>
					</div>
				</PageLayout>
			</>
		),
		[chart_hide, tab_num],
	);
};

export default TradePage;
