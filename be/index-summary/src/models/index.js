const Sequelize = require("sequelize");
const path = require("path");
const dotenv = require("dotenv");
const FkbrtiSummary = require("./fkbrti_summary");
const db_mysql = {};
const logger = require('../utils/logger.js');

// 환경 변수 로드 (모듈 로드 시점에 실행되므로 여기서도 로드)
if (!process.env.DB_DIALECT) {
    if (process.env.NODE_ENV === "production") {
        dotenv.config({ path: path.join(__dirname, "../../env/prod.env") });
    } else {
        dotenv.config({ path: path.join(__dirname, "../../env/dev.env") });
    }
}

// 환경 변수 확인 및 기본값 설정
const DB_DIALECT = process.env.DB_DIALECT || 'mysql';
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_SCHEME = process.env.DB_SCHEME;
const DB_USERNAME = process.env.DB_USERNAME;
const DB_PASSWORD = process.env.DB_PASSWORD;

// MySQL 연결 성공 여부 로그
logger.info(
    "[MySQL] Environment variables\n" +
    JSON.stringify({
        DB_DIALECT: DB_DIALECT,
        DB_HOST: DB_HOST,
        DB_PORT: DB_PORT,
        DB_SCHEME: DB_SCHEME,
        DB_USERNAME: DB_USERNAME,
        DB_PASSWORD: DB_PASSWORD ? "***" : undefined,
    }, null, 2)
);

// 환경 변수가 없으면 에러 발생
if (!DB_DIALECT || !DB_HOST || !DB_PORT || !DB_SCHEME || !DB_USERNAME) {
    throw new Error('MySQL 환경 변수가 설정되지 않았습니다. DB_DIALECT, DB_HOST, DB_PORT, DB_SCHEME, DB_USERNAME이 필요합니다.');
}

const sequelize = new Sequelize(DB_SCHEME, DB_USERNAME, DB_PASSWORD, {
	host: DB_HOST,
	port: DB_PORT,
	dialect: DB_DIALECT, // 명시적으로 설정
	logging: process.env.DB_LOG === "true" ? console.log : false,
	timezone: '+09:00',  // KST (한국 표준시) 설정
  pool: {
    acquire: 120000,  // 연결 시도 최대 대기 시간 증가 (60초 -> 120초)
    max: 10,          // 연결 풀 크기 증가 (5 -> 10) - 동시 요청 대응
    min: 2,           // 최소 연결 수 증가 (0 -> 2) - 연결 풀 준비 상태 유지
    idle: 30000       // 유휴 연결 유지 시간 증가 (10초 -> 30초)
  },
  dialectOptions: {
    connectTimeout: 60000,  // MySQL 연결 타임아웃 (10초 -> 60초로 증가)
    timezone: '+09:00'  // MySQL 연결 시 KST 사용
  },
  retry: {
    max: 3,  // 최대 3번 재시도
    match: [
      /ETIMEDOUT/,
      /EHOSTUNREACH/,
      /ECONNRESET/,
      /ECONNREFUSED/,
      /ETIMEDOUT/,
      /ESOCKETTIMEDOUT/,
      /EHOSTUNREACH/,
      /EPIPE/,
      /EAI_AGAIN/,
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/
    ]
  }
});

db_mysql.sequelize = sequelize;
db_mysql.Sequelize = Sequelize;

db_mysql.FkbrtiSummary = FkbrtiSummary;

FkbrtiSummary.init(sequelize);

module.exports = db_mysql;
