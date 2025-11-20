//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const http = require('http');
const log = require('./utils/logger');
const { connect, db } = require('./db/db.js');
const { systemlog_schema } = require('../../ddl/systemlog_ddl.js');
const { report_schema } = require('../../ddl/report_ddl.js');

const  { sendTelegramMessage } = require('./utils/telegram_push.js')

const { initializeClients } = require('./service/websocket_order_book_broker.js');

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

app.set("port", process.env.PORT || 6001);

const morgan = require("morgan");

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
	console.log("Health check endpoint");
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

async function initializeApp() {
	try {
		await connect(process.env.QDB_HOST, process.env.QDB_PORT);
		await systemlog_schema(db);
		await report_schema(db);
		
		// DB 연결 완료 후 클라이언트 초기화		
		initializeClients();
		
		await sendTelegramMessage("system", "OrderBook-Collector Initialization.");
	} catch (error) {
		console.error('Application initialization failed:', error);
		process.exit(1);
	}
}

initializeApp();

async function handleAppShutdown(signal) {
	try {
		await sendTelegramMessage("system", `[${signal}] OrderBook-Collector shutting down.`);
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


