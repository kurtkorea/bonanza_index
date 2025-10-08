import React, { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { debounce } from "throttle-debounce";

// const favoriteStoreKey = "favorite-coin-list";
const debounceSetSearch = debounce(300, (value, setter) => setter(value)); // 300 숫자 조절로 검색 딜레이 수정가능 입력 종료-> 검색 시작까지 딜레이임
// const storeFavorite = localStorage.getItem(favoriteStoreKey)?.split(",");

const TradeCoinlist = () => {
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState("");

	const onChangeSearch = ({ currentTarget: { value } }) => {
		setSearch(value);
		debounceSetSearch(value, setFilter);
	};

	useEffect(() => {
		$(".thbit-trade-header .item-name").on("click", function (e) {
			if ($(".thbit-trade-header .coin-lists").is(":visible")) {
				$(".thbit-trade-header .coin-lists").slideUp(0);
				$(".thbit-trade-header .item-name > i").css("transform", "scaleY(1)");
			} else {
				$(".thbit-trade-header .coin-lists").slideDown(0);
				$(".thbit-trade-header .item-name > i").css("transform", "scaleY(-1)");
			}
		});
		$(".thbit-trade-header .coin-lists").mouseleave(function () {
			$(".thbit-trade-header .coin-lists").slideUp();
			$(".thbit-trade-header .item-name > i").css("transform", "scaleY(1)");
		});
		$(".thbit-trade-header .expand").on("click", function (e) {
			$(".thbit-trade-header").toggleClass("expand");
		});
	}, []);

	const closeList = () => {
		$(".thbit-trade-section").removeClass("coin-list-open");
		$("body").removeClass("no-overflow");
	};

	return (
		<div className="thbit-trade-price-list coin-list">
			<div className="thbit-trade-form">
				<div className="form-row on">
					<div className="form-fld has-label has-btn">
						<input name="price" id="price" placeholder="종목검색" autoComplete="off" className="inp" value={search} onChange={onChangeSearch} />
					</div>
				</div>
			</div>
			<div className="thbit-line-tab">
				<a className="tab on" data-tab-group="coinlist" data-tab-id="twse">
					TWSE
				</a>
				<a className="tab off" data-tab-group="coinlist" data-tab-id="tpex">
					TPEX
				</a>
			</div>
			<div className="list-wrap list-header on" data-tab-group="coinlist" data-tab-id="twse">
				<div className="list">
					<div className="col symbol">종목코드</div>
					<div className="col kor_name_col">종목명</div>
				</div>
			</div>
			<div className="list-wrap list-header" data-tab-group="coinlist" data-tab-id="tpex">
				<div className="list">
					<div className="col symbol">종목코드</div>
					<div className="col kor_name_col">종목명</div>
				</div>
			</div>
			<div className="list-group on" data-simplebar data-tab-group="coinlist" data-tab-id="twse">
				<TradeCoinlistTWSE closeList={closeList} filter={filter} />
			</div>
			<div className="list-group" data-simplebar data-tab-group="coinlist" data-tab-id="tpex">
				<TradeCoinlistTPEX closeList={closeList} filter={filter} />
			</div>
		</div>
	);
};

const TradeCoinlistTWSE = ({ closeList, filter }) => {
	const stockList = useSelector((store) => store.TradeReducer.stockList);
	return (
		<div className="list-wrap">
			{stockList?.filter((item) => item.market === 0 && (item.symbol.includes(filter) || item.kor_name.includes(filter) || item.eng_name.includes(filter)))
				.map((item) => (
					<TradeTWSEItem key={item.symbol} symbol={item.symbol} kor_name={item.kor_name} eng_name={item.eng_name} close={closeList} />
				))}
		</div>
	);
};

const TradeTWSEItem = ({ symbol, kor_name, eng_name, close }) => {
	const dispatch = useDispatch();

	const onClickItem = useCallback(() => {
		// dispatch({ type: 'order/change', payload: { name: 'amount', value: '' } });
		dispatch({
			type: "order/symbol",
			payload: {
				symbol: symbol,
				symbol_name: kor_name,
				style: "TradeTWSEItem",
			},
		});
		dispatch({
			type: "trade/current_symbol",
			payload: symbol,
		});
		close();
	}, []);

	return (
		<div className="list" key={symbol} onClick={onClickItem}>
			<div className="col symbol">{symbol}</div>
			<div className="col kor_name">{kor_name}</div>
			{/* <div className="col eng_name">{eng_name}</div>			 */}
		</div>
	);
};

const TradeCoinlistTPEX = ({ closeList, filter }) => {
	const stockList = useSelector((store) => store.TradeReducer.stockList);
	return (
		<div className="list-wrap">
			{stockList?.filter((item) => item.market === 1 && (item.symbol.includes(filter) || item.kor_name.includes(filter) || item.eng_name.includes(filter)))
				.map((item) => (
					<TradeTPEXItem key={item.symbol} symbol={item.symbol} kor_name={item.kor_name} eng_name={item.eng_name} close={closeList} />
				))}
		</div>
	);
};

const TradeTPEXItem = ({ symbol, kor_name, eng_name, close }) => {
	const dispatch = useDispatch();

	const onClickItem = useCallback(() => {
		// dispatch({ type: 'order/change', payload: { name: 'amount', value: '' } });
		dispatch({
			type: "order/symbol",
			payload: {
				symbol: symbol,
				symbol_name: kor_name,
				style: "TradeTWSEItem",
			},
		});
		dispatch({
			type: "trade/current_symbol",
			payload: symbol,
		});
		close();
	}, []);

	return (
		<div className="list" key={symbol} onClick={onClickItem}>
			<div className="col symbol">{symbol}</div>
			<div className="col kor_name">{kor_name}</div>
			{/* <div className="col eng_name">{eng_name}</div>			 */}
		</div>
	);
};

export default TradeCoinlist;
