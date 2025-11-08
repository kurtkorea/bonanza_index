const express = require('express');
const zmq = require("zeromq");
const StompServer = require('stomp-broker-js');

const common = require('../utils/common');

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
            if ( stompServer != null) {
                const items = JSON.parse(msg.toString());
                // console.log("item", JSON.stringify(item, null, 2));
                 try {
                    let new_items = [];
                    for (const item of items) {
                        let new_item = {
                            // createdAt을 한국시간(UTC+9)으로 변환하여 저장
                            createdAt: item?.createdAt,
                            fkbrti_1s: item?.fkbrti_1s,
                            fkbrti_5s: item?.fkbrti_5s,
                            fkbrti_10s: item?.fkbrti_10s,
                            expected_status: item?.expected_status,
                            expected_exchanges: item?.expected_exchanges,
                            sources: item?.sources,
                            vwap_buy: common.isEmpty(item?.vwap_buy) ? 0 : item?.vwap_buy,
                            vwap_sell: common.isEmpty(item?.vwap_sell) ? 0 : item?.vwap_sell,
                            no_publish: item?.no_publish,
                            provisional: item?.provisional,
                            UPBIT: item?.expected_status?.find(item => item?.exchange == "101")?.price,
                            BITTHUMB: item?.expected_status?.find(item => item?.exchange == "102")?.price,
                            COINONE: item?.expected_status?.find(item => item?.exchange == "104")?.price,
                            KORBIT: item?.expected_status?.find(item => item?.exchange == "103")?.price,
                            actual_avg: item?.actual_avg,
                            diff_1: item?.diff_1,
                            diff_5: 0,
                            diff_10: 0,
                            ratio_1: item?.ratio_1,
                            ratio_5: 0,
                            ratio_10: 0,                    
                        };

                        let sum = 0;
                        let count = 0;
                        for (const expected_status of item.expected_status) {
                          if (expected_status.reason == "ok") {
                            sum += expected_status.price;
                            count++;
                          }
                        }

                        new_item.actual_avg = common.isEmpty( sum / count ) ? 0 : sum / count;
                
                        let colF = new_item.BITTHUMB;
                        let colI = new_item.UPBIT;
                
                        if (!colI && colI !== 0) {
                          new_item.diff_1 = colF - new_item.fkbrti_1s;
                        } else {
                          new_item.diff_1 = colI - new_item.fkbrti_1s;
                        }
                
                        if (!colI && colI !== 0) {
                          new_item.diff_5 = colF - new_item.fkbrti_5s;
                        } else {
                          new_item.diff_5 = colI - new_item.fkbrti_5s;
                        }
                
                        if (!colI && colI !== 0) {
                          new_item.diff_10 = colF - new_item.fkbrti_10s;
                        } else {
                          new_item.diff_10 = colI - new_item.fkbrti_10s;
                        }
                
                        if (!colI && colI !== 0) {
                          new_item.ratio_1 = Math.abs(new_item.diff_1 / colF);
                        } else {
                          new_item.ratio_1 = Math.abs(new_item.diff_1 / colI);
                        }
                        new_item.ratio_1 = new_item.ratio_1 * 100;
                
                        if (!colI && colI !== 0) {
                          new_item.ratio_5 = Math.abs(new_item.diff_5 / colF);
                        } else {
                          new_item.ratio_5 = Math.abs(new_item.diff_5 / colI);
                        }
                        new_item.ratio_5 = new_item.ratio_5 * 100;
                
                        if (!colI && colI !== 0) {
                          new_item.ratio_10 = Math.abs(new_item.diff_10 / colF);
                        } else {
                          new_item.ratio_10 = Math.abs(new_item.diff_10 / colI);
                        }
                        new_item.ratio_10 = new_item.ratio_10 * 100;

                        // console.log ( "new_item", JSON.stringify(new_item, null, 2));

                        new_items.push( new_item );
                    }

                    // console.log("new_items", JSON.stringify(new_items, null, 2));

                    stompServer.send(topic_id, { 'content-type': 'application/json' }, JSON.stringify(new_items));
                 } catch (error) {
                    console.error('Error parsing JSON:', error);
                 }
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

        console.log("port", port);

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
