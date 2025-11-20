//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const http = require('http');
const logger = require('./utils/logger');

const { connect, db } = require("./db/db.js");
const { systemlog_schema } = require('./ddl/systemlog_ddl.js');

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
const server = require("http").createServer(app);
app.set("port", process.env.PORT || 3000);

const cors = require("cors");
const morgan = require("morgan");


//cors setting
const corsOptions = {
    origin: process.env.CORS_ORIGIN === '*' ? true : process.env.CORS_ORIGIN.split(","),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Token', 'Ip', 'Mac', 'Dnt', 'Sec-Ch-Ua', 'Sec-Ch-Ua-Mobile', 'Sec-Ch-Ua-Platform', 'User-Agent', 'Accept', 'Referer']
};
app.use(cors(corsOptions));

//db connection
// const { sequelize, Message } = require("../models");
// sequelize
// 	.sync({ force: false })
// 	.then(() => console.log("DB 연결 성공"))
// 	.catch((err) => console.log("DB 연결 실패", err));

//console log middleware
app.use(morgan("dev", { skip: (req, resp) => resp.statusCode < 400 }));

//express setting
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(express.json({ limit: "5mb" }));


//proxy checker
if (process.env.NODE_ENV === "production") {
	app.set("trust proxy", 1);
}

//routers
const { respMsg } = require("./utils/common");
const telegramRouter = require("./router/telegram.js");

// 라우터 등록
app.use("/v1/telegram", telegramRouter);

// Health check endpoint
app.get("/health", (req, res) => {
	res.status(200).json({
		status: "ok",
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
	logger.warn({ method: req.method, url: req.url }, "404 Not Found:");
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
		logger.info('[APP] 데이터베이스 연결 중...');
		await connect(process.env.QDB_HOST, process.env.QDB_PORT);
		logger.info('[APP] 데이터베이스 스키마 생성 중...');
		await systemlog_schema(db);
		logger.info('[APP] 애플리케이션 초기화 완료');

		logger.info({
			hasTelegramLogToken: !!process.env.TELEGRAM_LOG_TOKEN,
			hasTelegramStatusLogToken: !!process.env.TELEGRAM_STATUS_LOG_TOKEN
		}, "Telegram 설정 확인:");
	} catch (error) {
		logger.error({ ex: "APP", err: String(error), stack: error.stack }, "애플리케이션 초기화 실패:");
		process.exit(1);
	}
}

initializeApp().catch((error) => {
	logger.error({ ex: "APP", err: String(error), stack: error.stack }, "Unhandled error in initializeApp():");
	process.exit(1);
});

server.listen(app.get("port"), async () => {
	try {

	} catch (err) {
		logger.error({ ex: "APP", err: `${err.name}: ${err.message}` }, "Server listen error:");
	}
	logger.info(`SERVER_PORT : ${app.get("port")}`);
});



