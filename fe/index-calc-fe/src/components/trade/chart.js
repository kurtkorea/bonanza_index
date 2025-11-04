import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import common, { pricisionFormat_Precision } from "../../common";
import { isNull, isUndefined } from "lodash";
import moment from "moment";

const config = {
	supported_resolutions: ["1", "5", "15", "30", "60", "1D"],
};

let tvWidget;
let lastBar = {};
let resolution = "1";
let prev_resolution = "";
let ticks = [];

let resolutionMinute = 1;
let onRealtimeCallback = null;

const TradeChart = () => {
	const lang = useSelector((store) => store.UserReducer.lang);

	const symbol = useSelector((store) => store.OrderReducer.symbol);
	const symbol_name = useSelector((store) => store.OrderReducer.symbol_name);
	const theme = useSelector((store) => store.OrderReducer.theme);
	const stockList = useSelector((store) => store.TradeReducer.stockList);
	const findSymbolData = stockList?.find((item) => item.symbol == symbol);
	const positionList = useSelector((store) => store.PositionReducer.positionList);

	const username = useSelector((store) => store.UserReducer.username);

	const [ready, setReady] = useState(false);

	const dispatch = useDispatch();
	
	const [prev_symbol, set_prev_symbol] = useState("");
	const [is_refresh, set_is_refresh] = useState(false);

	useEffect(() => {	

		if ( symbol !== prev_symbol)
		{
			ticks = [];
			chartRender(theme, symbol);
		}

		set_prev_symbol ( symbol );		
		
	}, [symbol, is_refresh, theme]);

	useEffect(() => {

		$("[data-theme]").on("click", function (e) {			
			var th = $(this).data("theme");
			$("body").toggleClass(th);
			var bodyClass = $("body").attr("class");
			$.cookie("tradeTheme", bodyClass, "/");
			$(".thbit-range-slider").each(function (e) {
				rangeSlider($(this));
			});
			if (th == "trading-theme-dark") {
				if ($("body").hasClass("trading-theme-dark")) {
					if (typeof changeFX === "function") changeFX("dark");
					if ($('meta[name="theme-color"]').length > 0 && $("div").hasClass("thbit-main-slide"))
						document.querySelector('meta[name="theme-color"]').setAttribute("content", "#1a1f2c");
					else if ($('meta[name="theme-color"]').length > 0 && !$("div").hasClass("thbit-main-slide"))
						document.querySelector('meta[name="theme-color"]').setAttribute("content", "#1a1f2c");
					$("[data-theme]").find(".material-symbols-rounded").text("dark_mode");
					chartRender("Light", symbol);	
				} else {
					if (typeof changeFX === "function") changeFX("light");
					if ($('meta[name="theme-color"]').length > 0 && $("div").hasClass("thbit-main-slide"))
						document.querySelector('meta[name="theme-color"]').setAttribute("content", "#fff");
					else if ($('meta[name="theme-color"]').length > 0 && !$("div").hasClass("thbit-main-slide"))
						document.querySelector('meta[name="theme-color"]').setAttribute("content", "#fff");
					$("[data-theme]").find(".material-symbols-rounded").text("light_mode");
					chartRender("Dark", symbol);				
					$("body").removeClass("trading-theme-dark");
				}
			}
		});		

	}, []);



	const checkConnect = (success) => {

		tvWidget.onChartReady(() => {

			const chart = tvWidget.chart();
			chart.createStudy(
				"MA Cross", // Indicator's name
				true,              // forceOverlay
				false,             // lock
				{
				  in_0: 5,        // length
				  in_1: 20,         // 'mult' indicator setting
				}
			  );						  				  			  

			// if (sessionStorage.getItem("symbol")) {
			// 	console.log("checkConnect", sessionStorage.getItem("symbol"));
			// 	let localChartData = localStorage.getItem(`${sessionStorage.getItem("symbol")}-chart-thebit`);
			// 	if (localChartData) {
			// 		tvWidget.load(JSON.parse(localChartData));
			// 	}
			// }
			
		// 	tvWidget.subscribe("onAutoSaveNeeded", (data) =>
		// 		tvWidget.save((data) => {

		// 			console.log ( "data", data );

		// 			let saveSymbol = data.charts?.[0]?.panes?.[0].sources?.[0]?.state?.symbol ?? "";
		// 			data.charts.map((item) => {
		// 				delete item.chartProperties.paneProperties.background;
		// 				delete item.chartProperties.scalesProperties.textColor;
		// 				delete item.chartProperties.paneProperties.vertGridProperties.color;
		// 				delete item.chartProperties.paneProperties.horzGridProperties.color;
		// 			});
		// 			if (saveSymbol !== "") {
		// 				localStorage.setItem(`${saveSymbol}-chart-thebit`, JSON.stringify(data));
		// 			}
		// 		}),
		// 	);
		});	

		prev_resolution = "";
		ticks = [];
		console.log ( "CLEAR BAR with checkConnect" );

		success(config);
	};

	async function get_data_feed( symbol, chart_type, duration ) {
		let bars = [];

		let view_symbol = symbol;

		if ( view_symbol == "" )
		{
			view_symbol = localStorage.getItem("saved-symbol");
		} else {
			localStorage.setItem("saved-symbol", view_symbol);
		}
		const { data } = await axios.get("/mts/get_chart", {
			params: {
				symbol: view_symbol.toUpperCase(),
				type: chart_type,
				tick: duration,
				media: "M",
				id: username,
			},
		});

		if (data.result) {

			ticks = [];
			bars = data.datalist.map((item) => {
				return {
					timeestr : item.time,
					time: item.timestamp,
					open: item.open,
					high: item.high,
					low : item.low,
					close: item.close,
					volume: item.volume,
				};
			});
		} else {
			message.error("챠트데이터 불러오기 실패");
		}
		return bars;
	}

	const datafeed = () => ({
		onReady: (callback) => {
			setTimeout(() => { checkConnect(callback); }, 0);
		}
		,
		searchSymbols: (userInput, exchange, symbolType, onResultReadyCallback) => {},
		resolveSymbol: (symbolName, onSymbolResolvedCallback, onResolveErrorCallback) => {
			setTimeout(() => {				
				let price_precision = findSymbolData == null ? 4 : findSymbolData.price_precision;
				onSymbolResolvedCallback({
					exchange: "",
					symbol: symbol,
					name: symbol_name,
					ticker: symbolName,
					description: symbolName,
					type: "해외선물",
					session: "24x7",
					pricescale: Math.pow(10, price_precision),
					timezone: "Asia/Seoul",
					supported_resolution: config.supported_resolutions,
					volume_precision: 1,
					data_status: "streaming",
					minmov: 1,
					has_intraday: true,
				});				
			}, 0);
		},
	
		getBars: async (symbolInfo, resolutionInfo, periodParams, onHistoryCallback, onErrorCallback) => {
			resolution = resolutionInfo;
			let chart_type = "day";
			let duration = "2";
			switch (resolutionInfo) {
				case "1":
					resolutionMinute = 1;
					chart_type = "min";
					duration = "1";
					break;
				case "5":
					resolutionMinute = 5;
					chart_type = "min";
					duration = "5";
					break;
				case "10":
					resolutionMinute = 10;
					chart_type = "min";
					duration = "10";
					break;
				case "15":
					resolutionMinute = 15;
					chart_type = "min";
					duration = "15";
					break;
				case "30":
					resolutionMinute = 30;
					chart_type = "min";
					duration = "30";
					break;
				case "60":
					resolutionMinute = 60;
					chart_type = "min";
					duration = "60";
					break;
				case "1D":
					chart_type = "day";
					duration = "2";
					break;
			}

			if ( prev_resolution != "" && prev_resolution != resolution )
			{
				prev_resolution = "";
				ticks = [];
				console.log ( "CLEAR BAR <>" );
				//onHistoryCallback([]);
			}
			
			if ( ticks.length == 0 )
			{			
				try {
					ticks = await get_data_feed( symbolInfo.symbol, chart_type, duration );
					if ( ticks != null )
					{
						if ( ticks.length > 0 )
						{
							setTimeout(() => { 
								setReady(true);							
								onHistoryCallback(ticks);		
								prev_resolution = resolution;
								lastBar = ticks[ticks.length - 1];
							 }, 0);
						} else {
							onHistoryCallback([], {
								noData: true,
							});
							return;
						}
					} else {
						return;
					}
				} catch (error) {
					console.log('[getBars]: Get error', error);
					onErrorCallback(error);
				}
			} else {
				onHistoryCallback([], {
					noData: true,
				});
				return;
			}		
		},

		subscribeBars: (symbolInfo, resolution, onRealtimeCallbackF, subscriberUID, onResetCacheNeededCallback) => {

			onRealtimeCallback = onRealtimeCallbackF;
			onResetCacheNeededCallback();
			if (window.websocketWorker) {
				window.websocketWorker.addEventListener("message", receiveTickerData);	
			}
			
		},
		unsubscribeBars: (subscriberUID) => {
			if (window.websocketWorker) {				
				window.websocketWorker.removeEventListener("message", receiveTickerData);
			}
		},
	});

	const receiveTickerData = ({ data: { type, data } }) => {
		if (type === "ticker") {	

			if ( symbol.trim() !== data.symbol.trim() )
			{
				return;
			}

			const lastChartBar = lastBar;
			const processPrice = data.ticker.price;

			if ( processPrice > 0.0 )
			if (ticks.length > 0 && lastChartBar != null && lastChartBar.time < data.ticker.timestamp) 
			{
				if (resolution === "1D") 
				{
					if (moment(lastChartBar.time).format("YYYYMMDD") === moment(data.ticker.timestamp).format("YYYYMMDD")) {
						lastChartBar.close = processPrice;
						lastChartBar.high = lastChartBar.high < processPrice ? processPrice : lastChartBar.high;
						lastChartBar.low = lastChartBar.low > processPrice ? processPrice : lastChartBar.low;
						lastChartBar.volume += data.ticker.cvolume;
						onRealtimeCallback({
							time: data.ticker.timestamp,
							open: lastChartBar.open,
							close: lastChartBar.close,
							high: lastChartBar.high,
							low: lastChartBar.low,
							volume: lastChartBar.volume,
						});
					} else {
						const newLastBar = {
							open: lastChartBar.close,
							close: processPrice,
							high: processPrice,
							low: processPrice,
							volume: 0,
							time: data.ticker.timestamp,
						};
						lastBar = newLastBar;
						onRealtimeCallback(newLastBar);
					}
				} else if (resolution === "60") {
					if (moment(lastChartBar.time).hour() === moment(data.ticker.timestamp).hour()) {
						lastChartBar.close = processPrice;
						lastChartBar.high = lastChartBar.high < processPrice ? processPrice : lastChartBar.high;
						lastChartBar.low = lastChartBar.low > processPrice ? processPrice : lastChartBar.low;
						lastChartBar.volume += data.ticker.cvolume;
						onRealtimeCallback({
							time: lastChartBar.time,
							open: lastChartBar.open,
							close: lastChartBar.close,
							high: lastChartBar.high,
							low: lastChartBar.low,
							volume: lastChartBar.volume,
						});
					} else {
						const newLastBar = {
							open: lastChartBar.close,
							close: processPrice,
							high: processPrice,
							low: processPrice,
							volume: 0,
							time: moment(data.ticker.timestamp).second(0).valueOf(),
						};
						lastBar = newLastBar;
						onRealtimeCallback(newLastBar);
					}
				} else {

					if (parseInt(moment(lastChartBar.time).minute() / resolutionMinute) === parseInt(moment(data.ticker.timestamp).minute() / resolutionMinute)) 
					{
						lastChartBar.close = processPrice;
						lastChartBar.high = lastChartBar.high < processPrice ? processPrice : lastChartBar.high;
						lastChartBar.low = lastChartBar.low > processPrice ? processPrice : lastChartBar.low;
						lastChartBar.volume += data.ticker.cvolume;
						onRealtimeCallback({
							time: lastChartBar.time,
							open: lastChartBar.open,
							close: lastChartBar.close,
							high: lastChartBar.high,
							low: lastChartBar.low,
							volume: lastChartBar.volume,
						});
					} else {
						const newLastBar = {
							open: lastChartBar.close,
							close: processPrice,
							high: processPrice,
							low: processPrice,
							volume: 0,
							time: moment(data.ticker.timestamp).second(0).valueOf(),
						};
						lastBar = newLastBar;
						onRealtimeCallback(newLastBar);
					}
				}
			}
		}
	};

	// useEffect(() => {
	// 	if (symbol !== "" && tvWidget._ready) {
	// 		sessionStorage.setItem("symbol", symbol);
	// 		tvWidget?.setSymbol(active_symbol, resolution);
	// 	}
	// }, [active_symbol]);

	useEffect(() => {
		if (ready && tvWidget._ready) {
			const chart = tvWidget?.activeChart();
			if (chart) {
				chart?.getAllShapes().forEach(({ id, name }) => {
					if (name === "horizontal_line") {
						chart?.removeEntity(id);
					}
				});
				positionList
					.filter((item) => item.symbol === symbol)
					.forEach((item) => {
						const colorStr = common.randColor(item.price);
						chart?.createShape(
							{ time: 0, price: parseFloat(parseFloat(item.price).toFixed(findSymbolData?.price_precision ?? 2)) },
							{
								shape: "horizontal_line",
								text: "평균가",
								font: 9,
								disableSave: true,
								disableSelection: true,								
								overrides: {
									showLabel: true,
									linecolor: theme == "Light" ? "#282e33" : "#ffd700",
									textcolor: theme == "Light" ? "#282e33" : "#ffd700",
								},
							},
						);
						if (item.earncut_price !== "0") {
							chart?.createShape(
								{ time: 0, price: parseFloat(parseFloat(item.earncut_price).toFixed(findSymbolData?.price_precision ?? 2)) },
								{
									shape: "horizontal_line",
									text: "익절",
									font: 9,
									disableSave: true,
									disableSelection: true,
									overrides: {
										showLabel: true,
										linecolor: theme == "Light" ? "#dc143c" : "#dc143c",
										textcolor: theme == "Light" ? "#dc143c" : "#dc143c",
									},
								},
							);
						}
						if (item.losscut_price !== "0") {
							chart?.createShape(
								{ time: 0, price: parseFloat(parseFloat(item.losscut_price).toFixed(findSymbolData?.price_precision ?? 2)) },
								{
									shape: "horizontal_line",
									text: "손절",
									font: 9,
									disableSave: true,
									disableSelection: true,
									overrides: {
										showLabel: true,
										linecolor: theme == "Light" ? "#1e9044" : "#1e9044",
										textcolor: theme == "Light" ? "#1e9044" : "#1e9044",
									},
								},
							);
						}
					});
			}
		}
	}, [positionList, ready]);

	useEffect(() => {
		// document.addEventListener("visibilitychange", visibleChange);
		// return () => {
		// 	document.removeEventListener("visibilitychange", visibleChange);
		// };
	}, []);

	const visibleChange = (event) => {
		let en_lang = lang === 1 ? "ko" : "en";
		if (document.visibilityState === "hidden") 
		{
			setReady(false);
		} else if (document.visibilityState === "visible") 
		{
			let current_symbol = localStorage.getItem("store_symbol");
			if ( common.isEmpty(current_symbol) )
			{
				current_symbol = findSymbolData.symbol;
			}
			ticks = [];
			chartRender(theme, current_symbol);
		}
	};

	const chartRender = (th, current_symbol) => {

		localStorage.setItem("tradingview.current_theme.name", theme);
		// localStorage.removeItem("tradingview.chartproperties.mainSeriesProperties");
		// localStorage.removeItem("tradingview.chartproperties");

		const widgetOptions = {
			symbol: current_symbol,
			interval: "1",
			container: "tradingview_thbit",
			library_path: "/charting_library/",
			fullscreen: false,
			autosize: true,			
			timezone: "Asia/Seoul",
			locale: "ko",
			theme: th,
			// enabled_features: [""],
			disabled_features: [
				"header_symbol_search",
				"symbol_search_hot_key",
				"symbol_info",
				"compare_symbol",
				"timeframes_toolbar",
				"display_market_status",
				"control_bar",
				"edit_buttons_in_legend",
				"left_toolbar",
				"volume_force_overlay",
			],
			// "disabled_features": ["use_localstorage_for_settings", create_volume_indicator_by_default"],
			time_frames: [{ text: "50d", resolution: "1D", description: "50일 데이터", title: "50Day" }],

			studies_overrides: {
				"volume.volume.color.0": "#089981",
				"volume.volume.color.1": "#f7525f",
				"volume.volume.transparency": 30,
				"volume.volume ma.color": "#FF0000",
				"volume.volume ma.transparency": 30,
				"volume.volume ma.linewidth": 5,
				// "volume.show ma": true,
			},
			"studies": [
				{
				  "id": "MAExp@tv-basicstudies",
				  "version": 60,
				  "inputs": {
					"length": 20
				  }
				},
			],			

			overrides: get_overridesData(th),
			datafeed: datafeed(),
		};
		tvWidget = new TradingView.widget(widgetOptions);
		tvWidget.headerReady().then(function () {
			var button = tvWidget.createButton();
			button.setAttribute("title", "챠트다시불러오기");
			button.addEventListener("click", function () {
				let current_symbol = localStorage.getItem("store_symbol");
				chartRender(theme, current_symbol);
			});
			button.innerHTML =
				'<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><g fill="none" fill-rule="evenodd" stroke="currentColor"><path d="M6.5 15A8.5 8.5 0 1 0 15 6.5H8.5"></path><path d="M12 10L8.5 6.5 12 3"></path></g></svg>';
		});
	};

	return (
		<div className="thbit-trade-chart-wrapper">
			<div id="tradingview_thbit" className="thbit-trade-chart"></div>
		</div>
	);
};



const get_overridesData = ( th ) => {

	console.log ( "테마", th );

	localStorage.setItem( "save-theme", th );

	return {
		"paneProperties.topMargin": 5,
		"paneProperties.bottomMargin": 2,
		// "timeScale.rightOffset": 1,
		volumePaneSize: "medium",
		"mainSeriesProperties.candleStyle.barColorsOnPrevClose": true,
		"mainSeriesProperties.columnStyle.downColor" : "red",
		"mainSeriesProperties.candleStyle.borderColor": "#666666",
		"mainSeriesProperties.candleStyle.borderDownColor": "#089981",
		"mainSeriesProperties.candleStyle.downColor": "#089981",
		"mainSeriesProperties.candleStyle.borderUpColor": "#f7525f",
		"mainSeriesProperties.candleStyle.upColor": "#f7525f",		
		"mainSeriesProperties.candleStyle.drawBorder": true,
		"mainSeriesProperties.candleStyle.drawWick": true,		
		"mainSeriesProperties.candleStyle.wickColor": "#737375",
		"mainSeriesProperties.candleStyle.wickDownColor": "#089981",
		"mainSeriesProperties.candleStyle.wickUpColor": "#f7525f",
		"paneProperties.legendProperties.showStudyArguments": true,
		"paneProperties.legendProperties.showStudyTitles": true,
		"paneProperties.legendProperties.showStudyValues": true,
		"paneProperties.legendProperties.showSeriesTitle": true,
		"paneProperties.legendProperties.showSeriesOHLC": true,
		"paneProperties.legendProperties.showLegend": true,

		"scalesProperties.textColor": th == "Light" ? "#131722" : "#ffffff",
		"paneProperties.background": th == "Light" ? "#ffffff" : "#161A25",
		
		"paneProperties.vertGridProperties.color": th == "Light" ? "rgba(42, 46, 57, 0.06)" : "#1c202a",
		"paneProperties.horzGridProperties.color": th == "Light" ? "rgba(42, 46, 57, 0.06)" : "#1c202a",
	};
}


export default TradeChart;
