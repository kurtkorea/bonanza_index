import React, { useState, useEffect,  } from "react";
import common from "../../common";
import { useDispatch, useSelector } from "react-redux";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios from "axios";

const data_test = [
	{
	  time: '09:00',
	  price: 4000,
	  하이닉스: 2400,
	  삼성전자: 3400,
	//   amt: 2400,
	},
	{
	  time: '09:01',
	  price: 3000,
	  하이닉스: 1398,
	  삼성전자: 1400,
	//   amt: 2210,
	},
	{
	  time: '09:02',
	  price: 2000,
	  하이닉스: 9800,
	  삼성전자: 300,
	//   amt: 2290,
	},
	{
	  time: '09:03',
	  price: 2780,
	  하이닉스: 3908,
	  삼성전자: 3200,
	//   amt: 2000,
	},
	{
	  time: '09:04',
	  price: 1890,
	  하이닉스: 4800,
	  삼성전자: 340,
	//   amt: 2181,
	},
	{
	  time: '09:05',
	  price: 2390,
	  하이닉스: 3800,
	  삼성전자: 34000,
	//   amt: 2500,
	},
	{
	  time: '09:006',
	  price: 3490,
	  하이닉스: 4300,
	  삼성전자: 2400,
	//   amt: 2100,
	},
  ];





const LogList = () => {

	const chart_data = [];

	const [loglist, setLogList] = useState([
		{
			id: 1,
			time: "2024-01-01T13:14:00",
			data: "asdf",
		},
	]);

	const [test_chart, set_test_chart] = useState(false);

	useEffect(() => {

		get_chart_data();

	}, []);

	const get_chart_data = async () => {
		const { data } = await axios.get("/service/get_chart", {
			params: {
				interval: 30,
			},
		});

		data.datalist.forEach(item => {
			if ( item.datalist.length > 0 )
			{		
				let i = 0;		
				item.datalist.forEach(item_symbol => {

					const t = item_symbol.time.split(' ')[1]?.slice(0, 8);
					
					const chart_item = {
						time: t,
						price: item_symbol.price / 100,
						total_amount: parseInt(item_symbol.total_amount / 10000),
					};

					if ( item.symbol == "000660" )
					{
						chart_data.push(chart_item);
					}

				});

				set_test_chart ( chart_data );
			}
		});

		console.log(chart_data);
		console.log(data_test);
	}	  

	return (
		<div className="thbit-trade-price-list coin-list">
			<div className="list-wrap list-header ">
				<LineChart
					width={800}
					height={650}
					data={data_test}
					margin={{
						top: 150,
						right: 30,
						left: 20,
						bottom: 0,
					}}
					>
					<CartesianGrid strokeDasharray="1 1" />
					<XAxis dataKey="time" />
					<YAxis yAxisId="left" dataKey="price" />
					{/* <YAxis yAxisId="right" dataKey="하이닉스" orientation="right" /> */}
					<YAxis yAxisId="right" dataKey="삼성전자" orientation="right" />
					<Tooltip />
					<Legend />
					{/* <Line yAxisId="left" type="monotone" dataKey="price" stroke="#8884d8" activeDot={{ r: 0 }} /> */}
					<Line yAxisId="right" type="monotone" dataKey="하이닉스" label="하이닉스" stroke="#82ca9d" />
					<Line yAxisId="right" type="monotone" dataKey="삼성전자" label="삼성전자" stroke="#8884d8" />
				</LineChart>
			</div>
		</div>
	);
};

export default LogList;
