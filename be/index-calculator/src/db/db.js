const { Sequelize, DataTypes, Op } = require("sequelize");
const logger = require("../utils/logger");
const db = {};

const { latestTickerByExchange, latestDepthByExchange, latestTradeByExchange } = require('../utils/common');

let sequelize = null;

// 데이터베이스 연결 테스트 및 테이블 동기화
async function connect() {
	// 환경변수 디버깅
	logger.info({
		QDB_HOST: process.env.QDB_HOST,
		QDB_PORT: process.env.QDB_PORT,
		QDB_DB: process.env.QDB_DB,
		QDB_USER: process.env.QDB_USER,
		QDB_PASS: process.env.QDB_PASS ? "***" : undefined,
		QDB_LOG: process.env.QDB_LOG
	}, "[DB] Environment variables:");

	// Sequelize 인스턴스 생성 (환경변수가 로드된 후)
	sequelize = new Sequelize(
		process.env.QDB_DB || "qdb", 
		process.env.QDB_USER || "admin", 
		process.env.QDB_PASS || "quest", 
		{
			host: process.env.QDB_HOST,
			port: process.env.QDB_PORT,
			dialect: "postgres",
			logging: process.env.QDB_LOG === "true",
			pool:{
				max: 12,        // ← PULL 워커 동시성(예: 8~12)보다 크거나 같게
				min: 0,
				idle: 10_000,
				acquire: 60_000 // ← 30s -> 60s로 완화
			},
			dialectOptions:{
				keepAlive: true,
				statement_timeout: 0,
				idle_in_transaction_session_timeout: 0,
			},
			retry:{ max: 2 }
		}
	);

	// db 객체에 할당
	db.sequelize = sequelize;
	db.Sequelize = Sequelize;

	await sequelize.authenticate();

	logger.info("[DB] QuestDB connected via PG(8812).");

	logger.info("Restore last-ticker Data from DB Start...");
	const result_ticker = await sequelize.query(`SELECT symbol, exchange_no, exchange_name, open, high, low, close, volume,
												 		marketAt, collectorAt, dbAt, diff_ms, diff_ms_db
												 FROM tb_ticker
												 LATEST BY symbol, exchange_no
												 ORDER BY marketAt DESC;`, { type: Sequelize.QueryTypes.SELECT });

	for ( const item of result_ticker ) {
		const last_key = item.exchange_no + "_" + item.symbol;
		latestTickerByExchange.set(last_key, item);
	}

	const result_trade = await sequelize.query(`SELECT symbol, exchange_no, exchange_name, price, volume, side,
													marketAt, collectorAt, dbAt, diff_ms, diff_ms_db
												FROM tb_trade
												ORDER BY marketAt DESC
												LIMIT 1000;`, { type: Sequelize.QueryTypes.SELECT });

	for ( const item of result_trade ) {
		const last_key = item.exchange_no + "_" + item.symbol;
		latestTradeByExchange.set(last_key, item);
	}

	logger.info("Restore last-ticker Data from DB End...");
}

module.exports = {db, connect, sequelize, DataTypes, Op, QueryTypes: Sequelize.QueryTypes};
