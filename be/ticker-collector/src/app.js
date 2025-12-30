//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const { connect_quest_db, quest_db } = require('./db/quest_db.js');
const { systemlog_schema } = require('./ddl/systemlog_ddl.js');
const { report_schema } = require('./ddl/report_ddl.js');
const  { sendTelegramMessage } = require('./utils/telegram_push.js')
const logger = require('./utils/logger.js');
const websocketBrokerModule = require('./service/websocket_broker.js');
const websocketBroker = websocketBrokerModule.default || websocketBrokerModule;
const refresh_websocket_clients = websocketBroker.refresh_websocket_clients;
const getAllQueueStats = websocketBroker.getAllQueueStats;
const getTotalQueueSize = websocketBroker.getTotalQueueSize;
const IndexProcessInfo = require('./models/index_process_info.js');
const { initializeRedis } = require('./redis.js');
const { init_zmq_command_subscriber } = require('./utils/zmq-data-sub.js');
const { LeaderElection } = require('./utils/leader-election.js');
const { setLeaderElection, getLeaderElection, setLeaderElectionEnabled } = require('./utils/leader-status.js');

// const { UpbitClientTrade, BithumbClientTrade, KorbitClientTrade, CoinoneClientTrade } = require('./service/websocket_trade_broker.js');
// const { UpbitClientTicker, BithumbClientTicker, KorbitClientTicker, CoinoneClientTicker } = require('./service/websocket_ticker_broker.js');

// 명령줄 인수에서 process_id와 port 추출
// 사용법: 
//   node app.js --process-id=my-process-id --port=9001
//   node app.js my-process-id 9001
//   npm start my-process-id 9001
let process_id = null;
let port = null;

const args = process.argv.slice(2);
let positionalArgs = []; // 위치 기반 인수 (--로 시작하지 않는 인수)

for (const arg of args) {
	if (arg.startsWith('--process-id=')) {
		process_id = arg.split('=')[1];
	} else if (arg === '--process-id' && args.indexOf(arg) + 1 < args.length) {
		process_id = args[args.indexOf(arg) + 1];
	} else if (arg.startsWith('--port=')) {
		port = parseInt(arg.split('=')[1]);
	} else if (arg === '--port' && args.indexOf(arg) + 1 < args.length) {
		port = parseInt(args[args.indexOf(arg) + 1]);
	} else if (!arg.startsWith('--')) {
		// --로 시작하지 않는 인수는 위치 기반 인수로 처리
		positionalArgs.push(arg);
	}
}

// 위치 기반 인수 처리
// 첫 번째 인수: process_id
// 두 번째 인수: port
if (positionalArgs.length > 0 && !process_id) {
	process_id = positionalArgs[0];
}
if (positionalArgs.length >= 2 && !port) {
	port = parseInt(positionalArgs[1]);
}

if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "../env/prod.env") });
} else {
	dotenv.config({ path: path.join(__dirname, "../env/dev.env") });
}

// 명령줄 인수에서 process_id를 찾지 못한 경우 환경 변수에서 읽어오기
if (!process_id && process.env.PROCESS_ID) {
	process_id = process.env.PROCESS_ID;
	logger.info({ process_id }, "Process ID loaded from environment variable:");
}

// process_id 설정 및 출력
if (process_id) {
	global.process_id = process_id; // 전역 변수로 설정하여 다른 모듈에서 사용 가능
	logger.info({ process_id }, "Process ID initialized:");
} else {
	logger.warn("No process_id provided. Use --process-id=<id>, pass as first argument, or set PROCESS_ID in env file.");
}
const express = require("express");
const app = express();
// const server = require("http").createServer(app);

// 포트 설정 우선순위: 명령줄 인수 > 환경변수 > 기본값
const serverPort = port || parseInt(process.env.PORT) || 6002;
app.set("port", serverPort);

if (port) {
	logger.info({ port: serverPort }, "Port loaded from command line argument:");
} else if (process.env.PORT) {
	logger.info({ port: serverPort }, "Port loaded from environment variable:");
} else {
	logger.info({ port: serverPort }, "Port using default value:");
}

const cors = require("cors");
const morgan = require("morgan");

//cors setting
app.use(cors({ 
	origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*", 
	credentials: true 
}));

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
const { respMsg } = require("./utils/common");
const commandRouter = require("./router/command");

// 라우터 등록
app.use("/api/command", commandRouter);

// Health check endpoint
app.get("/health", (req, res) => {
	const healthData = {
		status: "ok",
		service: "ticker-collector",
		timestamp: new Date().toISOString()
	};
	
	// 리더 선출 정보 추가
	const leaderElection = getLeaderElection();
	if (leaderElection) {
		healthData.leaderElection = {
			isLeader: leaderElection.isLeader,
			instanceId: leaderElection.instanceId
		};
	}
	
	res.status(200).json(healthData);
});

// 리더십 상태 확인 endpoint
app.get("/api/leader/status", async (req, res) => {
	try {
		const leaderElection = getLeaderElection();
		if (!leaderElection) {
			return res.status(200).json({
				enabled: false,
				message: "리더 선출이 비활성화되어 있습니다."
			});
		}
		
		const currentLeader = await leaderElection.getCurrentLeader();
		res.status(200).json({
			enabled: true,
			isLeader: leaderElection.isLeader,
			instanceId: leaderElection.instanceId,
			currentLeader: currentLeader,
			leaseTime: leaderElection.leaseTime,
			renewInterval: leaderElection.renewInterval
		});
	} catch (error) {
		logger.error({ ex: "APP", err: String(error) }, "리더십 상태 확인 중 오류 발생");
		res.status(500).json({
			error: "리더십 상태 확인 실패",
			message: String(error)
		});
	}
});

//discovery register
// const discovery = require("./discovery");
// if (process.env.NODE_ENV === "production") {
// 	discovery.init(app);
// }

//404 handling middleware
app.use((req, res) => {
	respMsg(res, "missing_request");
});

//error handling middleware
app.use((err, req, res, next) => {
	logger.error({ ex: "APP", err: err.message, name: err.name, stack: err.stack }, "Error handling middleware");
	respMsg(res, "server_error");
});

const db_mysql = require("./models");

// 리더 선출 인스턴스는 leader-status 모듈에서 관리

// 리더십 변경 콜백
async function handleLeaderChange(isLeader, leaderId) {
	try {
		const leaderElection = getLeaderElection();
		if (isLeader) {
			// 팔로워에서 리더로 전환될 때 큐에 쌓인 데이터 개수 확인
			const totalQueueSize = getTotalQueueSize ? getTotalQueueSize() : 0;
			const queueStats = getAllQueueStats ? getAllQueueStats() : [];
			
			logger.info({
				instanceId: leaderElection?.instanceId,
				leaderId: leaderId,
				totalQueueSize: totalQueueSize,
				queueStats: queueStats
			}, '[APP] 리더가 되었습니다. ZMQ 전송 시작 (큐에 쌓인 데이터: 총 ' + totalQueueSize + '개)');
			
			// 각 거래소별 큐 크기 상세 로그
			if (queueStats && queueStats.length > 0) {
				queueStats.forEach((stats) => {
					logger.info({
						exchange: stats.exchange,
						queueSize: stats.queueSize,
						queueMaxSize: stats.queueMaxSize,
						queueUsagePercent: stats.queueUsagePercent
					}, `[APP] 거래소별 큐 상태: ${stats.exchange} - ${stats.queueSize}/${stats.queueMaxSize} (${stats.queueUsagePercent})`);
				});
			}
			
			// 리더가 되면 ZMQ 전송 활성화 (WebSocket은 이미 연결되어 있음)
			// websocket_broker에서 리더십 상태를 확인하여 ZMQ 전송 여부 결정
			
			await sendTelegramMessage("SYSTEM", `[Leader Election] Ticker-Collector가 리더가 되었습니다. ZMQ 전송 시작. (${leaderId}) - 큐에 쌓인 데이터: ${totalQueueSize}개`);
		} else {
			logger.warn({
				instanceId: leaderElection?.instanceId,
				currentLeader: leaderId
			}, '[APP] 리더십 상실. ZMQ 전송 중지 (WebSocket은 계속 연결 유지)');
			
			// 리더십 상실 시 ZMQ 전송만 중지 (WebSocket은 계속 연결하여 데이터 수집)
			// websocket_broker에서 리더십 상태를 확인하여 ZMQ 전송 여부 결정
			
			if (leaderId) {
				await sendTelegramMessage("SYSTEM", `[Leader Election] Ticker-Collector 리더십 상실. ZMQ 전송 중지. 현재 리더: ${leaderId}`);
			}
		}
	} catch (error) {
		logger.error({
			ex: "APP",
			err: String(error),
			stack: error.stack
		}, "리더십 변경 처리 중 오류 발생");
	}
}

async function initializeApp() {
	try {
		await initializeRedis();
		logger.info("[Redis] Database connection has been established successfully.");

		await db_mysql.sequelize.sync({ force: false });
		logger.info("[MySQL] Database connection has been established successfully.");

		await connect_quest_db();
		logger.info("[QuestDB] Database connection has been established successfully.");

		await systemlog_schema(quest_db);
		await report_schema(quest_db);

		// WebSocket 클라이언트 초기화 (리더십과 무관하게 항상 연결)
		logger.info('[APP] WebSocket 클라이언트 초기화 시작...');
		try {
			await refresh_websocket_clients();
			logger.info("WebSocket clients initialized successfully!!!");
		} catch (error) {
			logger.error({
				ex: "APP",
				err: String(error),
				stack: error.stack
			}, "[APP] WebSocket 클라이언트 초기화 실패:");
			throw error; // 에러를 다시 throw하여 앱이 중단되도록
		}
		
		// 리더 선출 초기화
		// 환경변수로 리더 선출 활성화 여부 확인 (기본값: true)
		logger.info('[APP] 리더 선출 설정 확인 중...');
		const enableLeaderElection = process.env.ENABLE_LEADER_ELECTION !== 'false';
		
		logger.info({
			enableLeaderElection: enableLeaderElection,
			envValue: process.env.ENABLE_LEADER_ELECTION
		}, '[APP] 리더 선출 활성화 여부 확인!!!!!!!!!!!!');
		
		if (enableLeaderElection) {
			logger.info('[APP] 리더 선출 모드 활성화. LeaderElection 인스턴스 생성 중...');
			
			// 리더 선출 활성화 플래그 설정 (초기화 전에 false 반환하도록)
			setLeaderElectionEnabled(true);
			
			// 리더십 갱신 성공 시 큐 상태 체크 콜백
			const handleRenewalSuccess = () => {
				try {
					const totalQueueSize = getTotalQueueSize ? getTotalQueueSize() : 0;
					const queueStats = getAllQueueStats ? getAllQueueStats() : [];
					
					// 큐가 있는 경우에만 로그 출력 (너무 자주 출력되지 않도록)
					if (totalQueueSize > 0) {					
						// 큐가 많이 쌓인 경우 경고
						if (totalQueueSize > 10000) {
							logger.warn({
								totalQueueSize: totalQueueSize,
								queueStats: queueStats
							}, '[APP] ⚠️ 리더십 갱신 성공 - 큐에 많은 데이터가 쌓여있음 (총 ' + totalQueueSize + '개)');
						}
					}
				} catch (error) {
					logger.error({
						err: String(error),
						stack: error.stack
					}, '[APP] 리더십 갱신 성공 후 큐 상태 체크 중 오류 발생');
				}
			};
			
			const leaderElection = new LeaderElection({
				onLeaderChange: handleLeaderChange,
				onRenewalSuccess: handleRenewalSuccess
			});
			
			// 리더 선출 인스턴스를 leader-status 모듈에 등록
			setLeaderElection(leaderElection);
			logger.info('[APP] LeaderElection 인스턴스 생성 완료');
			
			// 리더 선출 시작
			logger.info('[APP] 리더 선출 시작 호출 중...');
			await leaderElection.start();
			logger.info('[APP] 리더 선출 시작 완료 (WebSocket은 이미 연결됨)');
			
			// 리더십 획득 대기 (최대 10초)
			let waitCount = 0;
			const maxWait = 10;
			while (!leaderElection.isLeader && waitCount < maxWait) {
				await new Promise(resolve => setTimeout(resolve, 1000));
				waitCount++;
			}
			
			if (leaderElection.isLeader) {
				logger.info('[APP] 리더십 획득 완료. ZMQ 전송 시작');
			} else {
				logger.info('[APP] 리더십 획득 실패. 팔로워로 대기 중 (WebSocket은 계속 연결, ZMQ 전송만 중지)');
			}
		} else {
			// 리더 선출 비활성화 시 기존 방식으로 동작 (항상 ZMQ 전송)
			setLeaderElectionEnabled(false);
			logger.info('[APP] 리더 선출 비활성화. 모든 인스턴스가 ZMQ 전송 시작');
		}

		await sendTelegramMessage("SYSTEM", "Ticker-Collector Initialization.");
		logger.info('Application initialization completed successfully');

		// ZMQ command subscriber는 백그라운드에서 실행
		logger.info("[APP] ZMQ Command subscriber 초기화 시작 (백그라운드)...");
		init_zmq_command_subscriber(global.process_id)
			.then(() => logger.info("[APP] ZMQ Command subscriber 백그라운드 초기화 완료."))
			.catch(error => logger.error({ ex: "APP", err: String(error), stack: error.stack }, "[APP] ZMQ Command subscriber 백그라운드 초기화 실패:"));

	} catch (error) {
		logger.error({ ex: "APP", err: String(error), stack: error.stack }, 'Application initialization failed');
		process.exit(1);
	}
}

initializeApp();

async function handleAppShutdown(signal) {
	try {
		// 리더십 해제
		const leaderElection = getLeaderElection();
		if (leaderElection) {
			await leaderElection.stop();
			logger.info('[APP] 리더 선출 중지 완료');
		}
		
		await sendTelegramMessage("SYSTEM", `[${signal}] Ticker-Collector shutting down.`);
	} catch (e) {
		logger.error({ ex: "APP", err: String(e), stack: e.stack }, 'Failed to send shutdown telegram notification');
	}
	process.exit(0);
}

app.listen(app.get("port"), '0.0.0.0', () => {
	logger.info({ ex: "APP", port: app.get("port") }, `🚀 REST API Server started: http://0.0.0.0:${app.get("port")}`);
});

process.on('SIGINT', () => handleAppShutdown('SIGINT'));
process.on('SIGTERM', () => handleAppShutdown('SIGTERM'));