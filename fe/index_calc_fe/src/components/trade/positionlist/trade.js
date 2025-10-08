import { DatePicker, message } from 'antd';
import axios from 'axios';
import classNames from 'classnames';
import moment from 'moment';
import React, { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { useSelector } from 'react-redux';
import common from '../../../common';

const { RangePicker } = DatePicker;

const defaultRange = [moment().add(-7, 'day'), moment()];

const tradeColumns = [
  {
    title: "주문번호",
    dataIndex: "order_id",
    key: "order_id",       
  },
  {
    title: "종목",
    dataIndex: "symbol",
    key: "symbol",       
  },
  {
    title: "주문상태",
    dataIndex: "order_step_name",
    key: "order_step_name",       
  },    
  {
    title: "주문종류",
    dataIndex: "order_status_name",
    key: "order_status_name",       
  },     
  {
    title: "시장구분",
    dataIndex: "market_type_name",
    key: "market_type_name",       
  },    
  {
    title: "체결유형",
    dataIndex: "fill_type_name",
    key: "fill_type_name",       
  },      
  {
    title: "주문가격",
    dataIndex: "price",
    key: "price",       
  },     
  {
    title: "체결가격",
    dataIndex: "price_fill",
    key: "price_fill",       
  },   
  {
    title: "주문수량",
    dataIndex: "volume",
    key: "volume",       
  },
  {
    title: "체결수량",
    dataIndex: "volume_fill",
    key: "volume_fill",       
  },  
  {
    title: "전체체결수량",
    dataIndex: "volume_total_fill",
    key: "volume_total_fill",       
  },              
  {
    title: "취소수량",
    dataIndex: "volume_cancel",
    key: "volume_cancel",       
  },    
  {
    title: "예수금",
    dataIndex: "deposit",
    key: "deposit",       
  },    
  {
    title: "X예수금",
    dataIndex: "deposit_ex",
    key: "deposit_ex",       
  },      
  {
    title: "send_at",
    dataIndex: "send_at",
    key: "send_at",       
  },       
  {
    title: "created_at",
    dataIndex: "created_at",
    key: "created_at",       
  },     
  {
    title: "error_code",
    dataIndex: "error_code",
    key: "error_code",       
  },      
  {
    title: "error_msg",
    dataIndex: "error_msg",
    key: "error_msg",       
  },         
];


const TradeTable = () => {
  const [searchOption, setSearchOption] = useState({ select: 'ALL', range: defaultRange });
  return (
    <>
      <TradeTableSearchbar setSearchOption={setSearchOption} />
      <div className="thbit-trade-table-container" data-simplebar>
        <table className="thbit-trade-table">
          <thead className="sticky head">
            <tr>              
              <th>Client-ID</th>
              <th>주문번호</th>              
              <th>종목</th>
              <th>종목명</th>
              <th>주문상태</th>
              <th>주문종류</th>
              <th>시장구분</th>
              <th>체결유형</th>
              <th>주문가격</th>
              <th>체결가격</th>              
              <th>주문수량</th>
              <th>미체결수량</th>
              <th>체결수량</th>
              <th>전체체결수량</th>
              <th>취소수량</th>              
              <th>수수료</th>
              <th>예수금</th>
              <th>X예수금</th>
              <th>유저데이터</th>     
              <th>전송시간</th>
              <th>주문시간</th>
              <th>에러코드</th>
              <th>메세지</th>
            </tr>
          </thead>
          <tbody>
            <TradeTableBody searchOption={searchOption} />
          </tbody>
        </table>
      </div>
    </>
  );
};

let datalist = [];

const TradeTableBody = ({ searchOption }) => {
  const { username, login, account } = useSelector(
    store => store.UserReducer,
    (left, right) => left.login === right.login
  );

  const { data } = useQuery(
    [
      'trade',
      searchOption.select,
      searchOption.range[0].format('YYYY-MM-DD'),
      searchOption.range[1].format('YYYY-MM-DD'),
    ],
    async () => {
      const { data } = await axios.get(
          '/order/v1/order_history?account=' +
          account +
          '&from_date=' +
          searchOption.range[0].format('YYYYMMDD') +
          '&to_date=' +
          searchOption.range[1].format('YYYYMMDD')
      );
      return data;
    },
    { staleTime: 1000, cacheTime: 1000, enabled: true, refetchOnMount: false, placeholderData: { datalist: [] } }
  );

  datalist = data.datalist;
  console.log ( "datalist", datalist );

  return data.datalist.map((item, index) => (
    <TradeTableItem key={item.ordNum + '' + item.ordNumOrg + '' + item.positiontypeid + index} {...item} />
  ));
};

const TradeTableItem = ({
  send_at,
  created_at,
  broker_id,
  account,
  order_id,
  order_key,
  symbol,
  order_status_name,
  order_step_name,
  market_type_name,
  fill_type_name,
  trade_type_name,
  order_type_name,
  side,
  side_name,
  enable_balance,
  profit,
  user_data,
  volume,
  volume_unfill,
  volume_fill,
  volume_total_fill,
  volume_cancel,
  price,
  price_fill,
  trading_fee,
  closing_fee,
  error_code,
  error_msg,
  record_no,
  deposit,
  deposit_ex,
}) => {

  const message_list = useSelector((store) => store.TradeReducer.message_list);

  const stockList = useSelector((store) => store.TradeReducer.stockList);
	let findSymbolData = stockList?.find((item) => item.symbol == symbol);

  let message_item = message_list?.find((item) => item.no == error_code);

   return (
    <tr>
      {/* <td className="align-c symbol">{broker_id}</td> */}
      {/* <td className="align-c symbol">{account}</td>          */}
      <td className="align-c">{order_key}</td>
      <td className="align-c">{order_id}</td>
      <td className="align-c symbol">{symbol}</td>
      <td className="align-c symbol">{findSymbolData?.kor_name}</td>
      <td className={side ==0 ? 'buy-color' : 'sell-color'}>{order_step_name}</td>         
      <td className={side ==0 ? 'buy-color' : 'sell-color'}>{side_name + order_status_name}</td>         
      <td className="">{market_type_name}</td>
      <td className="align-c symbol">{fill_type_name}</td>
      {/* <td className="align-c symbol">{order_type_name}</td>
      <td className="align-c symbol">{trade_type_name}</td>    */}
      <td className="align-r">{common.pricisionFormat_Precision(price / 10000, 2)}</td>
      <td className="align-r">{common.pricisionFormat_Precision(price_fill / 10000, 2)}</td>      
      <td className="align-r">{common.pricisionFormat_Precision(volume * 1000, 0)}</td>
      <td className="align-r">{common.pricisionFormat_Precision(volume_unfill * 1000, 0)}</td>
      <td className="align-r">{common.pricisionFormat_Precision(volume_fill * 1000, 0)}</td>
      <td className="align-r">{common.pricisionFormat_Precision(volume_total_fill * 1000, 0)}</td>
      <td className="align-r">{common.pricisionFormat_Precision(volume_cancel * 1000, 0)}</td>
      {/* <td className="align-r">{common.pricisionFormat_Precision(record_no * 1000, 0)}</td> */}
      <td className="align-r">{common.pricisionFormat_Precision(trading_fee + closing_fee, 2)}</td>
      <td className="align-c symbol">{common.pricisionFormat_Precision(deposit, 2)}</td>
      <td className="align-c symbol">{common.pricisionFormat_Precision(deposit_ex, 2)}</td>      
      {/* <td className={ profit > 0 ? "buy-color align-r" : profit < 0 ? "sell-color align-r" : "align-r" }>{common.pricisionFormat_Precision(profit / 10000, 2)}</td> */}
      <td className="align-c symbol">{user_data}</td>
      <td className="align-c">{common.convertDate(send_at)}</td>
      <td className="align-c">{common.convertDate(created_at)}</td>
      <td className={ error_code == 10000 ? "align-r" : "buy-color align-r" }>{error_code}</td>
      <td className={ error_code == 10000 ? "align-c" : "buy-color align-c" }>{error_msg}</td>
      {/* <td className={profit == 0 ? 'eq-color align-r' : profit > 0 ? 'buy-color align-r' : 'sell-color align-r'}>{common.pricisionFormat_Precision(profit, 0)}</td> */}
    </tr>
  );
};

const TradeTableSearchbar = ({ setSearchOption }) => {
  const queryClient = useQueryClient();
  const [range, setRange] = useState(defaultRange);
  const [select, setSelect] = useState('ALL');

  const onChangeSelect = useCallback(({ currentTarget: { value } }) => setSelect(value), []);

  const onClickSearch = () => {
    queryClient.invalidateQueries('trade');
    setSearchOption({ select, range });
  };

  const onToExcel = () => {
    console.log ( "datalist", datalist );
    common.exportExcel(tradeColumns, datalist, "거래내역");
  };  

  return (
    <div className="thbit-trade-inlineform antd-style">
      <label htmlFor="date_from" className="label">
      조회구분
      </label>
      <span className="fld">
        <select className="inp" value={select} onChange={onChangeSelect}>
          <option value="ALL">전체</option>
          <option value="FILLED">체결</option>
        </select>
      </span>
      <RangePicker className="inp date" defaultValue={range} inputreadOnly={true} onCalendarChange={setRange} />
      <button type="button" className="btn" onClick={onClickSearch}>
      조회
      </button>
      <button type="button" className="btn" onClick={onToExcel}>
        TO EXCEL
      </button>      
    </div>
  );
};

export default TradeTable;
