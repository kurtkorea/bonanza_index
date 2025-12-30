"use strict";

/**
 * Worker Thread에서 실행되는 배치 처리 로직
 * 메인 스레드와 분리되어 실행됩니다.
 */

const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const dotenv = require('dotenv');

// 환경 변수 로드
if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: path.join(__dirname, "../../env/prod.env") });
} else {
  dotenv.config({ path: path.join(__dirname, "../../env/dev.env") });
}

const { BatchProcessor } = require('../service/batch_processor.js');
const { connect_quest_db, quest_db } = require('../db/quest_db.js');
const db_mysql = require('../models/index.js');
const logger = require('../utils/logger.js');

let processor = null;

// Worker Thread 전용 에러 핸들러
process.on('uncaughtException', (error) => {
  logger.error({
    err: String(error),
    stack: error.stack,
    memoryUsage: process.memoryUsage()
  }, '[BatchWorker] Uncaught Exception - Worker 종료');
  
  // 에러 메시지 전송
  try {
    parentPort.postMessage({
      type: 'error',
      error: {
        message: error.message,
        stack: error.stack,
        memoryUsage: process.memoryUsage()
      }
    });
  } catch (e) {
    // parentPort가 이미 닫혔을 수 있음
  }
  
  // 안전하게 종료
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({
    err: String(reason),
    memoryUsage: process.memoryUsage()
  }, '[BatchWorker] Unhandled Rejection');
  
  // 에러 메시지 전송
  try {
    parentPort.postMessage({
      type: 'error',
      error: {
        message: String(reason),
        memoryUsage: process.memoryUsage()
      }
    });
  } catch (e) {
    // parentPort가 이미 닫혔을 수 있음
  }
});

/**
 * Worker 초기화 및 배치 처리 실행
 */
async function initializeAndProcess() {
  try {
    logger.info({
      workerData
    }, '[BatchWorker] Worker 초기화 시작');

    // QuestDB 연결
    await connect_quest_db();
    logger.info('[BatchWorker] QuestDB 연결 완료');

    // MySQL 연결 확인
    if (!db_mysql.sequelize) {
      throw new Error('MySQL 연결이 초기화되지 않았습니다.');
    }
    await db_mysql.sequelize.authenticate();
    logger.info('[BatchWorker] MySQL 연결 확인 완료');

    // BatchProcessor 초기화
    processor = new BatchProcessor({
      symbol: workerData.symbol || 'KRW-BTC',
      depth: workerData.depth || 15,
      staleMs: workerData.staleMs || 30000,
      expectedExchanges: workerData.expectedExchanges || ['E0010001', 'E0020001', 'E0030001', 'E0050001'],
      tableName: workerData.tableName || 'tb_fkbrti_1sec',
      db_mysql: db_mysql,
      // GC 관리 옵션
      chunkSizeHours: workerData.chunkSizeHours || 1, // 청크 크기 (시간 단위)
      gcInterval: workerData.gcInterval || 10000, // GC 유도 간격 (처리된 초 단위)
      enableGc: workerData.enableGc !== false // GC 유도 활성화 여부
    });

    // 진행 상황 콜백
    const progressCallback = (processed, total) => {
      parentPort.postMessage({
        type: 'progress',
        processed,
        total,
        progress: ((processed / total) * 100).toFixed(2)
      });
    };

    // 배치 처리 실행
    const result = await processor.processBatch(
      workerData.startTime,
      workerData.endTime,
      progressCallback
    );

    // 완료 메시지 전송
    parentPort.postMessage({
      type: 'complete',
      result
    });

    // DB 연결 종료 (안전하게)
    try {
      if (quest_db && quest_db.sequelize) {
        await quest_db.sequelize.close();
        logger.info('[BatchWorker] QuestDB 연결 종료 완료');
      }
    } catch (closeError) {
      logger.warn({ err: String(closeError) }, '[BatchWorker] QuestDB 연결 종료 중 오류');
    }
    
    try {
      if (db_mysql && db_mysql.sequelize) {
        await db_mysql.sequelize.close();
        logger.info('[BatchWorker] MySQL 연결 종료 완료');
      }
    } catch (closeError) {
      logger.warn({ err: String(closeError) }, '[BatchWorker] MySQL 연결 종료 중 오류');
    }
    
    logger.info({ memoryUsage: process.memoryUsage() }, '[BatchWorker] 메모리 사용량 (종료 전)');
    
    // GC 실행
    if (global.gc) {
      try {
        global.gc();
        logger.info({ memoryUsage: process.memoryUsage() }, '[BatchWorker] 메모리 사용량 (GC 후)');
      } catch (gcError) {
        logger.warn({ err: String(gcError) }, '[BatchWorker] GC 실행 중 오류');
      }
    }
    
    logger.info('[BatchWorker] Worker 정상 종료');

  } catch (error) {
    logger.error({
      err: String(error),
      stack: error.stack,
      memoryUsage: process.memoryUsage()
    }, '[BatchWorker] Worker 실행 중 오류 발생');

    // 오류 메시지 전송
    try {
      parentPort.postMessage({
        type: 'error',
        error: {
          message: error.message,
          stack: error.stack,
          memoryUsage: process.memoryUsage()
        }
      });
    } catch (msgError) {
      logger.warn({ err: String(msgError) }, '[BatchWorker] 에러 메시지 전송 실패');
    }

    // DB 연결 정리 (에러 발생 시에도)
    try {
      if (quest_db && quest_db.sequelize) {
        await quest_db.sequelize.close();
        logger.info('[BatchWorker] QuestDB 연결 종료 완료 (에러 발생 후)');
      }
    } catch (closeError) {
      logger.warn({ err: String(closeError) }, '[BatchWorker] QuestDB 연결 종료 중 오류');
    }
    
    try {
      if (db_mysql && db_mysql.sequelize) {
        await db_mysql.sequelize.close();
        logger.info('[BatchWorker] MySQL 연결 종료 완료 (에러 발생 후)');
      }
    } catch (closeError) {
      logger.warn({ err: String(closeError) }, '[BatchWorker] MySQL 연결 종료 중 오류');
    }
    
    // GC 실행
    if (global.gc) {
      try {
        global.gc();
        logger.info({ memoryUsage: process.memoryUsage() }, '[BatchWorker] GC 실행 완료 (에러 발생 후)');
      } catch (gcError) {
        logger.warn({ err: String(gcError) }, '[BatchWorker] GC 실행 중 오류');
      }
    }

    // Worker 종료 (에러 발생 시에도 정상 종료)
    // process.exit를 호출하지 않고 자연스럽게 종료되도록 함
    logger.info('[BatchWorker] Worker 종료 (에러 발생 후)');
  }
}

// 메인 스레드로부터 메시지 수신 (취소 요청 등)
parentPort.on('message', (message) => {
  if (message.type === 'cancel') {
    logger.info('[BatchWorker] 취소 요청 수신');
    // 처리 중인 작업을 취소할 수 있는 로직 추가 가능
    process.exit(0);
  }
});

// Worker 시작
initializeAndProcess();

