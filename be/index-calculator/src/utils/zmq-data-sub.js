/*
    지수 계산을 위해서 호가 데이터를 구독하는 서비스
*/

const zmq = require('zeromq');
const { logError, safeAsync, validateObject } = require('./errorHandler.js');
const { FkbrtiEngine } = require("../service/fkbrti_engine.js");
const logger = require('./logger.js');

const { latestTickerByExchange, latestTradeByExchange, latestDepthByExchange } = require('./common.js');

// 거래소별 ticker의 최종 데이터를 담기 위한 Map 추가

let map_fkbrti_1sec = new Map();

async function init_zmq_depth_subscriber(subscribe_exchange) {
    logger.info({ ex: "ZMQ" }, 'Initializing ZMQ depthSubscriber...');
    
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 5000; // 5초

    while (reconnectAttempts < maxReconnectAttempts) {
        try {
            const sub_depth = new zmq.Subscriber();
            
            // ZMQ 연결
            sub_depth.connect(process.env.ZMQ_SUB_DEPTH_HOST);
            
            // 연결 후 소켓이 완전히 준비될 때까지 짧은 지연 (200ms)
            await new Promise(resolve => setTimeout(resolve, 200));
            
            logger.info({ ex: "ZMQ", host: process.env.ZMQ_SUB_DEPTH_HOST }, 'ZMQ Depth Subscriber connected to');
            
            for (const topic of subscribe_exchange) {
              sub_depth.subscribe(topic.EXCHANGE_CD);
              logger.info({ ex: "ZMQ", topic: topic.EXCHANGE_CD }, 'Subscribed Depth Topic');
            }
            
            // 구독 후 추가 지연 (PUB/SUB 연결 안정화)
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 연결 성공시 재연결 카운터 리셋
            reconnectAttempts = 0;
      
            // ZMQ 메시지 수신 루프
            try {
                for await (const [topic, payload] of sub_depth) {
                    const result = await safeAsync(async () => {
                        const orderbook_item = JSON.parse(payload.toString());
                        // 데이터 유효성 검사
                        validateObject(orderbook_item, 'orderbook_item');

                        if (orderbook_item.hasOwnProperty('raw')) {
                            delete orderbook_item.raw;
                        }

                        const last_key = orderbook_item.exchange_cd + "_" + orderbook_item.symbol;
                        latestDepthByExchange.set(last_key, orderbook_item);
                        
                        if ( !map_fkbrti_1sec.has(orderbook_item.symbol) ) {
                            let fkbrti_1sec = new FkbrtiEngine( { symbol: orderbook_item.symbol, tickMs: 1000, table_name: "tb_fkbrti_1sec" } );
                            fkbrti_1sec.start();
                            map_fkbrti_1sec.set(orderbook_item.symbol, fkbrti_1sec);
                        }
                        const fkbrti_1sec = map_fkbrti_1sec.get(orderbook_item.symbol);
                        if ( fkbrti_1sec != null ) {
                            fkbrti_1sec.onSnapshotOrderBook(orderbook_item);
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
            logger.error({ ex: "ZMQ", err: error.message, attempt: reconnectAttempts, maxAttempts: maxReconnectAttempts }, `ZMQ Depth Subscriber 연결 실패 (시도 ${reconnectAttempts}/${maxReconnectAttempts})`);
            
            if (reconnectAttempts >= maxReconnectAttempts) {
                logger.error({ ex: "ZMQ" }, '최대 재연결 시도 횟수에 도달했습니다. ZMQ Depth Subscriber를 종료합니다.');
                throw error;
            }
            
            logger.info({ ex: "ZMQ", delay: reconnectDelay/1000 }, `${reconnectDelay/1000}초 후 재연결을 시도합니다...`);
            await new Promise(resolve => setTimeout(resolve, reconnectDelay));
        }
    }
}

async function init_zmq_ticker_subscriber(subscribe_exchange) {
    logger.info({ ex: "ZMQ" }, 'Initializing ZMQ ticker Subscriber...');
    
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 5000; // 5초

    while (reconnectAttempts < maxReconnectAttempts) {
        try {
            const sub_ticker = new zmq.Subscriber();
            
            // ZMQ 연결
            sub_ticker.connect(process.env.ZMQ_SUB_TICKER_HOST);
            
            // 연결 후 소켓이 완전히 준비될 때까지 짧은 지연 (200ms)
            await new Promise(resolve => setTimeout(resolve, 200));
            
            logger.info({ ex: "ZMQ", host: process.env.ZMQ_SUB_TICKER_HOST }, 'ZMQ Ticker Subscriber connected to');
            
            for (const topic of subscribe_exchange) {
              sub_ticker.subscribe(topic.EXCHANGE_CD);
              logger.info({ ex: "ZMQ", topic: topic.EXCHANGE_CD }, 'Subscribed Trade Topic');
            }
            
            // 구독 후 추가 지연 (PUB/SUB 연결 안정화)
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 연결 성공시 재연결 카운터 리셋
            reconnectAttempts = 0;
      
            // ZMQ 메시지 수신 루프
            try {
                for await (const [topic, payload] of sub_ticker) {
                    const result = await safeAsync(async () => {

                        const feed_item = JSON.parse(payload.toString());

                        if ( feed_item != null) {

                            validateObject(feed_item, 'feed_item');

                            if (feed_item.hasOwnProperty('raw')) {
                                delete feed_item.raw;
                            }

                            // console.log("Trade=", feed_item);

                            const last_key = feed_item.exchange_cd + "_" + feed_item.symbol;
                            if ( feed_item.type == 'trade') {
                                if (feed_item.hasOwnProperty('raw')) {
                                    delete feed_item.raw;
                                }
                                latestTradeByExchange.set(last_key, feed_item);
                            } else if ( feed_item.type == 'ticker') {
                                if (feed_item.hasOwnProperty('raw')) {
                                    delete feed_item.raw;
                                }
                                latestTickerByExchange.set(last_key, feed_item);
                            }
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
            logger.error({ ex: "ZMQ", err: error.message, attempt: reconnectAttempts, maxAttempts: maxReconnectAttempts }, `ZMQ Ticker Subscriber 연결 실패 (시도 ${reconnectAttempts}/${maxReconnectAttempts})`);
            
            if (reconnectAttempts >= maxReconnectAttempts) {
                logger.error({ ex: "ZMQ" }, '최대 재연결 시도 횟수에 도달했습니다. ZMQ Ticker Subscriber를 종료합니다.');
                throw error;
            }
            
            logger.info({ ex: "ZMQ", delay: reconnectDelay/1000 }, `${reconnectDelay/1000}초 후 재연결을 시도합니다...`);
            await new Promise(resolve => setTimeout(resolve, reconnectDelay));
        }
    }
}

module.exports = {
    init_zmq_depth_subscriber,
    init_zmq_ticker_subscriber,
}