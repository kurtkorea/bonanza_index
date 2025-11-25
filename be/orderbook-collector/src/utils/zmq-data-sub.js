/*
    지수 계산을 위해서 호가 데이터를 구독하는 서비스
*/

const zmq = require('zeromq');
const { safeAsync, validateObject } = require('./errorHandler.js');
const logger = require('./logger.js');
// 순환 참조 방지를 위해 동적 import 사용

async function init_zmq_command_subscriber(topic) {
    logger.info({ ex: "ZMQ" }, 'Initializing ZMQ depthSubscriber...');
    
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 5000; // 5초

    let sub_command = null;

    while (reconnectAttempts < maxReconnectAttempts) {
        try {
            // 기존 소켓이 있으면 정리
            if (sub_command) {
                try {
                    sub_command.close();
                    logger.info({ ex: "ZMQ" }, 'Previous ZMQ Command Subscriber socket closed');
                } catch (closeError) {
                    logger.warn({ ex: "ZMQ", err: String(closeError) }, 'Error closing previous socket');
                }
                sub_command = null;
            }
            
            // 소켓 정리 시간 대기
            if (reconnectAttempts > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            sub_command = new zmq.Subscriber();
            
            // ZMQ 연결
            sub_command.connect(process.env.ZMQ_SUB_COMMAND_HOST);
            logger.info({ ex: "ZMQ", host: process.env.ZMQ_SUB_COMMAND_HOST }, 'ZMQ Command Subscriber connected to');
            
            sub_command.subscribe( "command/" + topic);
            logger.info({ ex: "ZMQ", topic: "command/" + topic }, 'Subscribed Command Topic');
            
            // 연결 성공시 재연결 카운터 리셋
            reconnectAttempts = 0;
      
            // ZMQ 메시지 수신 루프
            try {
                for await (const [topic, payload] of sub_command) {
                    const result = await safeAsync(async () => {
                        const command_item = JSON.parse(payload.toString());
                        validateObject(command_item, 'command_item');

                        if ( command_item.command === "refresh" ) {
                            logger.info({ ex: "ZMQ" }, 'Refresh command received');
                            // 순환 참조 방지를 위해 동적 import
                            const { refresh_websocket_clients } = require('../service/websocket_broker.js');
                            await refresh_websocket_clients();
                            logger.info({ ex: "ZMQ" }, 'WebSocket clients refreshed successfully');
                        }

                        return true;
                    }, 'ZMQ 데이터 처리', false);
                    
                    if (!result) {
                        logger.error({ ex: "ZMQ", payload: payload.toString() }, '원본 payload');
                    }
                }
            } catch (error) {
                logger.error({ ex: "ZMQ", err: String(error), stack: error.stack }, 'ZMQ 메시지 수신 중 에러');
                // 연결이 끊어진 경우 재연결 시도
                break;
            }
        } catch (error) {
            reconnectAttempts++;
            logger.error({ ex: "ZMQ", err: error.message, attempt: reconnectAttempts, maxAttempts: maxReconnectAttempts }, `ZMQ Command Subscriber 연결 실패 (시도 ${reconnectAttempts}/${maxReconnectAttempts})`);
            
            // 소켓 정리
            if (sub_command) {
                try {
                    sub_command.close();
                } catch (closeError) {
                    // 무시
                }
                sub_command = null;
            }
            
            if (reconnectAttempts >= maxReconnectAttempts) {
                logger.error({ ex: "ZMQ" }, '최대 재연결 시도 횟수에 도달했습니다. ZMQ Command Subscriber를 종료합니다.');
                throw error;
            }
            
            logger.info({ ex: "ZMQ", delay: reconnectDelay/1000 }, `${reconnectDelay/1000}초 후 재연결을 시도합니다...`);
            await new Promise(resolve => setTimeout(resolve, reconnectDelay));
        }
    }
}

module.exports = {
    init_zmq_command_subscriber,
}