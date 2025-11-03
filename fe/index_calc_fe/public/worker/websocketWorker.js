importScripts("/js/webstomp.min.js", "/js/sockjs.min.js");

const config = {
	heartbeat: {
		incoming: 50000,
		outgoing: 50000,
	},
	binary: false,
	debug: false,
};

const header = {};

const state = {
	client: null,
	subscribeList: [],
};

self.onmessage = function ({ data: { type, payload } }) {
	// console.log("websocketWorker-onmessage", type);
	switch (type) {
		case "websocket-connect":
			websocketConnecting(
				payload.url,
				(client) => {
					state.client = client;
					if (state.subscribeList.length !== 0) {
						state.subscribeList.map((item) => {
							item.subscribe = state.client.subscribe(item.url, (message) => {
								postMessageClient(item.subscribeName, message);
							});
						});
					}
				},
				() => {
					console.log("websocketConnecting - client 연결 끊김");
					state.client = null;
				},
			);
			break;
		case "websocket-subscribe":
			console.log("websocket-subscribe", payload);
			websocketSubscribe(payload);
			break;
		case "websocket-unsubscribe":
			websocketUnsubscribe(payload.name);
			break;
		case "websocket-manage":
			websocketManage(payload);
			break;
		default:
			break;
	}
};

const postMessageClient = (type, message) => {
	postMessage({
		type,
		data: JSON.parse(message.body),
	});
};

const websocketConnecting = (endPoint, connectFunc, disconnectFunc) => {
	const client = webstomp.over(new SockJS(endPoint), config);
	console.log("websocketConnecting - client 생성됨:", client);
	client.connect(
		header,
		() => {
			setTimeout(() => {
				connectFunc(client);
			}, 0);
		},
		(error) => {
			console.log("Websocket Diconnection!!!!! Reconnect after 0.2 seconds", error);
			disconnectFunc();
			setTimeout(() => {
				websocketConnecting(endPoint, connectFunc, disconnectFunc);
			}, 200);
		},
	);
	client.onclose = () => {
		console.log("websocketConnecting - client 연결 끊김");
	};
	client.onerror = (error) => {
		console.log("websocketConnecting - client 오류 발생:", error);
	};
	client.onopen = () => {
		console.log("websocketConnecting - client 연결 성공");
	};
	client.onmessage = (message) => {
		console.log("websocketConnecting - client 메시지 수신:", message);
	};
};

const websocketSubscribe = (payload) => {
	if (state.client) {
		state.subscribeList.push({
			subscribe: state.client.subscribe(payload.url, (message) => {
				postMessageClient(payload.name, message);
			}),
			url: payload.url,
			subscribeName: payload.name,
			manage: payload.manage,
		});
	} else {
		state.subscribeList.push({
			subscribe: null,
			url: payload.url,
			subscribeName: payload.name,
			manage: payload.manage,
		});
	}
};

const websocketUnsubscribe = (subscribeName) => {
	const unsubscribeIndex = state.subscribeList.findIndex((item) => item.subscribeName === subscribeName);
	if (unsubscribeIndex !== -1) {
		if (state.subscribeList[unsubscribeIndex].subscribe) {
			state.subscribeList[unsubscribeIndex].subscribe.unsubscribe();
		}
		state.subscribeList.splice(unsubscribeIndex, 1);
	} else {
		console.log("not find unsubscribe name...", state.subscribeList);
	}
};

const websocketManage = (visibleState) => {
	if (visibleState === "hidden") {
		state.subscribeList.map((item) => {
			if (item.manage && item.subscribe) {
				item.subscribe.unsubscribe();
				item.subscribe = null;
			}
		});
	} else if (visibleState === "visible") {
		state.subscribeList.map((item) => {
			if (item.manage && item.subscribe === null && state.client) {
				item.subscribe = state.client.subscribe(item.url, (message) => {
					postMessageClient(item.subscribeName, message);
				});
			}
		});
	}
};
