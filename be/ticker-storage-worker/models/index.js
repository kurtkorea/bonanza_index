const Sequelize = require("sequelize");
// const Messages = require("./messages");
const db = {};

const sequelize = new Sequelize("qdb", "admin", "quest", {
	host: "121.88.4.81",
	port: 8812,
	dialect: "postgres",
	logging: false,
	pool: {
		max: 10,
		min: 0,
		idle: 10000,
		acquire: 30000,
	},
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

module.exports = {db, connect, sequelize};
