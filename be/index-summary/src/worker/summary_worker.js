/**
 * Summary 계산 Worker Thread
 * QuestDB 쿼리를 별도 스레드에서 실행하여 메인 스레드의 블로킹을 방지합니다.
 */
const { parentPort } = require('worker_threads');
const path = require('path');
const dotenv = require('dotenv');

// Worker Thread에서 환경 변수 로드
if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: path.join(__dirname, "../../env/prod.env") });
} else {
  dotenv.config({ path: path.join(__dirname, "../../env/dev.env") });
}

const { quest_db, connect_quest_db } = require('../db/quest_db.js');
const logger = require('../utils/logger.js');

// Worker Thread에서 QuestDB 연결 초기화
let dbInitialized = false;

async function ensureDbConnection() {
  if (!dbInitialized) {
    await connect_quest_db();
    dbInitialized = true;
    logger.info('[SummaryWorker] QuestDB 연결 완료');
  }
}

/**
 * 1일 간격 통계 쿼리
 */
async function query1Day(symbol, startTime, endTime) {
  const query = `
    SELECT
      symbol,
      '1d' as interval,
      '1s' AS second,
      round(min(diff),  4) AS diff_min,
      round(max(diff),  4) AS diff_max,
      round(avg(diff),  4) AS diff_avg,
      round(min(ratio), 4) AS ratio_min,
      round(max(ratio), 4) AS ratio_max,
      round(avg(ratio), 4) AS ratio_avg
    FROM tb_fkbrti_1sec
    WHERE createdAt >= :startTime 
      AND createdAt <= :endTime
      AND symbol = :symbol

    UNION ALL

    SELECT
      symbol,
      '1d' as interval,
      '5s' AS second,
      round(min(diff_avg),  4) AS diff_min,
      round(max(diff_avg),  4) AS diff_max,
      round(avg(diff_avg),  4) AS diff_avg,
      round(min(ratio_avg), 4) AS ratio_min,
      round(max(ratio_avg), 4) AS ratio_max,
      round(avg(ratio_avg), 4) AS ratio_avg
    FROM (
      SELECT
        symbol,
        avg(diff)  AS diff_avg,
        avg(ratio) AS ratio_avg
      FROM tb_fkbrti_1sec
      WHERE createdAt >= :startTime 
        AND createdAt <= :endTime
        AND symbol = :symbol
      SAMPLE BY 5s ALIGN TO CALENDAR
    )

    UNION ALL 

    SELECT
      symbol,
      '1d' as interval,
      '10s' AS second,
      round(min(diff_avg),  4) AS diff_min,
      round(max(diff_avg),  4) AS diff_max,
      round(avg(diff_avg),  4) AS diff_avg,
      round(min(ratio_avg), 4) AS ratio_min,
      round(max(ratio_avg), 4) AS ratio_max,
      round(avg(ratio_avg), 4) AS ratio_avg
    FROM (
      SELECT
        symbol,
        avg(diff)  AS diff_avg,
        avg(ratio) AS ratio_avg
      FROM tb_fkbrti_1sec
      WHERE createdAt >= :startTime 
        AND createdAt <= :endTime
        AND symbol = :symbol
      SAMPLE BY 10s ALIGN TO CALENDAR
    )
  `;

  const results = await quest_db.sequelize.query(query, {
    replacements: {
      symbol: symbol,
      startTime: startTime,
      endTime: endTime
    },
    type: quest_db.Sequelize.QueryTypes.SELECT
  });

  return results;
}

/**
 * 1주일 간격 통계 쿼리
 */
async function query1Week(symbol, startTime, endTime) {
  const query = `
    SELECT
      symbol,
      '1w' as interval,
      '1s' AS second,
      round(min(diff),  4) AS diff_min,
      round(max(diff),  4) AS diff_max,
      round(avg(diff),  4) AS diff_avg,
      round(min(ratio), 4) AS ratio_min,
      round(max(ratio), 4) AS ratio_max,
      round(avg(ratio), 4) AS ratio_avg
    FROM tb_fkbrti_1sec
    WHERE createdAt >= :startTime 
      AND createdAt <= :endTime
      AND symbol = :symbol

    UNION ALL

    SELECT
      symbol,
      '1w' as interval,
      '5s' AS second,
      round(min(diff_avg),  4) AS diff_min,
      round(max(diff_avg),  4) AS diff_max,
      round(avg(diff_avg),  4) AS diff_avg,
      round(min(ratio_avg), 4) AS ratio_min,
      round(max(ratio_avg), 4) AS ratio_max,
      round(avg(ratio_avg), 4) AS ratio_avg
    FROM (
      SELECT
        symbol,
        avg(diff)  AS diff_avg,
        avg(ratio) AS ratio_avg
      FROM tb_fkbrti_1sec
      WHERE createdAt >= :startTime 
        AND createdAt <= :endTime
        AND symbol = :symbol
      SAMPLE BY 5m ALIGN TO CALENDAR
    )

    UNION ALL 

    SELECT
      symbol,
      '1w' as interval,
      '10s' AS second,
      round(min(diff_avg),  4) AS diff_min,
      round(max(diff_avg),  4) AS diff_max,
      round(avg(diff_avg),  4) AS diff_avg,
      round(min(ratio_avg), 4) AS ratio_min,
      round(max(ratio_avg), 4) AS ratio_max,
      round(avg(ratio_avg), 4) AS ratio_avg
    FROM (
      SELECT
        symbol,
        avg(diff)  AS diff_avg,
        avg(ratio) AS ratio_avg
      FROM tb_fkbrti_1sec
      WHERE createdAt >= :startTime 
        AND createdAt <= :endTime
        AND symbol = :symbol
      SAMPLE BY 10m ALIGN TO CALENDAR
    )
  `;

  const results = await quest_db.sequelize.query(query, {
    replacements: {
      symbol: symbol,
      startTime: startTime,
      endTime: endTime
    },
    type: quest_db.Sequelize.QueryTypes.SELECT
  });

  return results;
}

/**
 * 1개월 간격 통계 쿼리
 */
async function query1Month(symbol, startTime, endTime) {
  const query = `
    SELECT
      symbol,
      '1m' as interval,
      '1s' AS second,
      round(min(diff_avg),  4) AS diff_min,
      round(max(diff_avg),  4) AS diff_max,
      round(avg(diff_avg),  4) AS diff_avg,
      round(min(ratio_avg), 4) AS ratio_min,
      round(max(ratio_avg), 4) AS ratio_max,
      round(avg(ratio_avg), 4) AS ratio_avg
    FROM (
      SELECT
        symbol,
        avg(diff)  AS diff_avg,
        avg(ratio) AS ratio_avg
      FROM tb_fkbrti_1sec
      WHERE createdAt >= :startTime 
        AND createdAt <= :endTime
        AND symbol = :symbol
      SAMPLE BY 1m ALIGN TO CALENDAR
    )

    UNION ALL 

    SELECT
      symbol,
      '1m' as interval,
      '5s' AS second,
      round(min(diff_avg),  4) AS diff_min,
      round(max(diff_avg),  4) AS diff_max,
      round(avg(diff_avg),  4) AS diff_avg,
      round(min(ratio_avg), 4) AS ratio_min,
      round(max(ratio_avg), 4) AS ratio_max,
      round(avg(ratio_avg), 4) AS ratio_avg
    FROM (
      SELECT
        symbol,
        avg(diff)  AS diff_avg,
        avg(ratio) AS ratio_avg
      FROM tb_fkbrti_1sec
      WHERE createdAt >= :startTime 
        AND createdAt <= :endTime
        AND symbol = :symbol
      SAMPLE BY 5m ALIGN TO CALENDAR
    )

    UNION ALL 

    SELECT
      symbol,
      '1m' as interval,
      '10s' AS second,
      round(min(diff_avg),  4) AS diff_min,
      round(max(diff_avg),  4) AS diff_max,
      round(avg(diff_avg),  4) AS diff_avg,
      round(min(ratio_avg), 4) AS ratio_min,
      round(max(ratio_avg), 4) AS ratio_max,
      round(avg(ratio_avg), 4) AS ratio_avg
    FROM (
      SELECT
        symbol,
        avg(diff)  AS diff_avg,
        avg(ratio) AS ratio_avg
      FROM tb_fkbrti_1sec
      WHERE createdAt >= :startTime 
        AND createdAt <= :endTime
        AND symbol = :symbol
      SAMPLE BY 10m ALIGN TO CALENDAR
    )
  `;

  const results = await quest_db.sequelize.query(query, {
    replacements: {
      symbol: symbol,
      startTime: startTime,
      endTime: endTime
    },
    type: quest_db.Sequelize.QueryTypes.SELECT
  });

  return results;
}

/**
 * 1년 간격 통계 쿼리
 */
async function query1Year(symbol, startTime, endTime) {
  const query = `
    SELECT
      symbol,
      '1y' as interval,
      '1s' AS second,
      round(min(diff_avg),  4) AS diff_min,
      round(max(diff_avg),  4) AS diff_max,
      round(avg(diff_avg),  4) AS diff_avg,
      round(min(ratio_avg), 4) AS ratio_min,
      round(max(ratio_avg), 4) AS ratio_max,
      round(avg(ratio_avg), 4) AS ratio_avg
    FROM (
      SELECT
        symbol,
        avg(diff)  AS diff_avg,
        avg(ratio) AS ratio_avg
      FROM tb_fkbrti_1sec
      WHERE createdAt >= :startTime 
        AND createdAt <= :endTime
        AND symbol = :symbol
      SAMPLE BY 1m ALIGN TO CALENDAR
    )

    UNION ALL 

    SELECT
      symbol,
      '1y' as interval,
      '5s' AS second,
      round(min(diff_avg),  4) AS diff_min,
      round(max(diff_avg),  4) AS diff_max,
      round(avg(diff_avg),  4) AS diff_avg,
      round(min(ratio_avg), 4) AS ratio_min,
      round(max(ratio_avg), 4) AS ratio_max,
      round(avg(ratio_avg), 4) AS ratio_avg
    FROM (
      SELECT
        symbol,
        avg(diff)  AS diff_avg,
        avg(ratio) AS ratio_avg
      FROM tb_fkbrti_1sec
      WHERE createdAt >= :startTime 
        AND createdAt <= :endTime
        AND symbol = :symbol
      SAMPLE BY 5m ALIGN TO CALENDAR
    )

    UNION ALL 

    SELECT
      symbol,
      '1y' as interval,
      '10s' AS second,
      round(min(diff_avg),  4) AS diff_min,
      round(max(diff_avg),  4) AS diff_max,
      round(avg(diff_avg),  4) AS diff_avg,
      round(min(ratio_avg), 4) AS ratio_min,
      round(max(ratio_avg), 4) AS ratio_max,
      round(avg(ratio_avg), 4) AS ratio_avg
    FROM (
      SELECT
        symbol,
        avg(diff)  AS diff_avg,
        avg(ratio) AS ratio_avg
      FROM tb_fkbrti_1sec
      WHERE createdAt >= :startTime 
        AND createdAt <= :endTime
        AND symbol = :symbol
      SAMPLE BY 10m ALIGN TO CALENDAR
    )
  `;

  const results = await quest_db.sequelize.query(query, {
    replacements: {
      symbol: symbol,
      startTime: startTime,
      endTime: endTime
    },
    type: quest_db.Sequelize.QueryTypes.SELECT
  });

  return results;
}

/**
 * Summary 통계를 계산합니다 (병렬 처리).
 */
async function calculateSummary(symbol, oneDayAgo, oneWeekAgo, oneMonthAgo, oneYearAgo, now) {
  // 각 interval별로 병렬 실행하여 성능 향상
  const queries = [
    query1Day(symbol, oneDayAgo.toISOString(), now.toISOString()),
    query1Week(symbol, oneWeekAgo.toISOString(), now.toISOString()),
    query1Month(symbol, oneMonthAgo.toISOString(), now.toISOString()),
    query1Year(symbol, oneYearAgo.toISOString(), now.toISOString())
  ];

  // 병렬 실행
  const results = await Promise.all(queries);
  
  // 결과 합치기
  return results.flat();
}

// Worker Thread 메시지 수신 처리
parentPort.on('message', async (message) => {
  try {
    if (message.type === 'calculate') {
      // DB 연결 확인
      await ensureDbConnection();
      
      const { symbol, oneDayAgo, oneWeekAgo, oneMonthAgo, oneYearAgo, now } = message.data;
      
      logger.debug({ symbol }, '[SummaryWorker] Summary 계산 시작');
      
      const results = await calculateSummary(
        symbol,
        new Date(oneDayAgo),
        new Date(oneWeekAgo),
        new Date(oneMonthAgo),
        new Date(oneYearAgo),
        new Date(now)
      );
      
      logger.debug({ symbol, count: results.length }, '[SummaryWorker] Summary 계산 완료');
      
      // 결과를 메인 스레드로 전송
      parentPort.postMessage({
        type: 'result',
        success: true,
        data: results
      });
    } else if (message.type === 'shutdown') {
      // Worker 종료
      process.exit(0);
    }
  } catch (error) {
    logger.error({
      err: String(error),
      stack: error.stack
    }, '[SummaryWorker] Summary 계산 중 오류 발생');
    
    // 에러를 메인 스레드로 전송
    parentPort.postMessage({
      type: 'error',
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
});

// Worker 초기화 완료 알림
parentPort.postMessage({ type: 'ready' });

