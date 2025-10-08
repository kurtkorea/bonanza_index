import { Divider, message, Modal, Popconfirm, Switch } from "antd";
import axios from "axios";
import classNames from "classnames";
import React, { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import common from "../../../common";
import { isUndefined } from "lodash";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from 'react-query';

const PositionTable = () => {
  
	const [stoploss_symbol, set_stoploss_symbol] = useState("");
	const [settleKey, setSettleKey] = useState("0");

	const closeStoploss = useCallback(() => set_stoploss_symbol(""), []);

	const closeSettle = useCallback(() => setSettleKey("0"), []);

  const navigate = useNavigate();

  const dispatch = useDispatch();
  
  const { username, login } = useSelector(store => store.UserReducer);
  const OrderData = useSelector(
    ({
      UserReducer: { login, username, account, },
      OrderReducer: {
        price,
        symbol,
      },
      TradeReducer: { close, stockList },
    }) => ({
      login, 
      username,
      price,
      symbol,
      close,
      stockList,
      account,
    })
  );

  useEffect(() => {
		document.addEventListener("visibilitychange", visibleChange);
		return () => {
			document.removeEventListener("visibilitychange", visibleChange);
		};
	}, []);

  useEffect(() => {

	}, []);

  // const { data } = useQuery(
  //   [
  //     'query/position',
  //   ],
  //   async () => {
  //     const { data } = await axios.get("/order/v1/position_orders?account=" + OrderData.account );
  //     dispatch({
  //       type: "positionList/init",
  //       payload: data.datalist,
  //     })      
  //     return data;
  //   },
  //   { staleTime: 3000, cacheTime: 3000, enabled: true, refetchOnMount: false, placeholderData: { datalist: [] } }
  // );


  const visibleChange = (event) => {
		if (document.visibilityState === "visible") 
		{
      const store_symbol = localStorage.getItem("store_symbol");
      const store_name = localStorage.getItem("store_name");
      if ( !common.isEmpty(store_symbol) && !common.isEmpty(store_name) )
      {
        dispatch({ type: "order/symbol", payload: { symbol: store_symbol, symbol_name: store_name , style: "Position.visibleChange" } });
      } else {
        const findStockItem = OrderData.stockList[0];
        dispatch({ type: "order/symbol", payload: { symbol: findStockItem.symbol, symbol_name: findStockItem.symbol_name , style: "Position.visibleChange" } });
      }
      dispatch({ type: "position/refresh", payload: { account: account } });

		} else {
      //시간을 저장한다. ==> 1분 이상 되면 로그인창으로 포워딩하자
      
    }
	};

	return (
		<>
			<Modal
				className="custom-modal"
				closable={false}
				footer={null}
				centered
				onOk={closeStoploss}
				onCancel={closeStoploss}
				open={stoploss_symbol !== ""}
				destroyOnClose={true}
				width={330}
			>
			  <PositionStoplossModal closeStoploss={closeStoploss} stoploss_symbol={stoploss_symbol} />      
			</Modal>

			<Modal
				className="custom-modal"
				closable={false}
				footer={null}
				destroyOnClose={true}
				centered
				onOk={closeSettle}
				onCancel={closeSettle}
				open={settleKey !== "0"}
				width={360}
			>
			<PositionClearModel closeSettle={closeSettle} settleKey={settleKey} />
			</Modal>
			{/* <SettleModal settleKey={settleKey} closeSettle={closeSettle} /> */}
      <TradeTableSearchbar />
			<div className="thbit-trade-table-container" data-simplebar>
				<table className="thbit-trade-table">
					<thead className="sticky head">
						<tr className="notranslate">
            <th className="align-c">
								BrokerID
							</th>
							<th className="align-c">
								계좌번호
							</th>                            
							<th className="align-c">
								종목코드
							</th>
							<th className="align-c">
								종목명
							</th>              
							{/* <th className="align-c">
								구분
							</th> */}
							{/* <th className="align-r">
								현재가
							</th>               */}
							<th className="align-r">
								평균가
							</th>
							<th className="align-r">
								잔고수량
							</th>
							<th className="align-r">
								매도가능수량
							</th>              
							{/* <th className="align-r">
								손익
							</th> */}
							<th className="align-c">
								생성시간
							</th>              
							<th className="align-c">
								갱신시간
							</th>                            
							{/* <th className="sticky col-right">
								<PositionTableSettleAll/>
							</th>
							<th className="align-c">
								스탑로스
							</th>               */}
						</tr>
					</thead>
					<tbody>
						<PositionTableBody set_stoploss_symbol={set_stoploss_symbol} setSettleKey={setSettleKey} />
					</tbody>
				</table>
			</div>
		</>
	);
};

const TradeTableSearchbar = () => {
  const queryClient = useQueryClient();
  const onClickSearch = () => {
    // queryClient.invalidateQueries('query/position');    
  };
  return (
    <div className="thbit-trade-inlineform antd-style">
      <button type="button" className="btn" onClick={onClickSearch}>
      조회
      </button>
    </div>
  );
};

export const PositionTableSettleAll = (symbol) => {
  const { login, username } = useSelector((store) => store.UserReducer);  
  const onSubmitSettleAll = useCallback(async () => {
    if (login) {
      try {
        const { data } = await axios.post("/hts/clear_order", {
          id: username,
          actor: common.getActor(),
          symbol : "ALL",
        });
    
        message.success(data.message);
      } catch (error) {
        console.log(error.name, error.message);
        message.warn("애러발생");
      }

    } else {
      message.error("로그인을 확인하세요.");
    }
  }, [username]);

  return (
    <Popconfirm title={"전체주문을 청산하시겠습니까?"} onConfirm={onSubmitSettleAll} okText="전체청산" cancelText="취소">
      <button type="button" className="btn ok-bg">
      전체청산
      </button>
    </Popconfirm>
  );
};

const PositionTableBody = (props) => {

  const { username, login } = useSelector(
    store => store.UserReducer,
    (left, right) => left.login === right.login
  );

  const { positionList } = useSelector(store => store.PositionReducer);

  return positionList?.map((item, index) => (
    <PositionTableItem key={item.symbol} {...item} {...props} />
  ));
};

export const PositionTableItem = ({
  broker_id,
  account,
  price,
  curr_price,
  side,
  profit,
  symbol,
  volume,
  sell_volume,
  setSettleKey,
  set_stoploss_symbol,
  created_at,
  updated_at
}) => {
	const dispatch = useDispatch();
	const { username, ip } = useSelector((store) => store.UserReducer);

  const stockList = useSelector((store) => store.TradeReducer.stockList);
	let findSymbolData = stockList?.find((item) => item.symbol == symbol);
  if ( symbol.substring(0, 1) == "1" || symbol.substring(0, 1) == "2" || symbol.substring(0, 1) == "3" )
  {
    findSymbolData = stockList?.find((item) => item.symbol.trim() == symbol.trim());
  }

	const onClickSettle = useCallback(() => setSettleKey(symbol), []);
	const onClickStoploss = useCallback(() => set_stoploss_symbol(symbol), []);

  return (
		<tr>
      <td className="align-c symbol">{broker_id}</td>
      <td className="align-c symbol">{account}</td>
			<td className={profit == 0 ? "align-c type eq-color" : profit > 0 ? "align-c type buy-color" : "align-c type sell-color"}>{symbol}</td>
      <td className={profit == 0 ? "align-c type eq-color" : profit > 0 ? "align-c type buy-color" : "align-c type sell-color"}>{findSymbolData?.kor_name}</td>
			{/* <td className={side === 0 ? "align-c type buy-color" : "align-c type sell-color"}>{side == 0 ? "매수" : "매도" }</td> */}
      {/* <td className={profit == 0 ? "align-r type eq-color" : profit > 0 ? "align-r type buy-color" : "align-r type sell-color"}>{common.pricisionFormat_Precision(curr_price / 10000, 2)}</td> */}
			<td className={profit == 0 ? "align-r type eq-color" : profit > 0 ? "align-r type buy-color" : "align-r type sell-color"}>{common.pricisionFormat_Precision(price / 10000, 2)}</td>
			<td className={profit == 0 ? "align-r type eq-color" : profit > 0 ? "align-r type buy-color" : "align-r type sell-color"}>{common.pricisionFormat_Precision(volume * 1000, 0)}</td>
      <td className={profit == 0 ? "align-r type eq-color" : profit > 0 ? "align-r type buy-color" : "align-r type sell-color"}>{common.pricisionFormat_Precision(sell_volume * 1000, 0)}</td>
      {/* <td className={profit == 0 ? "align-r type eq-color" : profit > 0 ? "align-r type buy-color" : "align-r type sell-color"}>{common.pricisionFormat_Precision(profit / 10000, 2)}</td> */}

      <td className="align-c">{created_at}</td>
      <td className="align-c">{updated_at}</td>

			{/* <td className="sticky col-right">
				<button type="button" className="btn ok-bg" onClick={onClickSettle}>
					매도
				</button>      
      </td> */}
			{/* <td>
				<button type="button" className="btn" onClick={onClickStoploss}>
					스탑로스
				</button>
			</td>       */}

		</tr>
	);
};

export const PositionClearModel = ({ closeSettle, settleKey }) => {

  const dispatch = useDispatch();
  const findPosition = useSelector((store) => store.PositionReducer.positionList.find((item) => item.symbol === settleKey));
  const { login, username } = useSelector((store) => store.UserReducer);

  const onSubmitSettle = async () => {
    if (!login) {
      dispatch({
        type: "message/show",
        payload: {
          message: "미로그인 상태입니다. 먼저 로그인을 해주세요",
          context: "text",
        },
      });
    }
    const { data } = await axios.post("/hts/clear_order", {
      id: username,
      actor: common.getActor(),
      symbol : findPosition.symbol,
    });

    message.success(data.message);
    closeSettle();
  };
  
  return (
    <div className="thbit-modal-orderform modal-clearing">
      <div className="modal-head" style={{ display: "flex", justifyContent: "space-between" }}>
        <h2 className="title" style={{ marginLeft: "20px" }}>
        매도
        </h2>
        <a className="close" onClick={closeSettle} style={{ marginRight: "20px" }}>
          <strong>닫기</strong>
        </a>
      </div>

      <div className="thbit-trade-form">
        <div className="form-row">
          <div className="form-fld has-label">
            <label className="label">청산종목</label>
            {findPosition?.symbol ?? ""}
          </div>
        </div>
        <div className="form-row">
          <div className="form-fld has-label">
            <label className="label">구분</label>
            {findPosition?.position == 66 ? "매수" : "매도"}
          </div>
        </div>
        <div className="form-row">
          <div className="form-fld has-label">
            <label className="label">청산수량</label>
            {findPosition?.volume}
          </div>
        </div>
        <div className="form-row form-button full">
          <button type="button" className="button ok-bg" onClick={onSubmitSettle}>
          청산
          </button>
        </div>
      </div>
    </div>
  );
};


export const PositionStoplossModal = ({ stoploss_symbol, closeStoploss }) => {
  const dispatch = useDispatch();

  const [earntick, setEarntick] = useState(0);
  const [losstick, setLosstick] = useState(0);
  
  const [enableEarntick, setEnableEarntick] = useState(false);
  const [enableLosstick, setEnableLosstick] = useState(false);

  const userdata = useSelector(({ UserReducer: { username, ip } }) => ({ username, ip }));
  const findPosition = useSelector(({ PositionReducer: { positionList } }) => positionList.find((position) => position.symbol === stoploss_symbol));


  useEffect(() => {
    setEarntick(findPosition["earncut"]);
    setLosstick(findPosition["losscut"]);

    if ( findPosition["earncut"] > 0 )
    {
      setEnableEarntick ( true );
    }

    if ( findPosition["losscut"] > 0 )
    {
      setEnableLosstick ( true );
    }    
  }, [findPosition.symbol]);

  const setStoplossRequest = async (e) => {
    const { data } = await axios.post("/hts/set_stoploss", {
      id: userdata.username,
      install: earntick * 1 + losstick * 1 > 0 ? true : false,
      symbol: findPosition.symbol,
      earntick: enableEarntick ? parseInt(earntick) : 0,
      losstick: enableLosstick ? parseInt(losstick) : 0,
    });
    if (data.result === true) {
      message.success(data.message);

      console.log ( data );
      // setEarntick(data["earntick"]);
      // setLosstick(data["losstick"]);
      
      // dispatch({
      //   type: "position/positionList/update_stoploss",
      //   payload: {
      //     position_key: findPosition.position_key,
      //     earntick: data["earntick"],
      //     losstick: data["losstick"],
      //     earnprice: data["익절가격"],
      //     lossprice: data["손절가격"],
      //     isprice: data["isprice"],
      //   },
      // });
    } else {
      message.error(data.message);
    }
  };

  return (

    <div className="thbit-modal-orderform">
      <div className="modal-head">
        <h2 className="title">스탑로스설정</h2>
        
        <a className="close" onClick={closeStoploss}>
          <strong>닫기</strong>
        </a>
      </div>

      <div className="thbit-trade-form">      
        <div className="form-row left10 warnning-color">
          스탑로스는 거래 당일간 서버에 저장되므로 매매에 유의하시기 바랍니다.
        </div>

        <div className="form-row tp30 m-l-r-10 on" data-tab-group="stoploss" data-tab-id="updown">
          <div className="form-fld has-label has-btn">
            <input
              type="number"
              className="inp align-r"
              name="earntick"
              value={isUndefined(earntick) ? 0 : earntick}
              autoComplete="off"
              onChange={({ target: { value } }) => setEarntick(value)}
            />

            <label className="label">
              <span className="chkwrap">
                <input
                  type="checkbox"
                  id="earn"
                  name="earntick"
                  checked={enableEarntick}
                  onChange={({ target: { checked } }) => {
                    setEnableEarntick(checked);
                    if (!checked) {
                      setEarntick("0");
                    }
                  }}
                />
                <label htmlFor="earn">익절 틱 설정</label>
              </span>
            </label>
            <div className="btn">
              <button
                type="button"
                className="updn ico-up"
                onClick={() => {
                  let nextTick = parseInt(earntick);
                  if (Number.isNaN(nextTick)) {
                    nextTick = 0;
                  } else {
                    nextTick++;
                  }
                  setEarntick(nextTick.toString());
                }}
              >
                Plus price
              </button>
              <button
                type="button"
                className="updn ico-dn"
                onClick={() => {
                  let nextTick = parseInt(earntick);
                  if (Number.isNaN(nextTick)) {
                    nextTick = 0;
                  } else if (nextTick > 0) {
                    nextTick--;
                  }
                  setEarntick(nextTick.toString());
                }}
              >
                Minus price
              </button>
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="clr-b"></div>
        </div>

        <div className="form-row tp5 m-l-r-10 on" data-tab-group="stoploss" data-tab-id="updown">
          <div className="form-fld has-label has-btn">
            <input
              type="number"
              className="inp align-r"
              name="losstick"
              value={isUndefined(losstick) ? 0 : losstick}
              autoComplete="off"
              onChange={({ target: { value } }) => setLosstick(value)}
            />
            <label className="label">
              <span className="chkwrap">
                <input
                  type="checkbox"
                  id="loss"
                  name="losstick"
                  checked={enableLosstick}
                  onChange={({ target: { checked } }) => {
                    setEnableLosstick(checked);
                    if (!checked) {
                      setLosstick("0");
                    }
                  }}
                />
                <label htmlFor="loss">손절 틱 설정</label>
              </span>
            </label>
            <div className="btn">
              <button
                type="button"
                className="updn ico-up"
                onClick={() => {
                  let nextTick = parseInt(losstick);
                  if (Number.isNaN(nextTick)) {
                    nextTick = 0;
                  } else {
                    nextTick++;
                  }
                  setLosstick(nextTick.toString());
                }}
              >
                Plus price
              </button>
              <button
                type="button"
                className="updn ico-dn"
                onClick={() => {
                  let nextTick = parseInt(losstick);
                  if (Number.isNaN(nextTick)) {
                    nextTick = 0;
                  } else if (nextTick > 0) {
                    nextTick--;
                  }
                  setLosstick(nextTick.toString());
                }}
              >
                Minus price
              </button>
            </div>
          </div>
        </div>

        <div className="form-row form-button m-l-r-10 full">
          <button type="button" className="button ok-bg" onClick={setStoplossRequest}>
            적용            {/* {earntick * 1 > 0 || losstick * 1 > 0 ? "설정" : "해제"} */}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PositionTable;
