//set server env

"use strict";

/*
- 거래소 호가 수집 프로세스에서 수신받은 호가를 합산하여 저장
*/

const path = require("path");
const dotenv = require("dotenv");
const { connect, db } = require('./db/db.js');
const { systemlog_schema } = require('./ddl/systemlog_ddl.js');

const  { sendTelegramMessage } = require('./utils/telegram_push.js')

const { UpbitClient, BithumbClient, KorbitClient, CoinoneClient } = require('./service/websocket_broker.js');

if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "../env/prod.env") });
} else {
	dotenv.config({ path: path.join(__dirname, "../env/dev.env") });
}

async function initializeApp() {
	try {
		await connect(process.env.QDB_HOST, process.env.QDB_PORT);
		await systemlog_schema(db);
		await sendTelegramMessage("system", "OrderBook-Aggregator Initialization.");
	} catch (error) {
		console.error('Application initialization failed:', error);
		process.exit(1);
	}
}

initializeApp();

async function handleAppShutdown(signal) {
	try {
		await sendTelegramMessage("system", `[${signal}] OrderBook-Aggregator shutting down.`);
	} catch (e) {
		console.error('Failed to send shutdown telegram notification:', e);
	}
	process.exit(0);
}

process.on('SIGINT', () => handleAppShutdown('SIGINT'));
process.on('SIGTERM', () => handleAppShutdown('SIGTERM'));


