import React, { useState, useEffect,  } from "react";
import common from "../../../common";
import { useDispatch, useSelector } from "react-redux";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Brush } from 'recharts';
import axios from "axios";

const data_test = [
	{
	  time: '09:00',
	  price: 4000,
	  하이닉스: 2400,
	  삼성전자: 3400,
	  한진: 3500,
	//   amt: 2400,
	},
	{
	  time: '09:01',
	  price: 3000,
	  하이닉스: 1398,
	  삼성전자: 1400,
	  한진: 3100,
	//   amt: 2210,
	},
	{
	  time: '09:02',
	  price: 2000,
	  하이닉스: 9800,
	  삼성전자: 300,
	  한진: 3300,
	//   amt: 2290,
	},
	{
	  time: '09:03',
	  price: 2780,
	  하이닉스: 3908,
	  삼성전자: 3200,
	  한진: 3100,
	//   amt: 2000,
	},
	{
	  time: '09:04',
	  price: 1890,
	  하이닉스: 4800,
	  삼성전자: 340,
	  한진: 3000,
	//   amt: 2181,
	},
	{
	  time: '09:05',
	  price: 2390,
	  하이닉스: 3800,
	  삼성전자: 34000,
	  한진: 3700,
	//   amt: 2500,
	},
	{
	  time: '09:006',
	  price: 3490,
	  하이닉스: 4300,
	  삼성전자: 2400,
	  한진: 3800,
	//   amt: 2100,
	},
  ];

const StockChartProgram = ( datalist, chart_type ) => {

	const chart_data = [];
	const [test_chart, set_test_chart] = useState(false);

	console.log("datalist", datalist);

	useEffect(() => {

	}, []);  

	return (
		<div className="thbit-trade-price-list coin-list">
			<div className="list-wrap list-header ">
				<LineChart
					width={580}
					height={500}
					data={ datalist.length > 0 ?  datalist : test_chart }
					margin={{
						top: 30,
						right: 10,
						left:10,
						bottom: 10,
					}}
					>
					<CartesianGrid strokeDasharray="1 1" />
					<XAxis dataKey="time" />
					<YAxis yAxisId="left" dataKey="price" tickFormatter={(value) => value.toLocaleString()} />
					{/* <YAxis yAxisId="right" dataKey="하이닉스" orientation="right" /> */}
					<YAxis yAxisId="right" dataKey="삼성전자" orientation="right" tickFormatter={(value) => value.toLocaleString()}/>
					<Tooltip formatter={(value) => value.toLocaleString()}/>
					<Legend />
					{/* <Line yAxisId="left" type="monotone" dataKey="price" stroke="#8884d8" activeDot={{ r: 0 }} /> */}
					<Line yAxisId="right" type="monotone" dataKey="하이닉스" label="하이닉스" stroke="#82ca9d" />
					<Line yAxisId="right" type="monotone" dataKey="삼성전자" label="삼성전자" stroke="#8884d8" />
					<Line yAxisId="right" type="monotone" dataKey="한진" label="한진" stroke="#FF0000" />
					<Brush dataKey="time" height={15} stroke="#8884d8" />
				</LineChart>
			</div>
		</div>
	);
};

export default StockChartProgram;
