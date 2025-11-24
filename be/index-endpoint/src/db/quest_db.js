const { Sequelize, DataTypes, Op } = require("sequelize");
const logger = require('../utils/logger.js');
const quest_db = {};

let sequelize = null;

// 데이터베이스 연결 테스트 및 테이블 동기화
async function connect_quest_db() {
	try {
		// 환경변수에서 값 가져오기 및 포트를 숫자로 변환
		const qdbHost = process.env.QDB_HOST;
		const qdbPort = parseInt(process.env.QDB_PORT || "8812", 10);
		const qdbDb = process.env.QDB_DB || "qdb";
		const qdbUser = process.env.QDB_USER || "admin";
		const qdbPass = process.env.QDB_PASS || "quest";
		const qdbLog = process.env.QDB_LOG === "true";

		logger.info({
			QDB_HOST: qdbHost,
			QDB_PORT: qdbPort,
			QDB_DB: qdbDb,
			QDB_USER: qdbUser,
			QDB_PASS: qdbPass ? "***" : undefined,
			QDB_LOG: qdbLog
		}, "[DB] QuestDB connection parameters");

		if (!qdbHost) {
			throw new Error("QDB_HOST environment variable is not set");
		}

		// Sequelize 인스턴스 생성 (환경변수가 로드된 후)
		sequelize = new Sequelize(
			qdbDb, 
			qdbUser, 
			qdbPass, 
			{
				host: qdbHost,
				port: qdbPort,
				dialect: "postgres",
				logging: qdbLog,
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
		quest_db.sequelize = sequelize;
		quest_db.Sequelize = Sequelize;

		await sequelize.authenticate();

		logger.info({ host: qdbHost, port: qdbPort }, "[DB] QuestDB connected via PG(8812).");
	} catch (error) {
		logger.error({ 
			ex: "DB", 
			err: String(error), 
			stack: error.stack,
			QDB_HOST: process.env.QDB_HOST,
			QDB_PORT: process.env.QDB_PORT
		}, "[DB] QuestDB connection failed:");
		throw error;
	}
}

// 라우터에서 사용할 수 있도록 db 별칭 추가
const db = quest_db;

module.exports = {quest_db, db, connect_quest_db, sequelize, DataTypes, Op, QueryTypes: Sequelize.QueryTypes};
