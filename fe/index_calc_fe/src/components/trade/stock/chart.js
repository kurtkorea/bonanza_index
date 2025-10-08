import React, { useState, useEffect,  } from "react";
import common from "../../../common";
import { useDispatch, useSelector } from "react-redux";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Brush } from 'recharts';
import axios from "axios";
import moment from "moment";

const data_test = [
	{
	  time: '09:00',
	  하이닉스_price: 4000,
	  삼성전자_price: 14000,
	  하이닉스: 2400,
	  삼성전자: 3400,
	  한진: 3500,
	//   amt: 2400,
	},
	{
	  time: '09:01',
	  하이닉스_price: 3000,
	  삼성전자_price: 14000,
	  하이닉스: 1398,
	  삼성전자: 1400,
	  한진: 3100,
	//   amt: 2210,
	},
	{
	  time: '09:02',
	  하이닉스_price: 2000,
	  삼성전자_price: 14000,
	  하이닉스: 9800,
	  삼성전자: 300,
	  한진: 3300,
	//   amt: 2290,
	},
	{
	  time: '09:03',
	  하이닉스_price: 2780,
	  삼성전자_price: 14000,
	  하이닉스: 3908,
	  삼성전자: 3200,
	  한진: 3100,
	//   amt: 2000,
	},
	{
	  time: '09:04',
	  하이닉스_price: 1890,
	  삼성전자_price: 14000,
	  하이닉스: 4800,
	  삼성전자: 340,
	  한진: 3000,
	//   amt: 2181,
	},
	{
	  time: '09:05',
	  하이닉스_price: 2390,
	  삼성전자_price: 14000,
	  하이닉스: 3800,
	  삼성전자: 34000,
	  한진: 3700,
	},
	{
	  time: '09:006',
	  하이닉스_price: 3490,
	  삼성전자_price: 14000,
	  하이닉스: 4300,
	  삼성전자: 2400,
	  한진: 3800,
	//   amt: 2100,
	},
  ];

const StockChart = ({datalist, chart_type}) => {

	const [chart_data, set_chart_data] = useState([]);
	const { chart_1636_ksp } = useSelector((store) => store.TradeReducer);
	const { chart_1636_ksp_max_price, chart_1636_ksp_min_price } = useSelector((store) => store.TradeReducer);

	console.log("chart_1636_ksp", chart_1636_ksp);

	useEffect(() => {
		// get_chart_data_1636();
	}, []);


	return (
		<div className="thbit-trade-price-list coin-list">
			<div className="list-wrap list-header ">
			
			{
					<LineChart
						// key={`chart-${index}`}
						width={580}
						height={500}
						data={ chart_1636_ksp }
						margin={{
							top: 30,
							right: 10,
							left:10,
							bottom: 10,
						}}
						>
						<CartesianGrid strokeDasharray="1 1" />
						<XAxis dataKey="time" type="category" allowDuplicatedCategory={false}/>
						<YAxis yAxisId="right" dataKey="total_amount" orientation="right" tickSize={10}/>
						<YAxis yAxisId="left" dataKey="price"  tickSize={10}/>
						{chart_1636_ksp.map((s) => (
							<React.Fragment key={s.name}>
								<Line yAxisId="right" dataKey="total_amount" data={s.data} name={s.name} dot={false} stroke={s.color} strokeWidth={1}/>
								<Line yAxisId="left" dataKey="price" data={s.data} name={'현재가'} dot={false} stroke={s.color} strokeWidth={3}/>
							</React.Fragment>
						))}
						
						{/* <Brush dataKey="time" data={chart_1636_ksp[0]?.data} height={30} stroke="#8884d8" />					 */}
						<Tooltip 
							formatter={(value, entry, payload) => {
								return (
									<>  
										<span style={{ color: entry.color }}> {value.toLocaleString()} </span>
										{/* <br/> */}
										{/* <span style={{ color: entry.color }}> {"현재가 :" + payload.payload.price.toLocaleString()} </span> */}
									</>
								);
							}}
						/>

						<Legend />									
					</LineChart>
			}

			</div>
		</div>
	);
};


export default StockChart;
