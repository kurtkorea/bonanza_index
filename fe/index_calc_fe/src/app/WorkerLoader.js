import { message, notification } from "antd";
import moment from "moment";
import React, { useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import common from "../common";
import { RiseOutlined } from '@ant-design/icons';
import index from "../common/index"

import { useQuery, useQueryClient } from "react-query";

const WorkerLoader = ({ children }) => {

	const dispatch = useDispatch();

	useEffect(() => {

	}, []);

	useEffect(() => {
		if (window.Worker) {
			window.websocketWorker = new Worker("/worker/websocketWorker.js");
			window.websocketWorker.postMessage({
				type: "websocket-connect",
				payload: {
					url: process.env.SERVICE + "/ws",
				},
			});
			window.websocketWorker.onmessage = ({ data: { type, data } }) => {
				// console.log("websocketWorker-onmessage", type, data);
				switch (type) {
					case "fkbrti":
						// /topic/fkbrti_1sec 데이터 수신 처리
						dispatch({ type: "fkbrti/update", payload: data });
						break;
					default:
						break;
				}
			};
		} else {
			alert("Not supported browser.");
		}
		dispatch({ type: "init" });
	}, []);

	useEffect(() => {

	}, []);

	return children;
};

export default WorkerLoader;
