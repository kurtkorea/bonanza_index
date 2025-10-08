import { message } from "antd";
import axios from "axios";
import { put, select, takeEvery } from "redux-saga/effects";
import common from "../../common";

import { sha256 } from 'js-sha256';

function* userInit() {

	console.log("userInit");

	window.websocketWorker.postMessage({
		type: "websocket-subscribe",
		payload: {
			name: "fkbrti",
			url: "/topic/fkbrti",
			// user_id: "test001",
			// manage: "TEST",
		},
	});

	const { login, username, password, account, broker_id, name,   } = yield select(
		({ UserReducer: { login, username, password, account, broker_id, name, } }) => ({
			login,
			username,
			password,
			account,
			broker_id,
			name,
		}),
	);
	if (login) {
		yield put({
			type: "user/login/success",
			payload: {
				username: username,
				password: password,
				account: account,
				broker_id: broker_id,
				name: name,
			},
		});
	}


}

function* userLogin({ payload }) {
	try {
		payload.username = payload.username.trim();

		yield put({
			type: "user/login/success",
			payload : {
				username: 'test001',
				password: '1234',
				account: '1234',
				broker_id: '1234',
				name: '1234',					
			}
		});	

		return;

		const encodePassword = sha256.update(payload.password).hex();
		const loginResult = yield axios.post("/service/v1/login", {
			id: payload.username,
			password: encodePassword,
		});

		if (loginResult.data.result === true) {

			if (payload.remember) {
				localStorage.setItem(
					"storedLogin",
					JSON.stringify({
						username: loginResult.data.id,
						password: encodePassword,
						account: loginResult.data.account,
						broker_id: loginResult.data.broker_id,
						name: loginResult.data.id,
					}),
				);
			} else {
				localStorage.removeItem("storedLogin");
			}
			yield put({
				type: "user/login/success",
				payload : {
					username: loginResult.data.id,
					password: encodePassword,
					account: loginResult.data.account,
					broker_id: loginResult.data.broker_id,
					name: loginResult.data.id,					
				}
			});	
		} else {
			message.error(loginResult.data.message);
			yield put({
				type: "user/login/failure",
			});
		}
	} catch (error) {
		yield put({
			type: "user/login/failure",
		});
	}
}

function* userLogout() {

	const { username  } = yield select(
		({ UserReducer: { username } }) => ({
			username
		}),
	);	

	if (window.websocketWorker) {
		window.websocketWorker.postMessage({
			type: "websocket-unsubscribe",
			payload: {
				name: "master",
				user_id: username,
			},
		});				
		window.websocketWorker.postMessage({
			type: "websocket-unsubscribe",
			payload: {
				name: "market",
				user_id: username,
			},
		});		
		window.websocketWorker.postMessage({
			type: "websocket-unsubscribe",
			payload: {
				name: "pnl",
				user_id: username,
			},
		});
		window.websocketWorker.postMessage({
			type: "websocket-unsubscribe",
			payload: {
				name: "response",
				user_id: username,
			},
		});
		window.websocketWorker.postMessage({
			type: "websocket-unsubscribe",
			payload: {
				name: "notice",
				user_id: username,
			},
		});

		localStorage.removeItem("storedLogin");
		sessionStorage.removeItem("jwt");
		// const chatWebsocket = yield select(({ ChatReducer: { chatSocket } }) => chatSocket);
		// chatWebsocket.postMessage({
		// 	type: "websocket-unsubscribe",
		// 	payload: {
		// 		name: "chat",
		// 	},
		// });
	}
	yield put({ type: "chat/list/set", payload: [] });
	// yield put(push("/"));
}

function* userLoginSuccess({ payload }) {
	try {
		if (window.websocketWorker) {
			window.websocketWorker.postMessage({
				type: "websocket-subscribe",
				payload: {
					name: "pnl",
					url: "/topic/pnl/" + payload.username,
					user_id: payload.username,
				},
			});

			window.websocketWorker.postMessage({
				type: "websocket-subscribe",
				payload: {
					name: "master",
					url: "/topic/master",
					user_id: payload.username,
				},
			});			

			window.websocketWorker.postMessage({
				type: "websocket-subscribe",
				payload: {
					name: "market",
					url: "/topic/market",
					user_id: payload.username,
				},
			});			
			
			window.websocketWorker.postMessage({
				type: "websocket-subscribe",
				payload: {
					name: "order",
					url: "/topic/order/" + payload.account,
					user_id: payload.username,
				},
			});			

			window.websocketWorker.postMessage({
				type: "websocket-subscribe",
				payload: {
					name: "position",
					url: "/topic/position/" + payload.account,
					user_id: payload.username,
				},
			});					
			
			window.websocketWorker.postMessage({
				type: "websocket-subscribe",
				payload: {
					name: "notice",
					url: "/topic/notice",
					user_id: payload.username,
				},
			});				
		}
	} catch (error) {
		console.log(error);
	}
}

export default [
	takeEvery("init", userInit),
	takeEvery("user/login", userLogin),
	takeEvery("user/logout", userLogout),
	takeEvery("user/login/success", userLoginSuccess),
];


