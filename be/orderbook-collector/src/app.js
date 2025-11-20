//set server env

"use strict";

const logger = require('./utils/logger.js');
const path = require("path");
const dotenv = require("dotenv");
const fs = require('fs');
const { connect, db } = require('./db/db.js');
const { systemlog_schema } = require('./ddl/systemlog_ddl.js');
const { report_schema } = require('./ddl/report_ddl.js');
const { sendTelegramMessage } = require('./utils/telegram_push.js');
const { initializeClients } = require('./service/websocket_order_book_broker.js');
const { respMsg } = require('./utils/common.js');
const commandRouter = require('./router/command.js');
const express = require("express");
const app = express();
const morgan = require("morgan");

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

async function initializeApp() {
	try {
		await connect(process.env.QDB_HOST, process.env.QDB_PORT);
		await systemlog_schema(db);
		await report_schema(db);
		try {
			initializeClients();
			logger.info('WebSocket clients initialized successfully');
		} catch (clientError) {
			logger.error({ ex: "APP", err: String(clientError) }, "Failed to initialize WebSocket clients:");
			logger.error({ ex: "APP", err: String(clientError.stack) }, "Client error stack:");
			throw clientError; // 재throw하여 상위 catch에서 처리
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
	logger.info(`🚀 REST API 서버 실행: http://0.0.0.0:${app.get("port")}`);
	logger.info('[APP] Express server started successfully');
});

process.on('SIGINT', () => handleAppShutdown('SIGINT'));
process.on('SIGTERM', () => handleAppShutdown('SIGTERM'));


