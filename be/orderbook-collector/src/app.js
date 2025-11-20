//set server env

"use strict";

console.log('[APP] Starting application...');
console.log('[APP] Node version:', process.version);
console.log('[APP] Working directory:', process.cwd());

// 전역으로 사용할 모듈들을 먼저 선언
let path, dotenv, http, fs, connect, db, systemlog_schema, report_schema, sendTelegramMessage, initializeClients;

try {
  console.log('[APP] Loading dependencies...');
  path = require("path");
  dotenv = require("dotenv");
  http = require('http');
  fs = require('fs');
  console.log('[APP] Basic modules loaded');
  
  console.log('[APP] Loading logger...');
  const log = require('./utils/logger');
  console.log('[APP] Logger loaded');
  
  console.log('[APP] Loading database module...');
  const dbModule = require('./db/db.js');
  connect = dbModule.connect;
  db = dbModule.db;
  console.log('[APP] Database module loaded');
  
  console.log('[APP] Loading schema modules...');
  // ddl 폴더 경로를 동적으로 찾기
  // 프로덕션: process.cwd()는 /app이므로 /app/ddl
  // 로컬: __dirname은 .../orderbook-collector/src이므로 ../../ddl (be/ddl)
  let ddlPath = null;
  const possiblePaths = [
    path.join(process.cwd(), 'ddl'), // 프로덕션: /app/ddl
    path.join(__dirname, '../../ddl'), // 로컬: be/ddl
    path.join(__dirname, '../ddl'), // 대안: orderbook-collector/ddl
  ];
  
  for (const testPath of possiblePaths) {
    const testFile = path.join(testPath, 'systemlog_ddl.js');
    if (fs.existsSync(testFile)) {
      ddlPath = testPath;
      break;
    }
  }
  
  if (!ddlPath) {
    throw new Error(`DDL folder not found. Tried paths: ${possiblePaths.join(', ')}`);
  }
  
  console.log('[APP] DDL path:', ddlPath);
  const schemaModules = require(path.join(ddlPath, 'systemlog_ddl.js'));
  systemlog_schema = schemaModules.systemlog_schema;
  const reportModules = require(path.join(ddlPath, 'report_ddl.js'));
  report_schema = reportModules.report_schema;
  console.log('[APP] Schema modules loaded');
  
  console.log('[APP] Loading telegram module...');
  const telegramModule = require('./utils/telegram_push.js');
  sendTelegramMessage = telegramModule.sendTelegramMessage;
  console.log('[APP] Telegram module loaded');
  
  console.log('[APP] Loading websocket broker module...');
  const brokerModule = require('./service/websocket_order_book_broker.js');
  initializeClients = brokerModule.initializeClients;
  console.log('[APP] Websocket broker module loaded');
} catch (error) {
  console.error('[APP] FATAL ERROR during module loading:', error);
  console.error('[APP] Error name:', error.name);
  console.error('[APP] Error message:', error.message);
  console.error('[APP] Error stack:', error.stack);
  process.exit(1);
}

console.log('[APP] Module loading phase completed');

// Start of Selection
console.log('[APP] Starting application configuration...');
global.logging = false;
global.sock = null;

console.log('[APP] Loading environment variables...');
console.log('[APP] NODE_ENV:', process.env.NODE_ENV);
try {
	if (process.env.NODE_ENV === "production") {
		const envPath = path.join(__dirname, "../env/prod.env");
		console.log('[APP] Production env file path:', envPath);
		if (fs.existsSync(envPath)) {
			const result = dotenv.config({ path: envPath });
			if (result.error) {
				console.error('[APP] Error loading production env file:', result.error);
			} else {
				console.log('[APP] Production environment loaded successfully');
			}
		} else {
			console.warn('[APP] Production env file not found:', envPath);
			console.log('[APP] Continuing without env file...');
		}
		global.logging = false;
	} else {
		const envPath = path.join(__dirname, "../env/dev.env");
		console.log('[APP] Development env file path:', envPath);
		if (fs.existsSync(envPath)) {
			const result = dotenv.config({ path: envPath });
			if (result.error) {
				console.error('[APP] Error loading development env file:', result.error);
			} else {
				console.log('[APP] Development environment loaded successfully');
			}
		} else {
			console.warn('[APP] Development env file not found:', envPath);
			console.log('[APP] Continuing without env file...');
		}
		global.logging = true;
	}
} catch (envError) {
	console.error('[APP] Fatal error loading environment variables:', envError);
	console.error('[APP] Error name:', envError.name);
	console.error('[APP] Error message:', envError.message);
	console.error('[APP] Error stack:', envError.stack);
	console.log('[APP] Continuing without env file...');
}
console.log('[APP] Loading Express...');
const express = require("express");
const app = express();
console.log('[APP] Express loaded');
// const server = require("http").createServer(app);

app.set("port", process.env.PORT || 6001);

const morgan = require("morgan");

//console log middleware
app.use(morgan("dev", { skip: (req, resp) => resp.statusCode < 400 }));

//express setting
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));


//proxy checker
if (process.env.NODE_ENV === "production") {
	app.set("trust proxy", 1);
}

//routers
console.log('[APP] Loading routers...');
const { respMsg } = require("./utils/common");
const commandRouter = require("./router/command");
console.log('[APP] Routers loaded');

// 라우터 등록
console.log('[APP] Registering routes...');
app.use("/api/command", commandRouter);
console.log('[APP] Routes registered');

// Health check endpoint
app.get("/health", (req, res) => {
	// console.log("Health check endpoint");
	res.status(200).json({
		status: "ok",
		service: "orderbook-collector",
		timestamp: new Date().toISOString()
	});
});

//404 handling middleware
app.use((req, res) => {
	respMsg(res, "missing_request");
});

//error handling middleware
app.use((err, req, res, next) => {
	console.log(err.name, err.message);
	respMsg(res, "server_error");
});

async function initializeApp() {
	try {
		console.log('Starting application initialization...');
		await connect(process.env.QDB_HOST, process.env.QDB_PORT);
		console.log('Database connected successfully');
		
		await systemlog_schema(db);
		console.log('Systemlog schema initialized');
		
		await report_schema(db);
		console.log('Report schema initialized');
		
		// DB 연결 완료 후 클라이언트 초기화
		console.log('Initializing WebSocket clients...');
		try {
			initializeClients();
			console.log('WebSocket clients initialized successfully');
		} catch (clientError) {
			console.error('Failed to initialize WebSocket clients:', clientError);
			console.error('Client error stack:', clientError.stack);
			throw clientError; // 재throw하여 상위 catch에서 처리
		}
		
		await sendTelegramMessage("system", "OrderBook-Collector Initialization.");
		console.log('Application initialization completed successfully');
	} catch (error) {
		console.error('Application initialization failed:', error);
		console.error('Error name:', error.name);
		console.error('Error message:', error.message);
		console.error('Error stack:', error.stack);
		process.exit(1);
	}
}

console.log('[APP] About to call initializeApp()...');
initializeApp().catch((error) => {
	console.error('[APP] Unhandled error in initializeApp():', error);
	console.error('[APP] Error name:', error.name);
	console.error('[APP] Error message:', error.message);
	console.error('[APP] Error stack:', error.stack);
	process.exit(1);
});
console.log('[APP] initializeApp() called (async)');

async function handleAppShutdown(signal) {
	try {
		await sendTelegramMessage("system", `[${signal}] OrderBook-Collector shutting down.`);
	} catch (e) {
		console.error('Failed to send shutdown telegram notification:', e);
	}
	process.exit(0);
}	

console.log('[APP] About to start Express server...');
app.listen(app.get("port"), '0.0.0.0', () => {
	console.log(`🚀 REST API 서버 실행: http://0.0.0.0:${app.get("port")}`);
	console.log('[APP] Express server started successfully');
});

process.on('SIGINT', () => handleAppShutdown('SIGINT'));
process.on('SIGTERM', () => handleAppShutdown('SIGTERM'));


