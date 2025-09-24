/*
    지수 계산을 위해서 호가 데이터를 구독하는 서비스
*/

const zmq = require('zeromq');
const { process_time_weight_execution } = require('./fkbrti_engine');
const { logError, safeAsync, validateObject } = require('../utils/errorHandler');

const { FkbrtiEngine } = require("./fkbrti_engine");

const _FkbrtiEngine_ = new FkbrtiEngine();
_FkbrtiEngine_.start();

async function init_zmq_subscriber( topic = '101' ) {
    console.log('Initializing ZMQ Subscriber...');
    
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 5000; // 5초

    while (reconnectAttempts < maxReconnectAttempts) {
        try {
            const sub = new zmq.Subscriber();
            
            // ZMQ 연결
            sub.connect(process.env.ZMQ_SUB_HOST);
            console.log('ZMQ Subscriber connected to:', process.env.ZMQ_SUB_HOST);
            
            for (const topic of process.env.SUB_TOPICS.split(',')) {
              sub.subscribe(topic);
              console.log('Subscribed to topic: ', topic);
            }
            
            // 연결 성공시 재연결 카운터 리셋
            reconnectAttempts = 0;
      
            // ZMQ 메시지 수신 루프
            try {
                for await (const [topic, payload] of sub) {
                    const result = await safeAsync(async () => {
                        const orderbook_item = JSON.parse(payload.toString());
                        
                        // 데이터 유효성 검사
                        validateObject(orderbook_item, 'orderbook_item');
                       
                        if ( _FkbrtiEngine_ != null ) {

                          // console.log("orderbook_item", orderbook_item);

                          _FkbrtiEngine_.onSnapshot(orderbook_item);
                        }
                        
                        
                        return true;
                    }, 'ZMQ 데이터 처리', false);
                    
                    if (!result) {
                        console.error('원본 payload:', payload.toString());
                    }
                }
            } catch (error) {
                console.error('ZMQ 메시지 수신 중 에러:', error);
                // 연결이 끊어진 경우 재연결 시도
                break;
            }
        } catch (error) {
            reconnectAttempts++;
            console.error(`ZMQ Subscriber 연결 실패 (시도 ${reconnectAttempts}/${maxReconnectAttempts}):`, error.message);
            
            if (reconnectAttempts >= maxReconnectAttempts) {
                console.error('최대 재연결 시도 횟수에 도달했습니다. ZMQ Subscriber를 종료합니다.');
                throw error;
            }
            
            console.log(`${reconnectDelay/1000}초 후 재연결을 시도합니다...`);
            await new Promise(resolve => setTimeout(resolve, reconnectDelay));
        }
    }
}

module.exports = {
    init_zmq_subscriber
}