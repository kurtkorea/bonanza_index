//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const http = require('http');
const log = require('./utils/logger');

// 전역 로거 설정
global.logger = log;
// const { send_push, getZMQStatus, healthCheckZMQ } = require("./utils/zmq-sender-push.js");

// const { UpbitClient, BithumbClient, KorbitClient, CoinoneClient } = require('./service/websocket_broker.js');

const { connect, db } = require("./db/db.js");

// Start of Selection
global.logging = false;
global.sock = null;

// 전역 에러 핸들러 설정
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    });
    
    if (global.logger) {
        global.logger.error('Uncaught Exception', { error });
    }
    
    // 애플리케이션을 안전하게 종료
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    
    if (global.logger) {
        global.logger.error('Unhandled Rejection', { reason, promise });
    }
});

if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "../env/prod.env") });
	global.logging = false;
} else {
	dotenv.config({ path: path.join(__dirname, "../env/dev.env") });
	global.logging = true;
}
const express = require("express");
const app = express();
const server = require("http").createServer(app);
app.set("port", process.env.PORT || 3000);

const cors = require("cors");
const morgan = require("morgan");

//swagger
const swaggerUi = require("swagger-ui-express");

//cors setting
app.use(cors({ origin: process.env.CORS_ORIGIN.split(","), credentials: true }));

//db connection
// const { sequelize, Message } = require("../models");
// sequelize
// 	.sync({ force: false })
// 	.then(() => console.log("DB 연결 성공"))
// 	.catch((err) => console.log("DB 연결 실패", err));

//console log middleware
app.use(morgan("dev", { skip: (req, resp) => resp.statusCode < 400 }));

//express setting
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(express.json({ limit: "5mb" }));

app.use(express.static("./swagger"));
app.use(
	"/doc",
	swaggerUi.serve,
	swaggerUi.setup(null, {
		swaggerOptions: {
			url: `/swagger_autogen.json`,
		},
	}),
);

//proxy checker
if (process.env.NODE_ENV === "production") {
	app.set("trust proxy", 1);
}

//routers
const { respMsg } = require("./utils/common");
const indexHistoryRouter = require("./router/index_history.js");
const indexCalcRouter = require("./router/index_calc.js");

// 라우터 등록
app.use("/v1/index_history", indexHistoryRouter);
app.use("/v1/index_calc", indexCalcRouter);

//discovery register
// const discovery = require("./discovery");
// if (process.env.NODE_ENV === "production") {
// 	discovery.init(app);
// }

//404 handling middleware
app.use((req, res) => {
	console.log('404 Not Found:', req.method, req.url);
	respMsg(res, "missing_request");
});

//error handling middleware
app.use((err, req, res, next) => {
	console.error('서버 에러 발생:', {
		name: err.name,
		message: err.message,
		stack: err.stack,
		url: req.url,
		method: req.method,
		timestamp: new Date().toISOString()
	});
	
	// 로거가 있다면 사용
	if (global.logger) {
		global.logger.error('서버 에러', {
			error: err,
			request: {
				url: req.url,
				method: req.method,
				headers: req.headers
			}
		});
	}
	
	respMsg(res, "server_error");
});

async function initializeApp() {
	try {
		console.log('애플리케이션 초기화 시작...');

		// DB 연결
		console.log('DB 연결 중...');
		await connect();
		console.log('DB 연결 완료');

		console.log('애플리케이션 초기화 완료');
	} catch (error) {
		console.error('애플리케이션 초기화 실패:', {
			message: error.message,
			stack: error.stack,
			timestamp: new Date().toISOString()
		});
		
		// 로거가 있다면 사용
		if (global.logger) {
			global.logger.error('애플리케이션 초기화 실패', { error });
		}
		
		process.exit(1);
	}
}

initializeApp();

server.listen(app.get("port"), async () => {
	try {

	} catch (err) {
		console.log(err.name, err.message);
	}
	console.log("SERVER_PORT :", app.get("port"));
});



