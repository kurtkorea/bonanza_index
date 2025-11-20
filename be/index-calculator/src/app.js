//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const http = require('http');
const logger = require('./utils/logger');
// const { send_push, getZMQStatus, healthCheckZMQ } = require("./utils/zmq-sender-push.js");

// const { UpbitClient, BithumbClient, KorbitClient, CoinoneClient } = require('./service/websocket_broker.js');

const { start_fkbrti_engine, init_zmq_depth_subscriber, init_zmq_ticker_subscriber } = require('./service/zmq-data-sub.js');
const { connect, db } = require("./db/db.js");
const { fkbrti_1sec_schema } = require('./ddl/fkbrti_1sec_ddl.js');

const { init_zmq_pub } = require('./service/zmq-sender-pub.js');

// Start of Selection
global.logging = false;
global.sock = null;

// 전역 에러 핸들러 설정
process.on('uncaughtException', (error) => {
    logger.error({ ex: "APP", err: error.message, stack: error.stack }, "Uncaught Exception:");
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error({ ex: "APP", err: String(reason) }, "Unhandled Rejection:");
});

if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "../env/prod.env") });
} else {
	dotenv.config({ path: path.join(__dirname, "../env/dev.env") });
}
const express = require("express");
const app = express();
// const server = require("http").createServer(app);

app.set("port", process.env.PORT || 6001);

var message = {};

const cors = require("cors");
const morgan = require("morgan");

//cors setting
app.use(cors({ 
	origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*", 
	credentials: true 
}));

//db connection
// const { sequelize, Message } = require("../models");
// sequelize
// 	.sync({ force: false })
// 	.then(() => console.log("DB 연결 성공"))
// 	.catch((err) => console.log("DB 연결 실패", err));

//console log middleware
app.use(morgan("dev", { skip: (req, resp) => resp.statusCode < 400 }));

//express setting
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

//proxy checker
if (process.env.NODE_ENV === "production") {
	app.set("trust proxy", 1);
}

//routers
const { respMsg } = require("./utils/common");
const commandRouter = require("./router/command");

// 라우터 등록
app.use("/api/command", commandRouter);

// Health check endpoint
app.get("/health", (req, res) => {
	res.status(200).json({
		status: "ok",
		service: "index-calculator",
		timestamp: new Date().toISOString()
	});
});

//discovery register
// const discovery = require("./discovery");
// if (process.env.NODE_ENV === "production") {
// 	discovery.init(app);
// }

//404 handling middleware
app.use((req, res) => {
	respMsg(res, "missing_request");
});

//error handling middleware
app.use((err, req, res, next) => {
	logger.error({ 
		ex: "APP", 
		err: `${err.name}: ${err.message}`, 
		stack: err.stack,
		url: req.url,
		method: req.method
	}, "서버 에러 발생:");
	respMsg(res, "server_error");
});

async function initializeApp() {
	try {
		logger.info('애플리케이션 초기화 시작...');

		// 환경 변수 검증
		if (!process.env.ZMQ_SUB_DEPTH_HOST) {
			throw new Error('ZMQ_SUB_DEPTH_HOST 환경 변수가 설정되지 않았습니다.');
		}

		if (!process.env.ZMQ_SUB_TICKER_HOST) {
			throw new Error('ZMQ_SUB_TICKER_HOST 환경 변수가 설정되지 않았습니다.');
		}

		// DB 연결
		logger.info('DB 연결 중...');
		await connect();
		await fkbrti_1sec_schema(db);
		logger.info('DB 연결 완료');

		logger.info('ZMQ 초기화 중...');

		await Promise.all([
			init_zmq_pub(),
			init_zmq_depth_subscriber(),
			init_zmq_ticker_subscriber(),
			start_fkbrti_engine(),
		]);

		logger.info('ZMQ 초기화 완료');
		logger.info('애플리케이션 초기화 완료');
	} catch (error) {
		logger.error({ ex: "APP", err: String(error), stack: error.stack }, "애플리케이션 초기화 실패:");
		process.exit(1);
	}
}

initializeApp().catch((error) => {
	logger.error({ ex: "APP", err: String(error), stack: error.stack }, "Unhandled error in initializeApp():");
	process.exit(1);
});

app.listen(app.get("port"), '0.0.0.0', () => {
	logger.info(`🚀 REST API 서버 실행: http://0.0.0.0:${app.get("port")}`);
});

