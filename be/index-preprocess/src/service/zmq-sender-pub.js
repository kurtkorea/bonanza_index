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

const { db, Sequelize, QueryTypes } = require("../db/db.js");
const { parseJSON } = require("../utils/common.js");

let pub = null;
let q = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000; // 5초

// 초기화 함수
async function init_zmq_pub() {
  if (!pub) {
    try {
      console.log(`Initializing ZMQ Pub socket on port ${process.env.ZMQ_PUB_PORT}...`);
      
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
      
      console.log(`✅ ZMQ Pub socket initialized successfully on port ${process.env.ZMQ_PUB_PORT}`);
    } catch (error) {
      console.error("❌ Failed to initialize ZMQ Pub socket:", error);
      
      // 정리
      if (pub) {
        try {
          pub.close();
        } catch (closeError) {
          console.warn("Error closing failed socket:", closeError.message);
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

    // console.log("send_publisher", topic, payload);

    // 초기화가 필요한 경우
    if (!q || !pub) {
      await init_zmq_pub();
    }
    
    // 초기화 후에도 실패한 경우
    if (!q || !pub) {
      console.error("ZMQ queue or socket is not initialized");
      return Promise.resolve();
    }
    
    // 소켓 상태 확인
    if (typeof pub.send !== 'function') {
      console.error("ZMQ socket is not properly initialized");
      return Promise.resolve();
    }
    
    const query = `SELECT
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
                      expected_exchanges,  
                      sources,
                      expected_status,
                      provisional,
                      no_publish
                    FROM tb_fkbrti_1sec ORDER BY createdAT DESC
                    LIMIT 1`;

    const results = await db.sequelize.query(query, {
      replacements: {},
      type: QueryTypes.SELECT,
      raw: true,
    });

    const datalist = results.map(item => ({
			...item,
			createdAt: new Date(item.createdAt.getTime() + 18 * 60 * 60 * 1000).toISOString(),
			expected_exchanges: parseJSON(item.expected_exchanges),
			sources: parseJSON(item.sources),
			expected_status: parseJSON(item.expected_status)
		}));

    return await q.send([topic, JSON.stringify(datalist[0])]);
    
  } catch (error) {
    console.error("send_pub error:", error);
    
    // 연결 관련 에러인 경우 재연결 시도
    if (error.message.includes("socket") || error.message.includes("bind") || error.message.includes("ZMQ") || error.message.includes("not initialized")) {
      console.log("Attempting to reconnect ZMQ due to error:", error.message);
      try {
        const reconnectSuccess = await reconnectZMQ();
        if (reconnectSuccess && q && pub) {
          console.log("Retrying message send after reconnection...");
          const payload_str = JSON.stringify(payload);
          return await q.send([topic, payload_str]);
        } else {
          console.error("Reconnection failed, message will be dropped");
        }
      } catch (reconnectError) {
        console.error("Failed to reconnect ZMQ:", reconnectError);
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
    console.error(`Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
    return false;
  }
  
  reconnectAttempts++;
  console.log(`Starting ZMQ reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
  
  try {
    // 기존 연결 정리
    if (pub) {
      try {
        pub.close();
        console.log("Previous ZMQ socket closed");
      } catch (closeError) {
        console.warn("Error closing previous socket:", closeError.message);
      }
    }
    
    // 변수 초기화
    pub = null;
    q = null;
    
    // 잠시 대기 (소켓 정리 시간)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 새 연결 시도
    await init_zmq_pub();
    console.log("✅ ZMQ reconnected successfully");
    
    // 성공 시 재연결 시도 횟수 리셋
    reconnectAttempts = 0;
    return true;
  } catch (error) {
    console.error(`❌ Failed to reconnect ZMQ (attempt ${reconnectAttempts}):`, error);
    pub = null;
    q = null;
    
    // 다음 재연결 시도까지 대기
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      console.log(`Waiting ${RECONNECT_DELAY/1000} seconds before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));
    }
    
    return false;
  }
}

// 재연결 시도 횟수 리셋 함수
function resetReconnectAttempts() {
  reconnectAttempts = 0;
  console.log("ZMQ reconnect attempts reset");
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