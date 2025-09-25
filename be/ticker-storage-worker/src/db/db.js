const { Sequelize, DataTypes, Op } = require("sequelize");
// const Messages = require("./messages");
const db = {};

const sequelize = new Sequelize("qdb", "admin", "quest", {
	host: "121.88.4.81",
	port: 8812,
	dialect: "postgres",
	logging: false,
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
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

// db.Messages = Messages;

// Messages.init(sequelize);

// 데이터베이스 연결 테스트 및 테이블 동기화
async function connect() {
	await sequelize.authenticate();
	console.log("[DB] QuestDB connected via PG(8812).");
}

module.exports = {db, connect, sequelize, DataTypes, Op, QueryTypes: Sequelize.QueryTypes};
