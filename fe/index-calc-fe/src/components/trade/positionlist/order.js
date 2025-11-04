import classNames from "classnames";
import { DatePicker, Popconfirm, message, Modal } from 'antd';
import axios from 'axios';
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import common from '../../../common';
import Lang from "../../lang";
import index from "../../../common/index"
import moment from 'moment';
import { useQuery, useQueryClient } from 'react-query';

const OrderTable = () => {

  const close_order_dialog = useCallback(() => set_order_symbol(""), []);
  const [order_symbol, set_order_symbol] = useState("");
  const [order_data, set_order_data] = useState({});

   useEffect(() => {

   }, [data]);

  const { account } = useSelector(store => store.UserReducer);

  const dispatch = useDispatch();

  const { data } = useQuery(
    [
      'query/orderlist',
    ],
    async () => {
      const { data } = await axios.get("/order/v1/active_orders?account=" + account );
      dispatch({
        type: "orderList/init",
        payload: data.datalist,
      })      
      return data;
    },
    { staleTime: 3000, cacheTime: 3000, enabled: true, refetchOnMount: true, placeholderData: { datalist: [] } }
  );

  return (    
    <>
      <Modal
				className="custom-modal"
				closable={false}
				footer={null}
				centered
				onOk={close_order_dialog}
				onCancel={close_order_dialog}
				open={order_symbol !== ""}
				destroyOnClose={true}
				width={330}
			>
			  <PositionStoplossModal close_order_dialog={close_order_dialog} order_data={order_data} />      
			</Modal>    
    <TradeTableSearchbar />
    <div className="thbit-trade-table-container" data-simplebar>
      <table className="thbit-trade-table">
        <thead className="sticky head">
          <tr className="notranslate">                   
            <th>BrokerID</th>
            <th>계좌번호</th>            
            <th>주문번호</th>                
            <th>종목명</th>
            <th>종목코드</th>
            <th>주문상태</th>
            <th>구분</th>    
            <th>시장구분</th>
            <th>체결유형</th>            
            {/* <th>주문구분</th>
            <th>거래구분</th>             */}
            <th>주문가격</th>
            <th>주문수량</th>
            <th>미체결수량</th>
            <th>취소수량</th>
            <th>매도가능(임시)</th>
            {/* <th>체결수량</th> */}
            {/* <th>예수금</th>     */}
            <th>유저데이터</th>     
            <th>전송시간</th>      
            <th>접수시간</th>      
            <th className="sticky col-right">
              {/* <OrderTableCancelAll /> */}
            </th>            
            {/* <th className="sticky col-right">
              <OrderTableCancelAll />
            </th> */}
          </tr>
        </thead>
        <tbody>
          <OrderTableBody set_order_symbol={set_order_symbol} set_order_data={set_order_data}/>
        </tbody>
      </table>
    </div>
    </>
  );
};

const TradeTableSearchbar = () => {
  const queryClient = useQueryClient();
  const onClickSearch = () => {
    queryClient.invalidateQueries('query/orderlist');    
  };
  return (
    <div className="thbit-trade-inlineform antd-style">
      <button type="button" className="btn" onClick={onClickSearch}>
      조회
      </button>
    </div>
  );
};



const OrderTableCancelAll = () => {
  const { username, password, ip, login } = useSelector(store => store.UserReducer);
  const onSubmitCancelAll = useCallback(async () => {
    const { data } = await axios.post('/order/v1/remove_order_all', {
      user_data: "123456789012",
    });
    console.log ( "data", data );
    if (data.result == true) {      
      message.success(data.message);
    } else {
      message.error(data.message);
    }
  }, [login]);
  return (
    <Popconfirm
      title={"전체주문을 취소하시겠습니까?"}
      onConfirm={onSubmitCancelAll}
      okText="주문"
      cancelText="취소"
    >
      <button type="button" className="btn ok-bg">
      전체취소
      </button>
    </Popconfirm>
  );
};

const OrderTableBody = (props) => {

  const { orderList } = useSelector(store => store.PositionReducer);

  return orderList?.map((item, index) => (
    <OrderTableItem key={item.symbol + 'order' + item.order_id} {...item} {...props} />
  ));
};

const OrderTableItem = ({
  send_at,
  created_at,
  broker_id,
  account,
  order_id,
  symbol,
  market_type,
  fill_type,
  side,
  price,
  volume,
  volume_unfill,
  volume_fill,
  enable_balance,
  user_data,
  set_order_symbol,
  set_order_data,
  volume_cancel,
  order_status,
  order_step,  
  record_no,
}) => {

  const dispatch = useDispatch();

  const { username } = useSelector(store => store.UserReducer);
  const stockList = useSelector((store) => store.TradeReducer.stockList);
	let findSymbolData = stockList?.find((item) => item.symbol == symbol);

  const onClickReplaceOrder = useCallback(() => {
    set_order_symbol(symbol);    

    let order_data = {};
    order_data.broker_id = broker_id;
    order_data.account = account;
    order_data.order_id = order_id;
    order_data.symbol = symbol;
    order_data.market_type = market_type;
    order_data.fill_type = fill_type;
    order_data.side   = side;
    order_data.volume = volume;
    order_data.price  = price;
    order_data.volume_unfill = volume_unfill;
    order_data.volume_fill = volume_fill;
    order_data.enable_balance = enable_balance;
    order_data.user_data = user_data;
    order_data.replace_type = 0;
    // dispatch({
    //   type: "order/order_item",
    //   payload: {
    //     data: order_data,
    //   },
    // }); 
    set_order_data( order_data );
  }, []);

  const onSubmitCancel = async () => {
    const { data } = await axios.post('/order/v1/remove_order', {
      broker_id: broker_id,
      order_id: order_id,
      symbol: symbol,
      user_data: user_data,
      account: account,
    });
    if (data.result == true) {      
      message.success(data.message);
    } else {
      message.error(data.message);
    }
  };

  return (
    <>

    <tr className="notranslate">            
      <td className="align-c symbol">{broker_id}</td>
      <td className="align-c symbol">{account}</td>      
      <td className="align-c symbol">{order_id}</td>
      <td className="align-c symbol">{findSymbolData?.kor_name}</td>
      <td className="align-c symbol">{symbol}</td>

      <td className="align-c symbol">{common.get_order_step(order_step)}</td>

      <td className={side === 0 ? 'buy-color' : 'sell-color'}>{ common.get_side_name(side) }</td>

      <td className="align-c symbol">{common.get_market_type_name(market_type)}</td>
      <td className="align-c symbol">{common.get_fill_type_name(fill_type)}</td>
      <td className="align-r">{common.pricisionFormat_Precision(price / 10000, 2)}</td>
      <td className="align-r">{common.pricisionFormat_Precision(volume * 1000, 0)}</td>
      <td className="align-r">{common.pricisionFormat_Precision(volume_unfill * 1000, 0)}</td>
      <td className="align-r">{common.pricisionFormat_Precision(volume_cancel * 1000, 0)}</td>
      <td className="align-r">{common.pricisionFormat_Precision(record_no * 1000, 0)}</td>
      {/* <td className="align-r">{common.pricisionFormat_Precision(volume_fill * 1000, 0)}</td> */}
      {/* <td className="align-r symbol">{enable_balance}</td> */}
      <td className="align-c symbol">{user_data}</td>
      <td className="align-c symbol">{ common.convertDate(send_at)}</td>
      <td className="align-c symbol">{ common.convertDate(created_at)}</td>
      <td className="sticky col-right">
        <button type="button" className="btn ok-bg" data-popover="replace-order" onClick={onClickReplaceOrder}>
          정정
        </button>
      </td>      
      <td className="sticky col-right">
        <Popconfirm
          title={"취소주문"}
          okText="주문"
          cancelText="취소"
          onConfirm={onSubmitCancel}
        >
          <button type="button" className="btn ok-bg" data-popover="cancel-all">
          취소
          </button>
        </Popconfirm>
      </td>
    </tr>
    </>
  );
};

export const PositionStoplossModal = ({ close_order_dialog, order_data }) => {

  const dispatch = useDispatch();

  const userdata = useSelector(({ UserReducer: { username, ip } }) => ({ username, ip }));
  const OrderData = useSelector(
    ({
      OrderReducer: {
        price,
        volume,
        replace_type ,
        broker_id,
      },
    }) => ({
      price,
      volume,
      replace_type ,
      broker_id,
    })
  );

  const stockList = useSelector((store) => store.TradeReducer.stockList);
  const findSymbolData = stockList?.find((item) => item.symbol == order_data.symbol);
  const tradeReducer = useSelector(({ TradeReducer }) => TradeReducer);  

  const [replace_type, set_replace_type] = useState(0);

  const [price, set_price] = useState(0);
  const [volume, set_volume] = useState(0);

  useEffect(() => {

    set_volume ( common.pricisionFormat_Precision(order_data?.volume_unfill * 1000, 0) );
    set_price ( common.pricisionFormat_Precision(order_data?.price / 10000, 2) );

  }, [order_data ]);

  const OnReplaceOrderModal = async (e) => {
    const { data } = await axios.post('/order/v1/replace_order', {
      broker_id: order_data.broker_id,
      account: order_data.account,
      order_id: order_data.order_id,
      symbol: order_data.symbol,            
      replace_type : replace_type,
      price     : parseFloat(price) * 10000,    
      volume    : parseInt(common.removeComma(volume)) / 1000,
      user_data : "",
    });
    if (data.result == true) {      
      message.success(data.message);
    } else {
      message.error(data.message);
    }
    close_order_dialog(true);
  };

  const onClickTab = ({ currentTarget }) => {
    set_replace_type ( parseInt (currentTarget.getAttribute("data")) );     
  };

  return (

    <div className="thbit-modal-orderform">
      <div className="modal-head">
        <h2 className="title">정정주문</h2>
        
        <a className="close" onClick={close_order_dialog}>
          <strong>닫기</strong>
        </a>
      </div>

      <div className="thbit-trade-form">      
        <div className="form-row tp-5 m-l-r-10 on" data-tab-group="stoploss" data-tab-id="updown">

        <div className="thbit-trade-tab-replace">
            <a className={classNames("tab", { on: replace_type == 0 ? true : false })} data="0" onClick={onClickTab}>
              가격정정
            </a>            
            <a className={classNames("tab", { on: replace_type == 1 ? true : false })} data="1" onClick={onClickTab}>
              수량정정
            </a>
          </div>

          <div className="form-row">
            <div className="clr-b"></div>
          </div>

          <div className="form-fld has-label">
            <label className="label">
              <label htmlFor="earn"> 주문번호 </label>              
            </label>
            {order_data.order_id}
          </div>

          <div className="form-row">
            <div className="clr-b"></div>
          </div>

          <div className="form-fld has-label">
            <label className="label">
              <label htmlFor="earn"> 종목명 </label>              
            </label>
            {findSymbolData?.kor_name}
          </div>

          <div className="form-row">
            <div className="clr-b"></div>
          </div>

          <div className="form-fld has-label">
            <label className="label">
              <label htmlFor="earn"> 종목코드 </label>              
            </label>
            {order_data.symbol}
          </div>                    

          <div className="form-row">
            <div className="clr-b"></div>
          </div>

          <div className="form-fld has-label has-btn">
            <label className="label">
              <label htmlFor="earn"> { replace_type == 0 ? "정정가격" : "정정수량" }</label>
            </label>
            {replace_type == 0 ? price : volume}
            <div className="btn">
              <button
                type="button"
                className="updn ico-up"
                onClick={({ target: { name } }) => {
                  if ( replace_type == 0 )
                  {
                    const up_price = common.pricisionFormat_Precision(common.increaseStringValue(price, tradeReducer.current_symbol.depth_unit, 1000000000), 2);
                    set_price ( up_price );
                  } else if ( replace_type == 1 )
                  {
                    const up_volume = common.pricisionFormat_Precision(common.increaseStringValue(volume, 1000, 1000000000), 0);
                    set_volume ( up_volume );
                  }
                }}
              >
                Plus price
              </button>
              <button
                type="button"
                className="updn ico-dn"
                onClick={({ target: { name } }) => {
                  if ( replace_type == 0 )
                  {                  
                    const down_price = common.pricisionFormat_Precision(common.decreaseStringValue(price, tradeReducer.current_symbol.depth_unit, 0), 2);
                    set_price ( down_price );
                  } else if ( replace_type == 1 )
                  {
                    const down_volume = common.pricisionFormat_Precision(common.decreaseStringValue(volume, 1000, 0), 0);
                    set_volume ( down_volume );                    
                  }
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

        <div className="form-row">
          <div className="clr-b"></div>
        </div>

        <div className="form-row form-button m-l-r-10 full">
          <button type="button" className="button ok-bg" onClick={OnReplaceOrderModal}>
            정정주문
          </button>
        </div>
      </div>
    </div>
  );
};


export default OrderTable;
