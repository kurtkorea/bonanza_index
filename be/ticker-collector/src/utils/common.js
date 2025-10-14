"use strict";

const zlib = require('zlib');

// 메시지 객체 정의
const message = {
	missing_request: {
		code: 400,
		msg: "Missing request parameters"
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
	param_require: {
		code: 400,
		msg: "Required parameters missing"
	},
	server_error: {
		code: 500,
		msg: "Internal server error"
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

const RECONNECT_INTERVAL = 200;

function gzipCompressToBase64(str, callback) {
	zlib.gzip(Buffer.from(str, 'utf8'), (err, buf) => {
	  if (err) return callback(err);
	  callback(null, buf.toString('base64'));
	});
  }
  
  function gzipDecompressFromBase64(b64, callback) {
	const buf = Buffer.from(b64, 'base64');
	zlib.gunzip(buf, (err, out) => {
	  if (err) return callback(err);
	  callback(null, out.toString('utf8'));
	});
  }

module.exports = {
	gzipCompressToBase64,
	gzipDecompressFromBase64,
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
	RECONNECT_INTERVAL,
};
