const { Sequelize, DataTypes, Op } = require("sequelize");
// const Messages = require("./messages");
const db = {};

let sequelize = null;

// db.Messages = Messages;

// Messages.init(sequelize);

// 데이터베이스 연결 테스트 및 테이블 동기화
async function connect() {
	// 환경변수 디버깅
	console.log("[DB] Environment variables:");
	console.log("QDB_HOST:", process.env.QDB_HOST);
	console.log("QDB_PORT:", process.env.QDB_PORT);
	console.log("QDB_DB:", process.env.QDB_DB);
	console.log("QDB_USER:", process.env.QDB_USER);
	console.log("QDB_PASS:", process.env.QDB_PASS);
	console.log("QDB_LOG:", process.env.QDB_LOG);

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

	console.log("[DB] QuestDB connected via PG(8812).");
}

module.exports = {db, connect, sequelize, DataTypes, Op, QueryTypes: Sequelize.QueryTypes};
