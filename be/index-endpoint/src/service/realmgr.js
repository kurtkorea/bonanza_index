const express = require('express');
const zmq = require("zeromq");
const StompServer = require('stomp-broker-js');

const USER_MESSAGE_TYPES = {
    fkbrti: 'fkbrti',
};

let stompServer = null;

async function runSubscriber() {
    try {
        if (!process.env.ZMQ_SUB_INDEX_HOST) {
            console.log('⚠️ ZMQ_SUB_INDEX_HOST 환경변수가 설정되지 않았습니다. ZMQ 구독을 건너뜁니다.');
            return;
        }

        const sub_sock = new zmq.Subscriber;
        sub_sock.connect(process.env.ZMQ_SUB_INDEX_HOST);

        // Subscribe to all message types
        Object.values(USER_MESSAGE_TYPES).forEach(topic => {
            sub_sock.subscribe(topic);
            console.log(`🔵 Subscribed to topic: ${topic}`);
        });
      
        console.log("🔵 Subscriber connected to !!!", process.env.ZMQ_SUB_INDEX_HOST);
      
        for await (const [topic, msg] of sub_sock) {
            const topic_id = "/topic/" + topic.toString();

            // console.log(topic_id, msg.toString());

            if ( stompServer != null) {
                stompServer.send(topic_id, { 'content-type': 'application/json' }, msg.toString());
            }
        }
    } catch (error) {
        console.error('ZMQ Subscriber 오류:', error);
    }
}

// --- 서버 초기화 ---
const init_server = async (server, port) => {
    try {
        // STOMP broker 생성 (SockJS 어댑터 사용)
        stompServer = new StompServer({
            server: server,     // http server
            path: '/ws',        // WebSocket path
            protocol: 'sockjs'  // SockJS 프로토콜 사용
        });
        
        stompServer.on('connected', (sessionId, headers) => {
            console.log('Client connected:', sessionId);
        });
        
        stompServer.on('disconnected', (sessionId) => {
            console.log('Client disconnected:', sessionId);
        });
        
        stompServer.on('subscribe', (sub) => {
            console.log('Client subscribed:', sub);
        });
        
        stompServer.on('send', (frame) => {
            // console.log('Message received:', frame);
        });

        // ZMQ 구독자 시작 (비동기로 실행)
        runSubscriber().catch(error => {
            console.error('ZMQ 구독자 시작 실패:', error);
        });

        server.listen(port, '0.0.0.0', () => {
            console.log(`🚀 STOMP + REST API 서버 실행: http://0.0.0.0:${port}`);
            console.log(`✅ WebSocket: /ws`);
        });
    } catch (error) {
        console.error('서버 초기화 실패:', error);
        throw error;
    }
};

module.exports = {
    init_server,
};
