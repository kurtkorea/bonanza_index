"use strict";

// 메시지 객체 정의
const message = {
	missing_request: {
		code: 400,
		msg: "Missing request parameters"
	}
	// 다른 메시지들도 여기에 추가 가능
};

function isEmpty(str) {
	if (str === undefined || str === null || str === "") {
		return true;
	}
	return false;
}

// 공통 유틸리티 함수들
const respMsg = (resp, msg_key = "missing_request", add_msg = "") => {
	if (message[msg_key]) {
		return resp.status(message[msg_key].code).json({ message: message[msg_key].msg + add_msg });
	}
	return resp.status(message["missing_request"].code).json({ message: message["missing_request"].msg });
};

const respData = (resp, msg_key = "missing_request", add_data = {}) => {
	if (message[msg_key]) {
		return resp.status(message[msg_key].code).json({ ...add_data, message: message[msg_key].msg });
	}
	return resp.status(message["missing_request"].code).json({ message: message["missing_request"].msg });
};

const respMsgStr = (msg_key = "missing_request") => {
	if (message[msg_key]) {
		return message[msg_key].msg;
	}
	return message["missing_request"].msg;
};

// 전역 상태 관리
var symbolMap = new Map();
var open_orders = new Map();
var positions = new Map();

module.exports = {
	isEmpty,
	respMsg,
	respData,
	respMsgStr,
	symbolMap,
	open_orders,
	positions,
	message
};
