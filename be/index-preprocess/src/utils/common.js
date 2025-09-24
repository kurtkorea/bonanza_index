"use strict";

// 메시지 객체 정의
const message = {
	missing_request: {
		code: 400,
		msg: "Missing request parameters"
	},
	server_error: {
		code: 500,
		msg: "Internal server error"
	},
	token_expire: {
		code: 420,
		msg: "Token expired"
	},
	token_invalid: {
		code: 401,
		msg: "Invalid token"
	},
	token_permission: {
		code: 403,
		msg: "Insufficient permissions"
	},
	validation_error: {
		code: 422,
		msg: "Validation error"
	},
	not_found: {
		code: 404,
		msg: "Resource not found"
	}
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

const MARKET_NO = Object.freeze({
	UPBIT: 101,
	BITHUMB: 102,
	KORBIT: 103,
	COINONE: 104
});

// enum 형태로 변경 (ES6의 객체 freeze를 활용한 유사 enum)
const MARKET_NO_ENUM = Object.freeze({
	UPBIT: 101,
	BITHUMB: 102,
	KORBIT: 103,
	COINONE: 104
});

const MARKET_NAME_ENUM = Object.freeze({
	UPBIT: "UPBIT",
	BITHUMB: "BITHUMB",
	KORBIT: "KORBIT",
	COINONE: "COINONE"
});

module.exports = {
	isEmpty,
	respMsg,
	respData,
	respMsgStr,
	symbolMap,
	open_orders,
	positions,
	message,
	MARKET_NO_ENUM,
	MARKET_NAME_ENUM,
};
