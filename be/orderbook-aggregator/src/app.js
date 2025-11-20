//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const http = require('http');
const logger = require('./utils/logger');
const { connect, db } = require('./db/db.js');
const { systemlog_schema } = require('./ddl/systemlog_ddl.js');

const  { sendTelegramMessage } = require('./utils/telegram_push.js')

const { UpbitClient, BithumbClient, KorbitClient, CoinoneClient } = require('./service/websocket_broker.js');

if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "../env/prod.env") });
} else {
	dotenv.config({ path: path.join(__dirname, "../env/dev.env") });
}
const express = require("express");
const app = express();
// const server = require("http").createServer(app);
app.set("port", process.env.PORT || 3000);

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
	res.status(200).json({
		status: "ok",
		service: "orderbook-aggregator",
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
	logger.error({ ex: "APP", err: `${err.name}: ${err.message}`, stack: err.stack }, "Error handling middleware:");
	respMsg(res, "server_error");
});

async function initializeApp() {
	try {
		await connect(process.env.QDB_HOST, process.env.QDB_PORT);
		await systemlog_schema(db);
		await sendTelegramMessage("system", "OrderBook-Aggregator Initialization.");
	} catch (error) {
		logger.error({ ex: "APP", err: String(error), stack: error.stack }, "Application initialization failed:");
		process.exit(1);
	}
}

initializeApp().catch((error) => {
	logger.error({ ex: "APP", err: String(error), stack: error.stack }, "Unhandled error in initializeApp():");
	process.exit(1);
});

async function handleAppShutdown(signal) {
	try {
		await sendTelegramMessage("system", `[${signal}] OrderBook-Aggregator shutting down.`);
	} catch (e) {
		logger.error({ ex: "APP", err: String(e) }, "Failed to send shutdown telegram notification:");
	}
	process.exit(0);
}

process.on('SIGINT', () => handleAppShutdown('SIGINT'));
process.on('SIGTERM', () => handleAppShutdown('SIGTERM'));


