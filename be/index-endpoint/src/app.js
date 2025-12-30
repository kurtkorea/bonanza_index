//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const http = require('http');
const logger = require('./utils/logger');
const { init_server } = require('./service/realmgr');
// const { send_push, getZMQStatus, healthCheckZMQ } = require("./utils/zmq-sender-push.js");

// const { UpbitClient, BithumbClient, KorbitClient, CoinoneClient } = require('./service/websocket_broker.js');

const { connect_quest_db, quest_db } = require("./db/quest_db.js");
const tb_fkbrti_1sec = require("./model_quest/tb_fkbrti_1sec.js");
const { init_zmq_pub } = require('./utils/zmq-sender-pub.js');

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

// Timezone 설정 (로컬 개발 환경과 프로덕션 환경 모두 KST로 통일)
if (!process.env.TZ) {
	process.env.TZ = 'Asia/Seoul';
}
const express = require("express");
const app = express();
const server = require("http").createServer(app);
app.set("port", process.env.PORT || 3000);

const cors = require("cors");
const morgan = require("morgan");

//swagger
const swaggerUi = require("swagger-ui-express");

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

app.use(express.static("./swagger"));
app.use(
	"/doc",
	swaggerUi.serve,
	swaggerUi.setup(null, {
		swaggerOptions: {
			url: `/swagger_autogen.json`,
		},
	}),
);

//proxy checker
if (process.env.NODE_ENV === "production") {
	app.set("trust proxy", 1);
}

// Health check endpoint (라우터 등록 전에 먼저 등록)
app.get("/health", (req, res) => {
	res.status(200).json({
		status: "ok",
		service: "index-endpoint",
		timestamp: new Date().toISOString()
	});
});

//routers
const { respMsg } = require("./utils/common");
const indexHistoryRouter = require("./router/index_history.js");
const indexCalcRouter = require("./router/index_calc.js");
const fileDownloadRouter = require("./router/file_download.js");
const commandRouter = require("./router/command.js");
const masterRouter = require("./router/master.js");
const minioAccessRouter = require("./router/minio_access.js");

// 라우터 등록
app.use("/v1/index_history", indexHistoryRouter);
app.use("/v1/index_calc", indexCalcRouter);
app.use("/v1/file_download", fileDownloadRouter);
app.use("/v1/command", commandRouter);
app.use("/v1/master", masterRouter);
app.use("/v1/minio_access", minioAccessRouter);

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

const db_mysql = require("./model_mysql");
const IndexProcessInfo = require("./model_mysql/index_process_info.js");

async function initializeApp() {
	try {
		logger.info('애플리케이션 초기화 시작...');

		await init_zmq_pub();
		logger.info('ZMQ Pub socket initialized successfully');

		// DB 연결
		logger.info('DB 연결 중...');
		await connect_quest_db();
		logger.info('DB 연결 완료');

		// 모델 초기화 및 등록
		logger.info('모델 초기화 중...');
		tb_fkbrti_1sec.init(quest_db.sequelize);
		quest_db.tb_fkbrti_1sec = tb_fkbrti_1sec;
		logger.info('모델 초기화 완료');

		const process_info = process.env.PROCESS_ID.split(",");
		for (const item of process_info) {
			const process_info_detail = await IndexProcessInfo.getProcessInfo(item);
			if (process_info_detail) {
				const process_info_detail_json = JSON.parse(process_info_detail.process_info);
				console.log(process_info_detail_json);
			}
		}

		await init_server(server, app.get("port"));

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

// server.listen(app.get("port"), async () => {
// 	try {

// 	} catch (err) {
// 		console.log(err.name, err.message);
// 	}
// 	console.log("SERVER_PORT :", app.get("port"));
// });



