const Sequelize = require("sequelize");
const IndexProcessInfo = require("./index_process_info");
const FkbrtiSummary = require("./fkbrti_summary");
const db_mysql = {};
const logger = require('../utils/logger.js');
// MySQL 연결 성공 여부 로그

logger.info(
    "[MySQL] Environment variables\n" +
    JSON.stringify({
        DB_DIALECT: process.env.DB_DIALECT,
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_SCHEME: process.env.DB_SCHEME,
        DB_USERNAME: process.env.DB_USERNAME,
        DB_PASSWORD: process.env.DB_PASSWORD ? "***" : undefined,
    }, null, 2)
);

const sequelize = new Sequelize(process.env.DB_SCHEME, process.env.DB_USERNAME, process.env.DB_PASSWORD, {
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	dialect: process.env.DB_DIALECT,
	logging: process.env.DB_LOG === "true" ? console.log : false,
	timezone: '+09:00',  // KST (한국 표준시) 설정
  pool: {
    acquire: 10000,  // 연결 시도 최대 대기 시간 (기본 10000ms)
    max: 5,
    min: 0,
    idle: 10000
  },
  dialectOptions: {
    connectTimeout: 10000,  // MySQL에만 적용
    timezone: '+09:00'  // MySQL 연결 시 KST 사용
  }	
});

db_mysql.sequelize = sequelize;
db_mysql.Sequelize = Sequelize;

db_mysql.IndexProcessInfo = IndexProcessInfo;
db_mysql.FkbrtiSummary = FkbrtiSummary;


IndexProcessInfo.init(sequelize);
FkbrtiSummary.init(sequelize);

module.exports = db_mysql;
