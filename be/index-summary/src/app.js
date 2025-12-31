//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const http = require('http');
const logger = require('./utils/logger');

const { SummaryScheduler } = require('./service/summary_scheduler.js');
const { connect_quest_db } = require("./db/quest_db.js");
const db_mysql = require("./models");

// 전역 에러 핸들러 설정
process.on('uncaughtException', (error) => {
    logger.error({ ex: "APP", err: error.message, stack: error.stack }, "Uncaught Exception:");
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error({ ex: "APP", err: String(reason) }, "Unhandled Rejection:");
});

if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "../env/prod.env") });
} else {
	dotenv.config({ path: path.join(__dirname, "../env/dev.env") });
}

async function initializeApp() {
	try {
		logger.info('애플리케이션 초기화 시작...');

		// DB 연결 (재시도 로직 포함)
		logger.info('DB 연결 중...');
		let dbConnected = false;
		let retryCount = 0;
		const maxRetries = 3;
		
		while (!dbConnected && retryCount < maxRetries) {
			try {
				// 먼저 연결 테스트
				await db_mysql.sequelize.authenticate();
				logger.info("[MySQL] Database connection authenticated successfully.");
				
				// 테이블 동기화
				await db_mysql.sequelize.sync({ force: false });
				logger.info("[MySQL] Database connection has been established successfully.");
				dbConnected = true;
			} catch (error) {
				retryCount++;
				if (retryCount >= maxRetries) {
					logger.error({ ex: "APP", err: String(error), stack: error.stack, retryCount }, "MySQL 연결 실패 (최대 재시도 횟수 초과)");
					throw error;
				}
				logger.warn({ ex: "APP", err: String(error), retryCount, maxRetries }, `MySQL 연결 실패, ${retryCount}/${maxRetries} 재시도 중...`);
				await new Promise(resolve => setTimeout(resolve, 5000 * retryCount)); // 지수 백오프
			}
		}

		await connect_quest_db();
		logger.info('QuestDB 연결 완료');

		const summarySymbols = process.env.SUMMARY_SYMBOLS 
			? process.env.SUMMARY_SYMBOLS.split(',').map(s => s.trim())
			: ['KRW-BTC'];
		const summaryEnabled = process.env.SUMMARY_ENABLED !== 'false';
		const summaryIntervalMs = Number(process.env.SUMMARY_INTERVAL_MS || 60 * 60 * 1000); // 기본 1시간

		if (summaryEnabled) {
			const summaryScheduler = new SummaryScheduler({
				intervalMs: summaryIntervalMs,
				symbols: summarySymbols,
				enabled: true
			});
			global.summaryScheduler = summaryScheduler;
			
			try {
				await summaryScheduler.execute();
			} catch (error) {
				logger.error({
					err: String(error),
					stack: error.stack
				}, 'Summary 초기 계산 중 오류 발생 (계속 진행)');
				// 초기 계산 실패해도 프로세스는 계속 진행
			}
			
			// 스케줄러 시작 (주기적 실행)
			summaryScheduler.start();
			
			logger.info({
				intervalMs: summaryIntervalMs,
				symbols: summarySymbols
			}, 'Summary Scheduler 초기화 및 시작 완료');
		} else {
			logger.info('Summary 기능이 비활성화되어 있습니다.');
		}

		logger.info('애플리케이션 초기화 완료');
	} catch (error) {
		logger.error({ ex: "APP", err: String(error), stack: error.stack }, "애플리케이션 초기화 실패:");
		process.exit(1);
	}
}

initializeApp().catch((error) => {
	logger.error({ ex: "APP", err: String(error), stack: error.stack }, "Unhandled error in initializeApp():");
	process.exit(1);
});

// 프로세스 종료 시 정리 작업
process.on('SIGTERM', () => {
	logger.info('SIGTERM 신호 수신, 정리 작업 시작...');
	if (global.summaryScheduler) {
		global.summaryScheduler.stop();
	}
	process.exit(0);
});

process.on('SIGINT', () => {
	logger.info('SIGINT 신호 수신, 정리 작업 시작...');
	if (global.summaryScheduler) {
		global.summaryScheduler.stop();
	}
	process.exit(0);
});

