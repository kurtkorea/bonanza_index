const { Sequelize, DataTypes, Op } = require("sequelize");
const logger = require("../utils/logger");

const quest_db = {};

const { latestTickerByExchange, latestDepthByExchange, latestTradeByExchange } = require('../utils/common');

let sequelize = null;

// 데이터베이스 연결 테스트 및 테이블 동기화
async function connect_quest_db() {
	// 환경변수 디버깅
	logger.info(
		"[QuestDB] Environment variables\n" +
		JSON.stringify({
			QDB_HOST: process.env.QDB_HOST,
			QDB_PORT: process.env.QDB_PORT,
			QDB_DB: process.env.QDB_DB,
			QDB_USER: process.env.QDB_USER,
			QDB_PASS: process.env.QDB_PASS ? "***" : undefined,
			QDB_LOG: process.env.QDB_LOG,
		}, null, 2)
	);

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
				max: 20,        // 연결 풀 크기 증가 (12 -> 20) - send_publisher 동시 호출 대응
				min: 2,         // 최소 연결 수 증가 (0 -> 2) - 연결 풀 준비 상태 유지
				idle: 30_000,   // 유휴 연결 유지 시간 증가 (10초 -> 30초)
				acquire: 120_000 // 연결 획득 타임아웃 증가 (60초 -> 120초)
			},
			dialectOptions:{
				keepAlive: true,
				statement_timeout: 0,
				idle_in_transaction_session_timeout: 0,
			},
			retry:{ 
				max: 3,  // 재시도 횟수 증가 (2 -> 3)
				match: [
					/ETIMEDOUT/,
					/EHOSTUNREACH/,
					/ECONNRESET/,
					/ECONNREFUSED/,
					/ESOCKETTIMEDOUT/,
					/EPIPE/,
					/EAI_AGAIN/,
					/SequelizeConnectionError/,
					/SequelizeConnectionRefusedError/,
					/SequelizeHostNotFoundError/,
					/SequelizeHostNotReachableError/,
					/SequelizeInvalidConnectionError/,
					/SequelizeConnectionTimedOutError/,
					/SequelizeConnectionAcquireTimeoutError/
				]
			}
		}
	);

	// db 객체에 할당
	quest_db.sequelize = sequelize;
	quest_db.Sequelize = Sequelize;

	await sequelize.authenticate();

	logger.info("[DB] QuestDB connected via PG(8812).");

	// const result_trade = await sequelize.query(`SELECT tran_dt, exchange_cd, sequential_id, price_id, 
	// 											product_id, tran_tm, buy_sell_gb, trade_price, trade_volumn, 
	// 											timestamp, cont_dtm
	// 											FROM tb_exchange_trade
	// 											ORDER BY ts DESC
	// 											LIMIT 1000;`, { type: Sequelize.QueryTypes.SELECT });

	// for ( const item of result_trade ) {
	// 	const last_key = item.exchange_no + "_" + item.symbol;
	// 	latestTradeByExchange.set(last_key, item);
	// }

	logger.info("Restore last-ticker Data from DB End...");
}

module.exports = {quest_db, connect_quest_db, sequelize, DataTypes, Op, QueryTypes: Sequelize.QueryTypes};
