import React, { useCallback, useEffect, useRef, useState } from "react";
import { message, notification, Popconfirm, Select, Modal } from "antd";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import common from "../../common";

const Status = () => {

	const dispatch = useDispatch();

	const [data_count, set_data_count] = useState("1000");
	const [sleep_time, set_sleep_time] = useState("100");
	const [send_count, set_send_count] = useState("1");

	const [file_list, set_file_list] = useState([]);
	const [file_name, set_file_name] = useState("");
	const [file_path, set_file_path] = useState("");

	const system_status = useSelector((store) => store.TradeReducer.system_status);

	const market_info = useSelector((store) => store.TradeReducer.market_info);

	const [modal_force_master, set_modal_force_master] = useState(false);

	let virtual_market = "";
	let virtual_market_text = "";
	let btn_color = "buy-bg";
	if ( market_info.is_virtual_market )
	{
		btn_color = "sell-bg";
		virtual_market = "가상거래소중지";
		virtual_market_text = "가상거래소를 중지합니다.";
	} else {
		virtual_market = "가상거래소시작";
		btn_color = "buy-bg";
		virtual_market_text = "가상거래소를 시작합니다.";
	}

	const onVirtualMarket = async () => {

		if ( market_info.is_virtual_market )
		{
			const { data } = await axios.get("/virtual/v1/stop_market", {
				params: {
				},
			  });
	
			  if (data.result) {      
				message.success(data.message);
			  } else {
				message.error(data.message);
			  }
		} else {

			const file_request = file_path + file_name;
			const { data } = await axios.get("/virtual/v1/start_market", {
				params: {
					time: sleep_time == 0 ? 1 : common.removeComma(sleep_time),
					count: common.removeComma(data_count),
					file : file_request,
					send_count : send_count,
				},
			  });
	
			  if (data.result) {      
				message.success(data.message);
			  } else {
				message.error(data.message);
			  }
		}
	};		

	const get_file_list = async () => {
		const { data } = await axios.get("/service/v1/data_file_list");  

		const datalist = data.datalist.map((item) => ({
			value: item,
		}));

		set_file_list ( datalist );
		set_file_path ( data["path"] );

		if ( data.active_file != "" )
		{
			set_file_name ( data.active_file );
		} else {
			if ( datalist.length > 0 )
			{
				set_file_name ( datalist[0].value );
			}
		}
	}	  

	const get_system_usage = async () => {
		const { data } = await axios.get("/service/v1/system_status");  
		dispatch({
			type: 'trade/system',
			payload: data,
		});		

		set_data_count ( common.pricisionFormat_Precision('' +data.system_info.second_per_count, 0) );
		set_sleep_time ( common.pricisionFormat_Precision('' +data.system_info.sleep_time, 0));	
	}	 	

	const onChangeFile = (value) => {
		set_file_name ( value );
	};	  

	const showMasterModal = (value) => {
		set_modal_force_master ( true );
	};	  	

	const onMasterUpdate = async (value) => {	
		const { data } = await axios.post("/service/v1/force_master_update", {
			key: "6e102885-4dc7-4224-95a2-20137b08eb8a",
		});
		if ( data.result == true )
		{
			notification.success({
				message: "마스터 강제 업데이트 완료.",
				duration: 5,
				placement: "top",
			});			
			const new_data = await axios.get("/service/v1/master");

			console.log ( "new_data", new_data );

			if ( new_data.data.result == true )
			{				
				dispatch({
					type: 'trade/codeList',
					payload: new_data.data,
				});		 
				sessionStorage.setItem( "master_list", JSON.stringify(new_data.data) );			  				
			}
		} else {
			message.error(data.message);
		}		
		set_modal_force_master(false);
	};		


	const onRefresh = async () => {		
		const { data } = await axios.get("/service/v1/system_status");  

		dispatch({
			type: 'trade/system',
			payload: data,
		});		

		set_data_count ( common.pricisionFormat_Precision('' + data.system_info.second_per_count, 0) );
		set_sleep_time ( common.pricisionFormat_Precision('' + data.system_info.sleep_time, 0));	
	};		

	useEffect(() => {
		// get_file_list();
		// get_system_usage();
	  }, [market_info]);	

  return (
	<>
	  <div className="thbit-trade-asset-status asset-margin full" data-simplebar>
	  	<div className="order-form">  

		  	<p className="asset-status">
				<strong className="label up-color">CPU peak/usage</strong>
				<strong className="up-color">
					{common.pricisionFormat_Precision(system_status.process_status.cpu_peak, 2) + " / " + common.pricisionFormat_Precision(system_status.process_status.cpu, 2)} %
				</strong>
			</p>  
			<p className="asset-status">
				<strong className="label up-color">Total/Free Memory</strong>
				<strong className="up-color">
					{common.pricisionFormat_Precision(system_status.process_status.memory_total, 2) + " / " + common.pricisionFormat_Precision(system_status.process_status.memory_free, 2)} GB
				</strong>
			</p>   			

			<p className="asset-status">
				<strong className="label up-color">시세프로세스상태</strong>
				<strong className= {system_status.process_status.feed_process === true ? "up-color" : "down-color"} >
					{ system_status.process_status.feed_usage + "% / "}
					{ system_status.process_status.feed_process === true ? "ENABLE" : "DISABLE" }					
				</strong>
			</p>  

			<p className="asset-status">
				<strong className="label up-color">주문프로세스상태</strong>
				<strong className={system_status.process_status.order_process === true ? "up-color" : "down-color"}>
					{ system_status.process_status.order_usage + "% / "}
					{ system_status.process_status.order_process === true ? "ENABLE" : "DISABLE" }					
				</strong>
			</p>   		

			<p className="asset-status">
				<strong className="label up-color">가상거래소상태</strong>
				<strong className={system_status.process_status.virtual_process === true ? "up-color" : "down-color"}>
					{ system_status.process_status.vmarket_usage + "% / "}
					{ system_status.process_status.virtual_process === true ? "ENABLE" : "DISABLE" }					
				</strong>
			</p>   	

			<p className="asset-status">
				<strong className="label up-color">REPLAY 서버상태</strong>
				<strong className={system_status.process_status.vfeed_process === true ? "up-color" : "down-color"}>
					{ system_status.process_status.vfeed_usage + "% / "}
					{ system_status.process_status.vfeed_process === true ? "ENABLE" : "DISABLE" }					
				</strong>
			</p>   				

			<p className="asset-status">
				<strong className="label up-color">API서버상태</strong>
				<strong className={system_status.process_status.vfeed_process === true ? "up-color" : "down-color"}>
					{ system_status.process_status.web_usage + "%"}
				</strong>
			</p>  

			<p className="asset-status">
				<strong className="label up-color">SEND/RECV 데이터 수량</strong>
				<strong className="up-color">
					{common.pricisionFormat_Precision(system_status.system_info.send_count, 0) + " / " + common.pricisionFormat_Precision(system_status.system_info.recv_count, 0)}
				</strong>
			</p>  			

			<p className="asset-status">
				<strong className="label up-color">장중 DB 데이터 수량</strong>
				<strong className="up-color">
					{common.pricisionFormat_Precision(system_status.system_info.db_real_count, 0)}
				</strong>
			</p> 		

			<p className="asset-status">
				<strong className="label up-color">REPLAY-DB 데이터 수량</strong>
				<strong className="up-color">
					{common.pricisionFormat_Precision(system_status.system_info.db_virtual_count, 0)}
				</strong>
			</p> 	
				

			<p className="asset-status">
				<strong className="label up-color">데이터피딩시작시간</strong>
				<strong className="up-color">
					{ system_status.system_info.start_time == 0 ? "-" : common.convertTime(system_status.system_info.start_time, 0)}
				</strong>
			</p> 

			<p className="asset-status">
				<strong className="label up-color">데이터피딩종료시간</strong>
				<strong className="up-color">
					{ system_status.system_info.finish_time == 0 ? "-" : common.convertTime(system_status.system_info.finish_time, 0)}
				</strong>
			</p> 
			
			<button type="button" className={"button buy-bg"} onClick={onRefresh}>
				시세 DB COUNT REFRESH
			</button>			

			<button type="button" className={"button buy-bg"} onClick={showMasterModal}>
				마스터 강제 업데이트
			</button>						
			
			<div className="form-row on">
				<div className="form-fld  has-label full">
					<Select id="bank" className="select full" value={file_name} options={file_list} onChange={onChangeFile} />
					<label htmlFor="data_count" className="label">
					{"파일위치 (" + file_path + ")" }
					</label>					
				</div>	
				<div className="form-fld has-label has-btn">
					<input
					name="sleep_time"
					id="sleep_time"
					value={sleep_time}
					onChange={({ target: { name, value } }) => {
						set_sleep_time(value);
					}}
					onClick={({ target: { name, value } }) => set_sleep_time(value)}
					onBlur={({ target: { name, value } }) =>
					set_sleep_time(value)
					}
					placeholder="SLEEP TIME"
					autoComplete="off"
					className="inp"
					/>								
					<label htmlFor="sleep_time" className="label">
					SLEEP TIME (ms)
					</label>
					<div className="btn">
					<button
						type="button"
						className="updn ico-up"
						name="sleep_time"
						onClick={({ currentTarget: { name } }) => {
							let data_count_p = common.increaseStringValue(common.removeComma(sleep_time), 1000, 1000000);
							set_sleep_time ( common.pricisionFormat_Precision(data_count_p, 0) );
						}}
					>
						Plus price
					</button>
					<button
						type="button"
						className="updn ico-dn"
						name="sleep_time"
						onClick={({ currentTarget: { name } }) => {
							let data_count_p = common.decreaseStringValue(common.removeComma(sleep_time), 1000, 0);
							set_sleep_time ( common.pricisionFormat_Precision(data_count_p, 0) );
						}}
					>
						Minus price
					</button>
					</div>
				</div>					
				<div className="form-fld has-label has-btn">
					<input
					name="data_count"
					id="data_count"
					value={data_count}
					onChange={({ target: { name, value } }) => {
						set_data_count(value);
					}}
					onClick={({ target: { name, value } }) => set_data_count(value)}
					onBlur={({ target: { name, value } }) =>
						set_data_count(value)
					}
					placeholder="건수"
					autoComplete="off"
					className="inp"
					/>								
					<label htmlFor="data_count" className="label">
					초당 전송 데이터 건수
					</label>
					<div className="btn">
					<button
						type="button"
						className="updn ico-up"
						name="data_count"
						onClick={({ currentTarget: { name } }) => {
							let data_count_p = common.increaseStringValue(common.removeComma(data_count), 10000, 50000000);
							set_data_count ( common.pricisionFormat_Precision(data_count_p, 0) );
						}}
					>
						Plus price
					</button>
					<button
						type="button"
						className="updn ico-dn"
						name="data_count"
						onClick={({ currentTarget: { name } }) => {
							let data_count_p = common.decreaseStringValue(common.removeComma(data_count), 10000, 10000);
							set_data_count ( common.pricisionFormat_Precision(data_count_p, 0) );
						}}
					>
						Minus price
					</button>
					</div>
				</div>				
			</div>	
				
			<Popconfirm title={"가상거래소를 시작합니다."} onConfirm={onVirtualMarket} okText={virtual_market} cancelText="취소">
				<button type="button" className={"button " + btn_color}>
				{virtual_market}
				</button>
			</Popconfirm>	

			<Modal
				title="마스터 강제 업데이트를 실행합니다."
				centered
				open={modal_force_master}
				onOk={onMasterUpdate}
				onCancel={() => set_modal_force_master(false)}
			>
				<p>처리시간이 약 1-3초정도 소요됩니다.</p>
			</Modal>			
		</div>			
	</div>
	</>
  )
}

export default Status
