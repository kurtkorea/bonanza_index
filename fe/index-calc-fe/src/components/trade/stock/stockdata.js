import axios from "axios";
import classNames from "classnames";
import React, { useEffect } from "react";
import { useQuery } from "react-query";
import { useSelector } from "react-redux";
import common from "../../../common";

const data_test = [
	{
    rank : 1,
	  symbol : "005930",
	  kor_name : "삼성전자",
	  ratio : "15.00",
	  price : "65000",
	},
	{
    rank : 2,
	  symbol : "000660",
	  kor_name : "하이닉스",
	  ratio : "10.00",
    price : "265000",
	},
	{
    rank : 3,
	  symbol : "000660",
	  kor_name : "네이버",
	  ratio : "8.00",
    price : "165000",
	},
	{
    rank : 4,
	  symbol : "000660",
	  kor_name : "카카오",
	  ratio : "5.00",
    price : "365000",
	},  
	{
    rank : 5,
	  symbol : "000660",
	  kor_name : "현대차",
	  ratio : "3.00",
    price : "165000",
	},  
]

const StockkData = () => {
  return (
    <>
		<div className="thbit-trade-table-container" data-simplebar style={{ height: "280px" }}>
				<table className="thbit-trade-table" >
					<thead className="sticky head">
						<tr className="notranslate" >
							<th className="align-c" style={{ fontSize: "13px", width: "10px", fontWeight: "600" }}>
								순위
							</th>       
							<th className="align-c" style={{ fontSize: "13px", fontWeight: "600" }}>
								종목
							</th>        
              <th className="align-c" style={{ fontSize: "13px", fontWeight: "600" }}>
								현재가
							</th>                
							<th className="align-c" style={{ fontSize: "13px", fontWeight: "600" }}>
								비율(%)
							</th>
						</tr>
					</thead>
					<tbody>
						<StockDataBody datalist={data_test} />
					</tbody>
				</table>
			</div>  
    </>
  );
};

const StockDataBody = (props) => {
  return props?.datalist?.map((item, index) => (
    <StockDataItem key={item.rank} {...item} {...props} />
  ));
};

export const StockDataItem = ({
  rank,
  symbol,
  kor_name,
  ratio,
  price,
}) => {
  return (
		<tr style={{ cursor: "pointer" }}
      onClick={() => {
        navigator.clipboard.writeText(symbol);
      // alert("심볼이 복사되었습니다: " + symbol);
}}>
      <td className="align-c" style={{ fontSize: "13px", fontWeight: "500" }}>{rank}</td>
      <td
        className="align-c"
        title={symbol}
        style={{ fontSize: "13px", fontWeight: "500" }}
      >
        {kor_name}
      </td>
      <td className="align-r" style={{ fontSize: "13px", fontWeight: "500" }}>{ common.priceFormat (price)}</td>
      <td className="align-r" style={{ fontSize: "13px", fontWeight: "500" }}>{ratio}</td>
		</tr>
	);
};

export default StockkData;
