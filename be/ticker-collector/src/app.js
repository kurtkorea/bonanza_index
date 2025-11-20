//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const http = require('http');
const log = require('./utils/logger');

const { connect, db } = require('./db/db.js');

// 각 프로젝트의 ddl 폴더를 우선적으로 사용
// 프로덕션: process.cwd()는 /app이므로 /app/src/ddl
// 로컬: __dirname은 .../ticker-collector/src이므로 ./ddl (ticker-collector/src/ddl)
const path = require('path');
const fs = require('fs');
let ddlPath = null;
const possiblePaths = [
  path.join(__dirname, './ddl'), // 로컬: ticker-collector/src/ddl (우선)
  path.join(process.cwd(), 'src/ddl'), // 프로덕션: /app/src/ddl (우선)
  path.join(process.cwd(), 'ddl'), // 프로덕션: /app/ddl (대안)
  path.join(__dirname, '../ddl'), // 로컬: ticker-collector/ddl (대안)
  path.join(__dirname, '../../ddl'), // 로컬: be/ddl (fallback)
];

for (const testPath of possiblePaths) {
  const testFile = path.join(testPath, 'systemlog_ddl.js');
  if (fs.existsSync(testFile)) {
    ddlPath = testPath;
    break;
  }
}

if (!ddlPath) {
  throw new Error(`DDL folder not found. Tried paths: ${possiblePaths.join(', ')}`);
}

console.log('[APP] DDL path:', ddlPath);
const { systemlog_schema } = require(path.join(ddlPath, 'systemlog_ddl.js'));
const  { sendTelegramMessage } = require('./utils/telegram_push.js')


const { UpbitClientTrade, BithumbClientTrade, KorbitClientTrade, CoinoneClientTrade } = require('./service/websocket_trade_broker.js');
// const { UpbitClientTicker, BithumbClientTicker, KorbitClientTicker, CoinoneClientTicker } = require('./service/websocket_ticker_broker.js');

// Start of Selection
global.logging = false;
global.sock = null;

if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "../env/prod.env") });
	global.logging = false;
} else {
	dotenv.config({ path: path.join(__dirname, "../env/dev.env") });
	global.logging = true;
}
const express = require("express");
const app = express();
// const server = require("http").createServer(app);

app.set("port", process.env.PORT || 6002);

var message = {};

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
	console.log(err.name, err.message);
	respMsg(res, "server_error");
});

async function initializeApp() {
	try {
		await connect(process.env.QDB_HOST, process.env.QDB_PORT);
		await systemlog_schema(db);
		await sendTelegramMessage ( "SYSTEM", "Ticker-Collector Initialization.");
	} catch (error) {
		console.error('Application initialization failed:', error);
		process.exit(1);
	}
}

initializeApp();

async function handleAppShutdown(signal) {
	try {
		await sendTelegramMessage( "SYSTEM", `[${signal}] Ticker-Collector shutting down.`);
	} catch (e) {
		console.error('Failed to send shutdown telegram notification:', e);
	}
	process.exit(0);
}

app.listen(app.get("port"), '0.0.0.0', () => {
	console.log(`🚀 REST API 서버 실행: http://0.0.0.0:${app.get("port")}`);
});

process.on('SIGINT', () => handleAppShutdown('SIGINT'));
process.on('SIGTERM', () => handleAppShutdown('SIGTERM'));