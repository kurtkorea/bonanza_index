import { message } from "antd";
import axios from "axios";
import { put, select, takeEvery } from "redux-saga/effects";
import common, { getServiceUrl } from "../../common";


function* masterInit() {

	try {
		// 환경 변수 가져오기 (공통 유틸리티 함수 사용)
		const serviceUrl = getServiceUrl();
		console.log('[MasterSaga] Using SERVICE URL:', serviceUrl);
		const master_info = yield axios.get(serviceUrl + "/v1/master", {
		}).then(resp => resp.data);
		yield put({
			type: 'master/set',
			payload: {
				master_info: master_info.master_info || [],
				symbols: master_info.symbols || []
			}
		});


		if ( master_info.symbols.length > 0 ) {
			window.websocketWorker.postMessage({
				type: "websocket-subscribe",
				payload: {
					name: "fkbrti",
					url: "/topic/fkbrti/" + master_info.symbols[0],
				},
			});
		}

	} catch (error) {
		console.error("master 정보 조회 실패:", error);
		message.error("마스터 정보를 불러오는데 실패했습니다.");
	}

}

export default [
	takeEvery("master/init", masterInit),
];


