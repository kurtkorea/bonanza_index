//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const http = require('http');
const log = require('./utils/logger');
// const { send_push } = require("./utils/zmq-sender-push.js");
// const { UpbitClient, BithumbClient, KorbitClient, CoinoneClient } = require('./service/mockup_time_weight_execution');

const { startPullQueue } = require("./utils/receiver-pull-queue.js");


// Start of Selection
global.logging = false;

if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "../env/prod.env") });
	logging = false;
} else {
	dotenv.config({ path: path.join(__dirname, "../env/dev.env") });
	logging = true;
}
const express = require("express");
const app = express();
// const server = require("http").createServer(app);
app.set("port", process.env.PORT || 13001);
var message = {};

const cors = require("cors");
const morgan = require("morgan");


//cors setting
app.use(cors({ origin: process.env.CORS_ORIGIN.split(","), credentials: true }));

//db connection
const { connect, db } = require("./db/db.js");
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
		// DB 연결
		await connect();
		await ticker_schema(db);
		await trade_schema(db);
		
		// ZMQ 큐 시작
		await startPullQueue();

		// servier 초기화
		// (await Message.findAll({ where: { message_use: true }, attributes: { exclude: ["message_desc", "createdAt", "updatedAt"] }, logging, raw: true })).forEach(
		// 	(row) => (message[row.message_key] = { msg: row.message_msg, code: row.message_code }),
		// );
	} catch (error) {
		console.error('Application initialization failed:', error);
		process.exit(1);
	}
}

initializeApp();

// Start the server
// const server = app.listen(app.get("port"), () => {
// 	console.log(`Server is running on port ${app.get("port")}`);
// });


process.on('unhandledRejection', (reason, p) => {
	console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
console.error('[uncaughtException]', err);
});
