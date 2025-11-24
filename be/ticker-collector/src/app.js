//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const { connect_quest_db, quest_db } = require('./db/quest_db.js');
const { systemlog_schema } = require('./ddl/systemlog_ddl.js');
const { report_schema } = require('./ddl/report_ddl.js');
const  { sendTelegramMessage } = require('./utils/telegram_push.js')
const logger = require('./utils/logger.js');
const { initializeWebsocketClients } = require('./service/websocket_broker.js');
const IndexProcessInfo = require('./models/index_process_info.js');

// const { UpbitClientTrade, BithumbClientTrade, KorbitClientTrade, CoinoneClientTrade } = require('./service/websocket_trade_broker.js');
// const { UpbitClientTicker, BithumbClientTicker, KorbitClientTicker, CoinoneClientTicker } = require('./service/websocket_ticker_broker.js');

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

if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "../env/prod.env") });
} else {
	dotenv.config({ path: path.join(__dirname, "../env/dev.env") });
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
const express = require("express");
const app = express();
// const server = require("http").createServer(app);

app.set("port", process.env.PORT || 6002);

const cors = require("cors");
const morgan = require("morgan");

//cors setting
app.use(cors({ 
	origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*", 
	credentials: true 
}));

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
		service: "ticker-collector",
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
	logger.error({ ex: "APP", err: err.message, name: err.name, stack: err.stack }, "Error handling middleware");
	respMsg(res, "server_error");
});

const db_mysql = require("./models");

async function initializeApp() {
	try {

		await db_mysql.sequelize.sync({ force: false });
		logger.info("[MySQL] Database connection has been established successfully.");

		await connect_quest_db();
		await systemlog_schema(quest_db);
		await report_schema(quest_db);
		await sendTelegramMessage ( "SYSTEM", "Ticker-Collector Initialization.");

		const process_info = await IndexProcessInfo.getProcessInfo(process.env.PROCESS_ID);
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

			initializeWebsocketClients(process_info_detail_list);
			// initializeClients(process_info_detail_list);
			logger.info('WebSocket clients initialized successfully');
		} else {
			logger.error({ process_id: global.process_id }, "process_info not found. Please check the process_id.");
			process.exit(1);
		}
	} catch (error) {
		logger.error({ ex: "APP", err: String(error), stack: error.stack }, 'Application initialization failed');
		process.exit(1);
	}
}

initializeApp();

async function handleAppShutdown(signal) {
	try {
		await sendTelegramMessage( "SYSTEM", `[${signal}] Ticker-Collector shutting down.`);
	} catch (e) {
		logger.error({ ex: "APP", err: String(e), stack: e.stack }, 'Failed to send shutdown telegram notification');
	}
	process.exit(0);
}

app.listen(app.get("port"), '0.0.0.0', () => {
	logger.info({ ex: "APP", port: app.get("port") }, `🚀 REST API Server started: http://0.0.0.0:${app.get("port")}`);
});

process.on('SIGINT', () => handleAppShutdown('SIGINT'));
process.on('SIGTERM', () => handleAppShutdown('SIGTERM'));