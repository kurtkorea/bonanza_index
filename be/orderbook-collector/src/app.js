//set server env

"use strict";

const logger = require('./utils/logger.js');
const path = require("path");
const dotenv = require("dotenv");
const fs = require('fs');
const { connect_quest_db, quest_db } = require('./db/quest_db.js');
const { systemlog_schema } = require('./ddl/systemlog_ddl.js');
const { report_schema } = require('./ddl/report_ddl.js');
const { sendTelegramMessage } = require('./utils/telegram_push.js');
const { initializeWebsocketClients } = require('./service/websocket_broker.js');
const { respMsg } = require('./utils/common.js');
const commandRouter = require('./router/command.js');
const express = require("express");
const app = express();
const morgan = require("morgan");
const IndexProcessInfo = require('./models/index_process_info.js');

// 명령줄 인수에서 process_id 추출
// 사용법: node app.js --process-id=my-process-id
// 또는: node app.js my-process-id
let process_id = null;

const args = process.argv.slice(2);
for (const arg of args) {
	if (arg.startsWith('--process-id=')) {
		process_id = arg.split('=')[1];
		break;
	} else if (arg === '--process-id' && args.indexOf(arg) + 1 < args.length) {
		process_id = args[args.indexOf(arg) + 1];
		break;
	} else if (!arg.startsWith('--') && !process_id) {
		// --로 시작하지 않는 첫 번째 인수를 process_id로 간주
		process_id = arg;
		break;
	}
}

try {
	if (process.env.NODE_ENV === "production") {
		const envPath = path.join(__dirname, "../env/prod.env");
		if (fs.existsSync(envPath)) {
			const result = dotenv.config({ path: envPath });
			if (result.error) {
				logger.error({ ex: "APP", err: String(result.error) }, "Error loading production env file:");
			} else {
				logger.info('Production environment loaded successfully');
			}
		} else {
			logger.warn({ ex: "APP", err: envPath }, "Production env file not found:");
			logger.info('Continuing without env file...');
		}
	} else {
		const envPath = path.join(__dirname, "../env/dev.env");
		logger.info({ ex: "APP", err: envPath }, "Development env file path:");
		if (fs.existsSync(envPath)) {
			const result = dotenv.config({ path: envPath });
			if (result.error) {
				logger.error({ ex: "APP", err: String(result.error) }, "Error loading development env file:");
			} else {
				logger.info('Development environment loaded successfully');
			}
		} else {
			logger.warn({ ex: "APP", err: envPath }, "Development env file not found:");
			logger.info('Continuing without env file...');
		}
	}
} catch (envError) {
	logger.error({ ex: "APP", err: String(envError) }, "Fatal error loading environment variables:");
	console.error('[APP] Error name:', envError.name);
	logger.error({ ex: "APP", err: String(envError.name) }, "Error name:");
	logger.error({ ex: "APP", err: String(envError.message) }, "Error message:");
	logger.error({ ex: "APP", err: String(envError.stack) }, "Error stack:");
	logger.info('Continuing without env file...');
}

// 명령줄 인수에서 process_id를 찾지 못한 경우 환경 변수에서 읽어오기
if (!process_id && process.env.PROCESS_ID) {
	process_id = process.env.PROCESS_ID;
	logger.info({ process_id }, "Process ID loaded from environment variable:");
}

// process_id 설정 및 출력
if (process_id) {
	global.process_id = process_id; // 전역 변수로 설정하여 다른 모듈에서 사용 가능
	logger.info({ process_id }, "Process ID initialized:");
} else {
	logger.warn("No process_id provided. Use --process-id=<id>, pass as first argument, or set PROCESS_ID in env file.");
}

app.set("port", process.env.PORT || 6001);

//console log middleware
app.use(morgan("dev", { skip: (req, resp) => resp.statusCode < 400 }));

//express setting
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));


//proxy checker
if (process.env.NODE_ENV === "production") {
	app.set("trust proxy", 1);
}

// 라우터 등록
app.use("/api/command", commandRouter);

// Health check endpoint
app.get("/health", (req, res) => {
	// console.log("Health check endpoint");
	res.status(200).json({
		status: "ok",
		service: "orderbook-collector",
		timestamp: new Date().toISOString()
	});
});

//404 handling middleware
app.use((req, res) => {
	respMsg(res, "missing_request");
});

//error handling middleware
app.use((err, req, res, next) => {
	console.log(err.name, err.message);
	respMsg(res, "server_error");
});

const db_mysql = require("./models");

async function initializeApp() {
	try {
		// MySQL 데이터베이스 연결 및 동기화를 먼저 완료
		await db_mysql.sequelize.sync({ force: false });
		logger.info("[MySQL] Database connection has been established successfully.");

		await connect_quest_db(process.env.QDB_HOST, process.env.QDB_PORT);
		await systemlog_schema(quest_db);
		await report_schema(quest_db);

		const process_info = await IndexProcessInfo.getProcessInfo(global.process_id);
		if (process_info) {	
			const process_info_json = JSON.parse(process_info.process_info);
			logger.info("Process info found:\n" + JSON.stringify(process_info_json, null, 2));
			
			// 병렬적으로 모든 상세 정보를 fetch하고 결과를 모아서 initializeWebsocketClients 실행
			const process_info_detail_list = [];
			for (let idx = 0; idx < process_info_json.length; idx++) {
				const item = process_info_json[idx];
				logger.info(`Process info [${idx}]: ${JSON.stringify(item)}`);

				const process_info_detail = await IndexProcessInfo.getProcessInfoDetail(item.exchange_cd, item.price_id, item.product_id);
				logger.info(`Process info detail: ${JSON.stringify(process_info_detail, null, 2)}`);
				if ( process_info_detail.length > 0 ) {
					process_info_detail_list.push(process_info_detail[0]);
				}
			}
			console.log("process_info_detail_list !!!!!!!!!!!!!!!!!!!!!", process_info_detail_list);
			initializeWebsocketClients(process_info_detail_list);
			logger.info('WebSocket clients initialized successfully');
		} else {
			logger.error({ process_id: global.process_id }, "process_info not found. Please check the process_id.");
			process.exit(1);
		}
		
		await sendTelegramMessage("system", "OrderBook-Collector Initialization.");
		logger.info('Application initialization completed successfully');
	} catch (error) {
		logger.error({ ex: "APP", err: String(error) }, "Application initialization failed:");
		logger.error({ ex: "APP", err: String(error.name) }, "Error name:");
		logger.error({ ex: "APP", err: String(error.message) }, "Error message:");
		logger.error({ ex: "APP", err: String(error.stack) }, "Error stack:");
		process.exit(1);
	}
}

initializeApp().catch((error) => {
	logger.error({ ex: "APP", err: String(error) }, "Unhandled error in initializeApp():");
	logger.error({ ex: "APP", err: String(error.name) }, "Error name:");
	logger.error({ ex: "APP", err: String(error.message) }, "Error message:");
	logger.error({ ex: "APP", err: String(error.stack) }, "Error stack:");
	process.exit(1);
});

async function handleAppShutdown(signal) {
	try {
		await sendTelegramMessage("system", `[${signal}] OrderBook-Collector shutting down.`);
	} catch (e) {
		logger.error({ ex: "APP", err: String(e) }, "Failed to send shutdown telegram notification:");
	}
	process.exit(0);
}	

app.listen(app.get("port"), '0.0.0.0', () => {
	logger.info(`🚀 REST API Server started: http://0.0.0.0:${app.get("port")}`);
	logger.info('[APP] Express server started successfully');
});

process.on('SIGINT', () => handleAppShutdown('SIGINT'));
process.on('SIGTERM', () => handleAppShutdown('SIGTERM'));


