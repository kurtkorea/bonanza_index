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
import IndexCalcTableOptimized from "./index_calc_optimized_example";

const TradePage = () => {
	const dispatch = useDispatch();

	const { login, username } = useSelector((store) => store.UserReducer);
	const [chart_hide, set_chart_hide] = useState(false);
	const [tab_num, set_tab_num] = useState(1);

	let  program_chart_data = [];

	const [program_chart_data_1636, set_program_chart_data_1636] = useState([]);


	// useEffect(() => {
	// 	const fetchData = async () => {
	// 		try {
	// 			const data = await get_program_chart("005930");
	// 			// console.log(data);
	// 			if (data) {
	// 				dispatch({ type: 'trade/program_chart_data', payload: data });
	// 			}
	// 		} catch (error) {
	// 			console.error("프로그램 차트 데이터 가져오기 실패:", error);
	// 		}
	// 	};
	// 	fetchData();
	// }, [program_chart_data]);

	const get_program_chart = async (symbol) => {
		try {
			const { data } = await axios.post( process.env.SERVICE + "/service/get_open_api", {
				"path" : "/stock/program",
				"tr_cd" : "t1637",
				"input_data" : {
					"t1637InBlock" : {
						"gubun1" : "1",
						"gubun2" : "0",
						"shcode" : symbol,
						"date" : common.get_today(),
						"cts_idx" : 9999,
						"exchgubun" : "K"
			
					}
				}
			});
			
			let program_chart_data_arr = [];
			if ( data?.response?.rsp_cd == "00000" )
			{
				data?.response?.t1637OutBlock1?.forEach(item => {
					const symbol = item?.shcode;
					program_chart_data_arr.push({
						time: item?.time,
						price: item?.price,
						[symbol] : item?.svalue
					});
				});
				return program_chart_data_arr;
			} else {
				console.error("API 응답 오류:", data?.response?.rsp_msg);
				return null;
			}
		} catch (error) {
			console.error("API 요청 실패:", error);
			return null;
		}
	}	  

	const get_chart_data_1636 = async () => {
		const { data } = await axios.get(process.env.SERVICE + "/service/get_chart", {
			params: {
				interval: 60,
				date: '20250624',
			},
		});
		console.log("data", data);
		dispatch({
			type: "trade/program_chart_data_1636_ksp",
			payload: data,
		});		
		return data;		
	}

	useEffect(() => {
		// get_chart_data_1636();
	}, []);	

	return useMemo(
		() => (
			<>
				<PageLayout>
					<div className="thbit-trade-section" data-layout="side-right">
						<div className="thbit-trade-main">
							<div className="thbit-wrapper">
								<div className="thbit-inner">
								<div style={{ display: "flex", width: "100%", height: "900px", padding: "5px" }}>
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
