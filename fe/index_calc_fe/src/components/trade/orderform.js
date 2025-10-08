import classNames from "classnames";
import React, { useState, useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Slider, Modal, message, Select } from "antd";
import axios from "axios";
import CompoundedSpace from "antd/lib/space";
import common from "../../common";
import Lang from "../lang";
import index from "../../common/index";

const TradeOrderform = () => {
  const dispatch = useDispatch();

  const OrderData = useSelector(
    ({
      UserReducer: { login, username, ip, broker_id, account, },
      OrderReducer: {
        symbol,
        symbol_name,
        side,
        market_type,
        order_type,
        fill_type ,
        trade_type,
        price,
        volume,
        user_data,
      },
      TradeReducer: { price_precision, tick_precision, close },
    }) => ({
      login, 
      username, 
      ip,
      broker_id,
      account,
      symbol,
      symbol_name,
      side,
      market_type,
      order_type,
      fill_type ,
      trade_type,
      price,
      volume,
      user_data,
      close,
    })
  );

  const [checkModal, setCheckModal] = useState(false);
  const [side, set_side] = useState(0);
  const [tab_idx, set_tab_idx] = useState(0);
  
  const [ioc_fok, set_ioc_fok] = useState(0);

  const updateVolume = (nextTotalValue) => {
    dispatch({
      type: "order/change",
      payload: {
        name: "volume",
        value: common.pricisionFormat_FloorPrecision(nextTotalValue, OrderData.tick_precision),
      },
    });
  };

  const closeModal = () => {
    setCheckModal(false);
  };

  const onClickBeforeCheck = ({ currentTarget: { value } }) => {

    // if (window.innerWidth <= 768 && !$(".thbit-trade-section").hasClass("order-open")) {
    //   $(".thbit-trade-section").addClass("order-open");
    //   return;
    // }

    // if (!OrderData.login) {
    //   message.error("미로그인 상태입니다. 먼저 로그인을 해주세요");
    //   return;
    // }

    if ( OrderData.symbol == "" ) {
      message.error("종목코드를 확인하세요.");
      return;
    }    

    // if (!(common.removeComma(OrderData.price) * 1 > 0) && OrderData.market_type !== "1") {
    //   message.error("주문 가격을 확인하세요.");
    //   return;
    // }
    if (!(common.removeComma(OrderData.volume) * 1 > 0)) {
      message.error("주문 수량을 확인하세요.");
      return;
    }
    set_side( parseInt(value) );
    setCheckModal(true);
  };

  let price_data = parseFloat ( "0" );
  if ( OrderData.market_type != 0 )
  {
    price_data = OrderData.price === "" || OrderData.price === "0" ? OrderData.close : common.removeComma(OrderData.price)
    price_data = parseFloat ( price_data );
  }

  const onSubmitOrder = async () => {
    
    if (common.removeComma(OrderData.volume) * 1 > 0) {
      setCheckModal(false);
      const { data } = await axios.post("/order/v1/new_order", {
            broker_id : OrderData.broker_id,
            account   : OrderData.account,
            symbol    : OrderData.symbol,
            side      : side,        
            market_type: OrderData.market_type, 
            order_type: OrderData.order_type, 
            fill_type  : OrderData.fill_type,
            trade_type : OrderData.trade_type,
            price     : parseFloat(OrderData.price) * 10000,    
            volume    : parseInt(common.removeComma(OrderData.volume)) / 1000,
            user_data : OrderData.user_data,
      });

      message.success(data.message);
      if ( !common.isEmpty(data.response))
        message.success(data.response.error_msg);

    }
  };

  useEffect(() => {
  }, [OrderData.symbol, OrderData.login, OrderData.username]);

  const onClickTab = ({ currentTarget }) => {
    set_tab_idx ( parseInt (currentTarget.getAttribute("data") ) );
    dispatch({
      type: "order/market_type",
      payload: {
        data: currentTarget.getAttribute("data"),
      },
    });    
  };

  const onChangeIOCFOK = (value) => {
		set_ioc_fok ( value );
    dispatch({
      type: "order/fill_type",
      payload: {
        data: value,
      },
    }); 
    
    console.log ( "fill_type", value );
	};

  const tradeReducer = useSelector(({ TradeReducer }) => TradeReducer);  

  return (
    <>
      <Modal title="" centered closable={false} width={320} className="custom-modal" open={checkModal} onCancel={() => setCheckModal(false)} footer={null}>
        <div className="thbit-modal-orderform modal-orderconfirm">
          <div className="modal-head">
            <h2 className="title">주문확인</h2>
          </div>

          <div className="thbit-trade-form">
            <div className="form-row">
              <div className="form-fld has-label">
                <label className="label label-modal"> 주문유형 </label>
                <span className={classNames({ "buy-color": side == 0, "sell-color": side == 1 })}>
                  {(tab_idx === 1 ? "시장가" : "지정가") + " - " + (side == 0 ? "매수" : "매도")}
                </span>
              </div>
            </div>
            <div className="form-row">
              <div className="form-fld has-label">
                <label className="label label-modal">가  격</label>
                {tab_idx === 1 ? "시장가" : OrderData.price}
              </div>
            </div>
            <div className="form-row">
              <div className="form-fld has-label label-modal">
                <label className="label label-modal">수  량</label>
                {OrderData.volume}
              </div>
            </div>

            <div className="form-row form-button">
              <button type="button" onClick={onSubmitOrder} className="button ok-bg">
                주문
              </button>
              <button
                type="button"
                onClick={() => {
                  setCheckModal(false);
                }}
                className="button"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* <TradeInfo /> */}
      <div className="thbit-trade-form">        
        <div className="order-form">        
          <div className="thbit-trade-tab">
            <a className={classNames("tab", { on: tab_idx === 0 })} data="0" onClick={onClickTab}>
              지정가
            </a>
            <a className={classNames("tab", { on: tab_idx === 1 })} data="1" onClick={onClickTab}>
              시장가
            </a>
          </div>
          <div className="form-row">
            <div className="form-fld has-label">
                <span className="inp">
                {OrderData.broker_id}
                </span>
                <label htmlFor="price" className="label">
                트레이더ID
                </label>
            </div>
          </div>
          <div className="form-row">
            <div className="form-fld has-label">
                <span className="inp">
                {OrderData.account}
                </span>
                <label htmlFor="price" className="label">
                계좌번호
                </label>
            </div>
          </div>    
          {/* <div className="form-row">
            <div className="form-fld has-label">
                <span className="inp">
                {OrderData.user_data}
                </span>
                <label htmlFor="price" className="label">
                사용자데이터
                </label>
            </div>
          </div>                  */}

          <div className="form-row on">
            <div className="form-fld has-label has-btn">
            <label htmlFor="price" className="label">
                  IOC/FOK
            </label>                          
              <Select id="bank" className="select full" value={ioc_fok} options={[
                {
                  value: 0,
                  label: 'DAY',
                },                
                {
                  value: 1,
                  label: 'IOC',
                },
                {
                  value: 2,
                  label: 'FOK',
                },                
              ]} onChange={onChangeIOCFOK} />
            </div>
          </div>	          
          <div className="form-row on">
            {tab_idx === 0 ? (
              <div className="form-fld has-label has-btn">
                <input
                  name="price"
                  id="price"
                  value={OrderData.price}
                  onChange={({ target: { name, value } }) => {
                    dispatch({ type: "order/change", payload: { name, value: value * 1 >= 0 ? value : "" } });
                  }}
                  onClick={({ target: { name, value } }) => dispatch({ type: "order/change", payload: { name, value: common.removeComma(value) } })}
                  onBlur={({ target: { name, value } }) =>
                    dispatch({
                      type: "order/change",
                      payload: { name, value: common.pricisionFormat_Precision(value, 2) },
                    })
                  }
                  placeholder="가격"
                  autoComplete="off"
                  className="inp"
                />
                <label htmlFor="price" className="label">
                  가격
                </label>
                <div className="btn">
                  <button
                    type="button"
                    className="updn ico-up"
                    name="price"
                    onClick={({ currentTarget: { name } }) => {
                      dispatch({
                        type: "order/change",
                        payload: {
                          name,
                          value: common.pricisionFormat_Precision(common.increaseStringValue(OrderData.price, tradeReducer.current_symbol.depth_unit, 1000000000), 2),
                        },
                      });
                    }}
                  >
                    Plus price
                  </button>
                  <button
                    type="button"
                    className="updn ico-dn"
                    name="price"
                    onClick={({ currentTarget: { name } }) => {
                      dispatch({
                        type: "order/change",
                        payload: {
                          name,
                          value: common.pricisionFormat_Precision(common.decreaseStringValue(OrderData.price, tradeReducer.current_symbol.depth_unit, 0), 2),
                        },
                      });
                    }}
                  >
                    Minus price
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-fld has-label">
                <span className="inp buy-color">
                시장가
                </span>
                <label htmlFor="price" className="label">
                  가격
                </label>
              </div>
            )}
          </div>
          <div className="form-row">
            <div className="form-fld has-label has-btn">
              <input
                name="volume"
                id="volume"
                value={OrderData.volume}
                onClick={({ target: { name, value } }) => dispatch({ type: "order/change", payload: { name, value: common.removeComma(value) } })}
                onBlur={({ target: { name, value } }) =>
                  dispatch({
                    type: "order/change",
                    payload: { name, value: common.pricisionFormat_Precision(value, 0) },
                  })
                }
                onChange={({ target: { name, value } }) => {
                  dispatch({ type: "order/change", payload: { name, value: value * 1 >= 0 ? value : "" } });
                }}
                placeholder="수량"
                autoComplete="off"
                className="inp align-r"
              />
              <label htmlFor="amount" className="label">
                수량
              </label>
              <div className="btn">
                <button
                  type="button"
                  className="updn ico-up"
                  name="volume"
                  onClick={({ target: { name } }) => {
                    dispatch({
                      type: "order/change",
                      payload: {
                        name,
                        value: common.pricisionFormat_Precision(common.increaseStringValue(OrderData.volume, 1000, 1000000000), 0),
                      },
                    });
                  }}
                >
                  Plus price
                </button>
                <button
                  type="button"
                  className="updn ico-dn"
                  name="volume"
                  onClick={({ target: { name } }) => {
                    dispatch({
                      type: "order/change",
                      payload: {
                        name,
                        value: common.pricisionFormat_Precision(common.decreaseStringValue(OrderData.volume, 1000, 0), 0),
                      },
                    });
                  }}
                >
                  Minus price
                </button>
              </div>
            </div>
          </div>

          <div className="form-row form-button order-button">
            <button type="button" value="0" onClick={onClickBeforeCheck} className="button buy-bg">
              매수
            </button>
            <button type="button" value="1" onClick={onClickBeforeCheck} className="button sell-bg">
              매도
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default TradeOrderform;

