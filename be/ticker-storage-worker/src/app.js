//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const http = require('http');
const logger = require('./utils/logger');
const { startPullQueue } = require("./utils/receiver-pull-queue.js");
const { init_zmq_pub } = require("./utils/zmq-sender-pub.js");

if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "../env/prod.env") });
} else {
	dotenv.config({ path: path.join(__dirname, "../env/dev.env") });
}
const express = require("express");
const app = express();
app.set("port", process.env.PORT || 6004);

const cors = require("cors");
const morgan = require("morgan");

//cors setting
app.use(cors({ 
	origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*", 
	credentials: true 
}));

//db connection
const { connect_quest_db, quest_db } = require("./db/quest_db.js");
// 각 프로젝트의 ddl 폴더 사용
const { ticker_schema } = require("./ddl/ticker_ddl.js");
const { trade_schema } = require("./ddl/trade_ddl.js");


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

// Health check endpoint
app.get("/health", (req, res) => {
	res.status(200).json({
		status: "ok",
		service: "ticker-storage-worker",
		timestamp: new Date().toISOString()
	});
});

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
		// DB 연결
		await connect_quest_db();
		// await ticker_schema(db);
		await trade_schema(quest_db);		
		// ZMQ 큐 시작
		await startPullQueue();
		await init_zmq_pub();
	} catch (error) {
		logger.error({ ex: "APP", err: String(error), stack: error.stack }, "Application initialization failed:");
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

process.on('unhandledRejection', (reason, p) => {
	logger.error({ ex: "APP", err: String(reason) }, "[unhandledRejection]");
});

process.on('uncaughtException', (err) => {
	logger.error({ ex: "APP", err: String(err), stack: err.stack }, "[uncaughtException]");
});
