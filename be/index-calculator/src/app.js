//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const http = require('http');
const logger = require('./utils/logger');

const { init_zmq_depth_subscriber, init_zmq_ticker_subscriber } = require('./utils/zmq-data-sub.js');
const { connect_quest_db, quest_db } = require("./db/quest_db.js");
const { fkbrti_1sec_schema } = require('./ddl/fkbrti_1sec_ddl.js');
// fkbrti_summary는 MySQL을 사용하므로 QuestDB DDL 제거

const { init_zmq_pub } = require('./utils/zmq-sender-pub.js');
const { SummaryScheduler } = require('./service/summary_scheduler.js');

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
const batchRouter = require("./router/batch");

// 라우터 등록
app.use("/api/command", commandRouter);
app.use("/api/batch", batchRouter);

// Health check endpoint
app.get("/health", (req, res) => {
	res.status(200).json({
		status: "ok",
		service: "index-calculator",
		timestamp: new Date().toISOString()
	});
});

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

const db_mysql = require("./models");

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

		// DB 연결 (재시도 로직 포함)
		logger.info('DB 연결 중...');
		let dbConnected = false;
		let retryCount = 0;
		const maxRetries = 3;
		
		while (!dbConnected && retryCount < maxRetries) {
			try {
				// 먼저 연결 테스트
				await db_mysql.sequelize.authenticate();
				logger.info("[MySQL] Database connection authenticated successfully.");
				
				// 테이블 동기화
				await db_mysql.sequelize.sync({ force: false });
				logger.info("[MySQL] Database connection has been established successfully.");
				dbConnected = true;
			} catch (error) {
				retryCount++;
				if (retryCount >= maxRetries) {
					logger.error({ ex: "APP", err: String(error), stack: error.stack, retryCount }, "MySQL 연결 실패 (최대 재시도 횟수 초과)");
					throw error;
				}
				logger.warn({ ex: "APP", err: String(error), retryCount, maxRetries }, `MySQL 연결 실패, ${retryCount}/${maxRetries} 재시도 중...`);
				await new Promise(resolve => setTimeout(resolve, 5000 * retryCount)); // 지수 백오프
			}
		}

		await connect_quest_db();
		await fkbrti_1sec_schema(quest_db);
		// fkbrti_summary는 MySQL을 사용하므로 QuestDB DDL 호출 제거
		logger.info('QuestDB 연결 완료');

		const query = `SELECT EXCHANGE_CD FROM tb_exchange`;
		const subscribe_exchange = await db_mysql.sequelize.query(query, { type: db_mysql.Sequelize.QueryTypes.SELECT });
		// logger.info({ subscribe_exchange }, "구독목록");

		// ZMQ Publisher 초기화 (동기적으로 완료 대기)
		await init_zmq_pub();
		
		// ZMQ Subscriber들은 무한 루프이므로 백그라운드에서 실행 (Promise.all에서 제외)
		// 에러가 발생해도 앱이 크래시되지 않도록 catch 처리
		init_zmq_depth_subscriber(subscribe_exchange).catch((error) => {
			logger.error({ ex: "APP", err: String(error), stack: error.stack }, "ZMQ Depth Subscriber 초기화 실패:");
		});
		
		init_zmq_ticker_subscriber(subscribe_exchange).catch((error) => {
			logger.error({ ex: "APP", err: String(error), stack: error.stack }, "ZMQ Ticker Subscriber 초기화 실패:");
		});

		logger.info('ZMQ 초기화 완료');

		// Summary Scheduler 초기화
		const summarySymbols = process.env.SUMMARY_SYMBOLS 
			? process.env.SUMMARY_SYMBOLS.split(',').map(s => s.trim())
			: ['KRW-BTC'];
		const summaryEnabled = process.env.SUMMARY_ENABLED !== 'false';
		const summaryIntervalMs = Number(process.env.SUMMARY_INTERVAL_MS || 60 * 60 * 1000); // 기본 1시간

		if (summaryEnabled) {
			const summaryScheduler = new SummaryScheduler({
				intervalMs: summaryIntervalMs,
				symbols: summarySymbols,
				enabled: true
			});
			global.summaryScheduler = summaryScheduler;
			
			// try {
			// 	await summaryScheduler.execute();
			// } catch (error) {
			// 	logger.error({
			// 		err: String(error),
			// 		stack: error.stack
			// 	}, 'Summary 초기 계산 중 오류 발생 (계속 진행)');
			// 	// 초기 계산 실패해도 프로세스는 계속 진행
			// }
			
			// 스케줄러 시작 (주기적 실행)
			summaryScheduler.start();
			
			logger.info({
				intervalMs: summaryIntervalMs,
				symbols: summarySymbols
			}, 'Summary Scheduler 초기화 및 시작 완료');
		} else {
			logger.info('Summary 기능이 비활성화되어 있습니다.');
		}

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

// 프로세스 종료 시 정리 작업
process.on('SIGTERM', () => {
	logger.info('SIGTERM 신호 수신, 정리 작업 시작...');
	if (global.summaryScheduler) {
		global.summaryScheduler.stop();
	}
	process.exit(0);
});

process.on('SIGINT', () => {
	logger.info('SIGINT 신호 수신, 정리 작업 시작...');
	if (global.summaryScheduler) {
		global.summaryScheduler.stop();
	}
	process.exit(0);
});

app.listen(app.get("port"), '0.0.0.0', () => {
	logger.info(`🚀 REST API 서버 실행: http://0.0.0.0:${app.get("port")}`);
});

