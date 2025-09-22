const Sequelize = require("sequelize");
const Messages = require("./messages");
const db = {};

const sequelize = new Sequelize(process.env.DB_SCHEME, process.env.DB_USERNAME, process.env.DB_PASSWORD, {
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	dialect: process.env.DB_DIALECT,
	logging: global.logging,
  pool: {
    acquire: 10000,  // 연결 시도 최대 대기 시간 (기본 10000ms)
    max: 5,
    min: 0,
    idle: 10000
  },
  dialectOptions: {
    connectTimeout: 10000  // MySQL에만 적용
  }	
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

db.Messages = Messages;

Messages.init(sequelize);

// 데이터베이스 연결 테스트 및 테이블 동기화
(async () => {
	try {
		await sequelize.authenticate();
		console.log('Database connection has been established successfully.');
		
		// 테이블이 없으면 생성
		await sequelize.sync();
		console.log('All models were synchronized successfully.');
	} catch (error) {
		console.error('Unable to connect to the database:', error);
	}
})();

module.exports = db;
