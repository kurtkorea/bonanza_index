/*
  ZMQ PUSH 방식으로 메시지를 전송한다.
  PURPOSE: 외부 시스템에 메시지를 전송하기 위해 사용 ORDERBOOK 및 TICKER 등을 전송
           PUB 로 전송 받은 프로세스에서는 DB에 저장하거나 다른 시스템에 전송.
  USAGE: 
    await send_pub(topic, ts, payload);
  PARAMETERS:
    topic: 메시지 토픽
    ts: 메시지 시간
    payload: 메시지 내용
  RETURN:
    Promise
  EXAMPLE:
    await send_pub("topic", Date.now(), { message: "Hello, World!" });
*/

const zmq = require("zeromq");
const { ZmqSendQueuePub } = require("./zmq-sender-pub.queue.js");

const { quest_db, Sequelize, QueryTypes } = require("../db/quest_db.js");
const { parseJSON } = require("./common.js");
const logger = require('./logger.js');

let pub = null;
let q = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000; // 5초

// 초기화 함수
async function init_zmq_pub() {
  if (!pub) {
    try {
      logger.info({ ex: "ZMQ", port: process.env.ZMQ_PUB_PORT }, `Initializing ZMQ Pub socket on port ${process.env.ZMQ_PUB_PORT}...`);
      
      // ZMQ 소켓 생성
      pub = new zmq.Publisher();
      
      // 소켓이 올바르게 생성되었는지 확인
      if (!pub || typeof pub.bind !== 'function') {
        throw new Error('Failed to create ZMQ Pub socket');
      }
      
      // 바인딩 시도
      await pub.bind(`tcp://0.0.0.0:${process.env.ZMQ_PUB_PORT}`);
      
      // 큐 생성
      q = new ZmqSendQueuePub(pub);
      
      logger.info({ ex: "ZMQ", port: process.env.ZMQ_PUB_PORT }, `✅ ZMQ Pub socket initialized successfully on port ${process.env.ZMQ_PUB_PORT}`);
    } catch (error) {
      logger.error({ ex: "ZMQ", err: String(error), stack: error.stack }, "❌ Failed to initialize ZMQ Pub socket");
      
      // 정리
      if (pub) {
        try {
          pub.close();
        } catch (closeError) {
          logger.warn({ ex: "ZMQ", err: closeError.message }, "Error closing failed socket");
        }
      }
      
      pub = null;
      q = null;
      throw error;
    }
  }
}

async function send_publisher(topic, payload) {
  try {

    // 초기화가 필요한 경우
    if (!q || !pub) {
      await init_zmq_pub();
    }
    
    // 초기화 후에도 실패한 경우
    if (!q || !pub) {
      logger.error({ ex: "ZMQ" }, "ZMQ queue or socket is not initialized");
      return Promise.resolve();
    }
    
    // 소켓 상태 확인
    if (typeof pub.send !== 'function') {
      logger.error({ ex: "ZMQ" }, "ZMQ socket is not properly initialized");
      return Promise.resolve();
    }

    const query_1s = `SELECT *
                      FROM (
                        SELECT
                            createdAt,
                            vwap_buy,
                            vwap_sell,
                            index_mid AS fkbrti_1s,
                            avg(index_mid) OVER (
                                ORDER BY createdAt
                                ROWS BETWEEN 4 PRECEDING AND CURRENT ROW
                            ) AS fkbrti_5s,
                            avg(index_mid) OVER (
                                ORDER BY createdAt
                                ROWS BETWEEN 9 PRECEDING AND CURRENT ROW
                            ) AS fkbrti_10s,
                            actual_avg,
                            diff,
                            ratio,
                            expected_status,
                            provisional,
                            no_publish
                        FROM (
                            SELECT *
                            FROM tb_fkbrti_1sec
                            WHERE symbol = :symbol
                              AND index_mid IS NOT NULL
                              AND createdAt >= dateadd('m', -1, now())   -- 최근 1분(원하는 범위로 조절)
                            ORDER BY createdAt ASC
                        )
                      )
                      ORDER BY createdAt DESC
                      LIMIT 10;`;

    // 쿼리 실행 시 타임아웃 및 재시도 로직 추가
    let results;
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        results = await quest_db.sequelize.query(query_1s, {
          replacements: { symbol: payload.symbol },
          type: QueryTypes.SELECT,
          raw: true,
          timeout: 30000, // 쿼리 실행 타임아웃 30초
        });
        break; // 성공 시 루프 종료
      } catch (error) {
        retryCount++;
        const isConnectionError = error.name === 'SequelizeConnectionAcquireTimeoutError' || 
                                  error.name === 'SequelizeConnectionError' ||
                                  error.message.includes('timeout') ||
                                  error.message.includes('Connection');
        
        if (isConnectionError && retryCount < maxRetries) {
          const delay = Math.min(1000 * retryCount, 5000); // 지수 백오프 (최대 5초)
          logger.warn({ 
            ex: "ZMQ", 
            err: String(error), 
            retryCount, 
            maxRetries,
            delay 
          }, `QuestDB 쿼리 재시도 중... (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          // 재시도 실패 또는 연결 에러가 아닌 경우 에러 throw
          throw error;
        }
      }
    }    
    

    const datalist = results.map(item => ({
			...item,
			createdAt: new Date(item.createdAt.getTime() + 9 * 60 * 60 * 1000).toISOString(),  // UTC -> KST 변환 (+9시간)
			expected_status: parseJSON(item.expected_status)
		}));

    // console.log ( "datalist", datalist );

    topic = topic + "/" + payload.symbol;
    return await q.send([topic, JSON.stringify(datalist)]);
    
    
  } catch (error) {
    logger.error({ ex: "ZMQ", err: String(error), stack: error.stack }, "send_pub error");
    
    // 연결 관련 에러인 경우 재연결 시도
    if (error.message.includes("socket") || error.message.includes("bind") || error.message.includes("ZMQ") || error.message.includes("not initialized")) {
      logger.info({ ex: "ZMQ", err: error.message }, "Attempting to reconnect ZMQ due to error");
      try {
        const reconnectSuccess = await reconnectZMQ();
        if (reconnectSuccess && q && pub) {
          logger.info({ ex: "ZMQ" }, "Retrying message send after reconnection...");
          const payload_str = JSON.stringify(payload);
          return await q.send([topic, payload_str]);
        } else {
          logger.error({ ex: "ZMQ" }, "Reconnection failed, message will be dropped");
        }
      } catch (reconnectError) {
        logger.error({ ex: "ZMQ", err: String(reconnectError), stack: reconnectError.stack }, "Failed to reconnect ZMQ");
      }
    }
    
    // ZMQ 초기화 실패 시에도 앱이 크래시되지 않도록 에러를 무시
    return Promise.resolve();
  }
}

// ZMQ 연결 상태 체크 함수
function isZMQConnected() {
  return pub !== null && q !== null;
}

// ZMQ 연결 상태 상세 정보
function getZMQStatus() {
  return {
    pubSocket: pub !== null,
    queue: q !== null,
    connected: isZMQConnected(),
    port: process.env.ZMQ_PUB_PORT || 'undefined',
    reconnectAttempts: reconnectAttempts,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS
  };
}

// ZMQ 헬스체크 함수
async function healthCheckZMQ() {
  try {
    if (!isZMQConnected()) {
      return { status: 'disconnected', message: 'ZMQ not initialized' };
    }
    
    // 간단한 테스트 메시지 전송으로 연결 상태 확인
    const testPayload = { healthCheck: true, timestamp: Date.now() };
    await q.send(['health-check', Date.now(), JSON.stringify(testPayload)]);
    
    return { status: 'connected', message: 'ZMQ is healthy' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

// ZMQ 재연결 함수
async function reconnectZMQ() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logger.error({ ex: "ZMQ", maxAttempts: MAX_RECONNECT_ATTEMPTS }, `Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
    return false;
  }
  
  reconnectAttempts++;
  logger.info({ ex: "ZMQ", attempt: reconnectAttempts, maxAttempts: MAX_RECONNECT_ATTEMPTS }, `Starting ZMQ reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
  
  try {
    // 기존 연결 정리
    if (pub) {
      try {
        pub.close();
        logger.info({ ex: "ZMQ" }, "Previous ZMQ socket closed");
      } catch (closeError) {
        logger.warn({ ex: "ZMQ", err: closeError.message }, "Error closing previous socket");
      }
    }
    
    // 변수 초기화
    pub = null;
    q = null;
    
    // 잠시 대기 (소켓 정리 시간)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 새 연결 시도
    await init_zmq_pub();
    logger.info({ ex: "ZMQ" }, "✅ ZMQ reconnected successfully");
    
    // 성공 시 재연결 시도 횟수 리셋
    reconnectAttempts = 0;
    return true;
  } catch (error) {
    logger.error({ ex: "ZMQ", err: String(error), stack: error.stack, attempt: reconnectAttempts }, `❌ Failed to reconnect ZMQ (attempt ${reconnectAttempts})`);
    pub = null;
    q = null;
    
    // 다음 재연결 시도까지 대기
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      logger.info({ ex: "ZMQ", delay: RECONNECT_DELAY/1000 }, `Waiting ${RECONNECT_DELAY/1000} seconds before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));
    }
    
    return false;
  }
}

// 재연결 시도 횟수 리셋 함수
function resetReconnectAttempts() {
  reconnectAttempts = 0;
  logger.info({ ex: "ZMQ" }, "ZMQ reconnect attempts reset");
}

module.exports = {
    init_zmq_pub,
    send_publisher,
    isZMQConnected,
    reconnectZMQ,
    getZMQStatus,
    healthCheckZMQ,
    resetReconnectAttempts,
};