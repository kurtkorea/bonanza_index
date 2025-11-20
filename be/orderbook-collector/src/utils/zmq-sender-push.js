/*
  ZMQ PUSH 방식으로 메시지를 전송한다.
  PURPOSE: 외부 시스템에 메시지를 전송하기 위해 사용 ORDERBOOK 및 TICKER 등을 전송
           PUSH 로 전송 받은 프로세스에서는 DB에 저장하거나 다른 시스템에 전송.
  USAGE: 
    await send_push(topic, ts, payload);
  PARAMETERS:
    topic: 메시지 토픽
    ts: 메시지 시간
    payload: 메시지 내용
  RETURN:
    Promise
  EXAMPLE:
    await send_push("topic", Date.now(), { message: "Hello, World!" });
*/

const zmq = require("zeromq");
const { ZmqSendQueuePush } = require("./zmq-sender-push-queue.js");
const logger = require('./logger.js');
let push = null;
let q = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000; // 5초

// 초기화 함수
async function init_zmq_push() {
  if (!push) {
    try {
      logger.info(`Initializing ZMQ Push socket on port ${process.env.ZMQ_PUSH_PORT}...`);
      
      // ZMQ 소켓 생성
      push = new zmq.Push();
      
      // 소켓이 올바르게 생성되었는지 확인
      if (!push || typeof push.bind !== 'function') {
        throw new Error('Failed to create ZMQ Push socket');
      }
      
      // 바인딩 시도
      await push.bind(`tcp://0.0.0.0:${process.env.ZMQ_PUSH_PORT}`);

      // 큐 생성
      q = new ZmqSendQueuePush(push);
      
      logger.info(`✅ ZMQ Push socket initialized successfully on port ${process.env.ZMQ_PUSH_PORT}`);
    } catch (error) {
      logger.error({ ex: "ZMQ", err: String(error) }, "❌ Failed to initialize ZMQ Push socket");
      
      // 정리
      if (push) {
        try {
          push.close();
        } catch (closeError) {
          logger.warn({ ex: "ZMQ", err: String(closeError) }, "Error closing failed socket");
        }
      }
      
      push = null;
      q = null;
      throw error;
    }
  }
}

async function send_push(topic, ts, payload) {
  try {
    // 초기화가 필요한 경우
    if (!q || !push) {
      await init_zmq_push();
    }
    
    // 초기화 후에도 실패한 경우
    if (!q || !push) {
      logger.error({ ex: "ZMQ", err: "ZMQ queue or socket is not initialized" });
      return Promise.resolve();
    }
    
    // 소켓 상태 확인
    if (typeof push.send !== 'function') {
      logger.error({ ex: "ZMQ", err: "ZMQ socket is not properly initialized" });
      return Promise.resolve();
    }
    
    const payload_str = JSON.stringify(payload);

    return await q.send([topic, ts, payload_str]);
  } catch (error) {
    logger.error({ ex: "ZMQ", err: String(error) }, "send_push error");
    
    // 연결 관련 에러인 경우 재연결 시도
    if (error.message.includes("socket") || error.message.includes("bind") || error.message.includes("ZMQ") || error.message.includes("not initialized")) {
      logger.warn({ ex: "ZMQ", err: String(error) }, "Attempting to reconnect ZMQ due to error");
      try {
        const reconnectSuccess = await reconnectZMQ();
        if (reconnectSuccess && q && push) {
          logger.info("Retrying message send after reconnection...");
          const payload_str = JSON.stringify(payload);
          return await q.send([topic, ts, payload_str]);
        } else {
          logger.error("Reconnection failed, message will be dropped");
        }
      } catch (reconnectError) {
        logger.error({ ex: "ZMQ", err: String(reconnectError) }, "Failed to reconnect ZMQ");
      }
    }
    
    // ZMQ 초기화 실패 시에도 앱이 크래시되지 않도록 에러를 무시
    return Promise.resolve();
  }
}

// ZMQ 연결 상태 체크 함수
function isZMQConnected() {
  return push !== null && q !== null;
}

// ZMQ 연결 상태 상세 정보
function getZMQStatus() {
  return {
    pushSocket: push !== null,
    queue: q !== null,
    connected: isZMQConnected(),
    port: process.env.ZMQ_PUSH_PORT || 'undefined',
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
    logger.error(`Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
    return false;
  }
  
  reconnectAttempts++;
  logger.info(`Starting ZMQ reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
  
  try {
    // 기존 연결 정리
    if (push) {
      try {
        push.close();
        logger.info("Previous ZMQ socket closed");
      } catch (closeError) {
        logger.warn({ ex: "ZMQ", err: String(closeError) }, "Error closing previous socket");
      }
    }
    
    // 변수 초기화
    push = null;
    q = null;
    
    // 잠시 대기 (소켓 정리 시간)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 새 연결 시도
    await init_zmq_push();
    logger.info("✅ ZMQ reconnected successfully");
    
    // 성공 시 재연결 시도 횟수 리셋
    reconnectAttempts = 0;
    return true;
  } catch (error) {
    logger.error({ ex: "ZMQ", err: String(error) }, `❌ Failed to reconnect ZMQ (attempt ${reconnectAttempts})`);
    push = null;
    q = null;
    
    // 다음 재연결 시도까지 대기
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      logger.info(`Waiting ${RECONNECT_DELAY/1000} seconds before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));
    }
    
    return false;
  }
}

// 재연결 시도 횟수 리셋 함수
function resetReconnectAttempts() {
  reconnectAttempts = 0;
  logger.info("ZMQ reconnect attempts reset");
}

module.exports = {
    send_push,
    isZMQConnected,
    reconnectZMQ,
    getZMQStatus,
    healthCheckZMQ,
    resetReconnectAttempts,
};