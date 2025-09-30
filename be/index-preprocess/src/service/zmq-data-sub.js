/*
    지수 계산을 위해서 호가 데이터를 구독하는 서비스
*/

const zmq = require('zeromq');
const { logError, safeAsync, validateObject } = require('../utils/errorHandler');
const { FkbrtiEngine } = require("./fkbrti_engine");

const { latestTickerByExchange, latestTradeByExchange, latestDepthByExchange } = require('../utils/common');

// 거래소별 ticker의 최종 데이터를 담기 위한 Map 추가

let _FkbrtiEngine_1sec_ = null;
let _FkbrtiEngine_5sec_ = null;
let _FkbrtiEngine_10sec_ = null;

async function init_zmq_depth_subscriber() {
    console.log('Initializing ZMQ depthSubscriber...');
    
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 5000; // 5초

    while (reconnectAttempts < maxReconnectAttempts) {
        try {
            const sub_depth = new zmq.Subscriber();
            
            // ZMQ 연결
            await sub_depth.connect(process.env.ZMQ_SUB_DEPTH_HOST);
            console.log('ZMQ Depth Subscriber connected to:', process.env.ZMQ_SUB_DEPTH_HOST);
            
            for (const topic of process.env.SUB_TOPICS.split(',')) {
              sub_depth.subscribe(topic);
              console.log('Subscribed to topic: ', topic);
            }
            
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

                        const last_key = orderbook_item.exchange_no + "_" + orderbook_item.symbol;
                        latestDepthByExchange.set(last_key, orderbook_item);

                        // console.log ( "latestDepthByExchange", latestDepthByExchange);
  
                        if ( _FkbrtiEngine_1sec_ != null ) {
                            _FkbrtiEngine_1sec_.onSnapshotOrderBook(orderbook_item);
                        }

                        if ( _FkbrtiEngine_5sec_ != null ) {
                            _FkbrtiEngine_5sec_.onSnapshotOrderBook(orderbook_item);
                        }

                        if ( _FkbrtiEngine_10sec_ != null ) {
                            _FkbrtiEngine_10sec_.onSnapshotOrderBook(orderbook_item);
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
            console.error(`ZMQ Depth Subscriber 연결 실패 (시도 ${reconnectAttempts}/${maxReconnectAttempts}):`, error.message);
            
            if (reconnectAttempts >= maxReconnectAttempts) {
                console.error('최대 재연결 시도 횟수에 도달했습니다. ZMQ Depth Subscriber를 종료합니다.');
                throw error;
            }
            
            console.log(`${reconnectDelay/1000}초 후 재연결을 시도합니다...`);
            await new Promise(resolve => setTimeout(resolve, reconnectDelay));
        }
    }
}

async function init_zmq_ticker_subscriber() {
    console.log('Initializing ZMQ ticker Subscriber...');
    
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 5000; // 5초

    while (reconnectAttempts < maxReconnectAttempts) {
        try {
            const sub_ticker = new zmq.Subscriber();
            
            // ZMQ 연결
            await sub_ticker.connect(process.env.ZMQ_SUB_TICKER_HOST);
            console.log('ZMQ Ticker Subscriber connected to:', process.env.ZMQ_SUB_TICKER_HOST);
            
            for (const topic of process.env.SUB_TOPICS.split(',')) {
              sub_ticker.subscribe(topic);
              console.log('Subscribed to topic: ', topic);
            }
            
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

                            //메모리에 저장해둔다.
                            if (topic.toString().includes('ticker')) {
                                // console.log("feed_item", JSON.stringify(feed_item, null, 2));
                                // if ( _FkbrtiEngine_ != null ) {
                                //     _FkbrtiEngine_.onSnapshotTicker(feed_item);
                                // }
                                const last_key = feed_item.exchange_no + "_" + feed_item.symbol;
                                if (feed_item.hasOwnProperty('raw')) {
                                    delete feed_item.raw;
                                }
                                latestTickerByExchange.set(last_key, feed_item);
                            } else if (topic.toString().includes('trade')) {
                                // if ( _FkbrtiEngine_ != null ) {
                                //     _FkbrtiEngine_.onSnapshotTrade(feed_item);
                                // }
                                const last_key = feed_item.exchange_no + "_" + feed_item.symbol;
                                if (feed_item.hasOwnProperty('raw')) {
                                    delete feed_item.raw;
                                }
                                latestTradeByExchange.set(last_key, feed_item);
                            }
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
            console.error(`ZMQ Ticker Subscriber 연결 실패 (시도 ${reconnectAttempts}/${maxReconnectAttempts}):`, error.message);
            
            if (reconnectAttempts >= maxReconnectAttempts) {
                console.error('최대 재연결 시도 횟수에 도달했습니다. ZMQ Ticker Subscriber를 종료합니다.');
                throw error;
            }
            
            console.log(`${reconnectDelay/1000}초 후 재연결을 시도합니다...`);
            await new Promise(resolve => setTimeout(resolve, reconnectDelay));
        }
    }
}

function start_fkbrti_engine() {
    try {
        _FkbrtiEngine_1sec_ = new FkbrtiEngine( { symbol: "KRW-BTC", tickMs: 1000, table_name: "tb_fkbrti_1sec" } );
        _FkbrtiEngine_1sec_.start();
        console.log('FkbrtiEngine 1sec 초기화 성공');
    } catch (error) {
        console.error('FkbrtiEngine 1sec 초기화 실패:', error);
    }
    try {
        _FkbrtiEngine_5sec_ = new FkbrtiEngine( { symbol: "KRW-BTC", tickMs: 5000, table_name: "tb_fkbrti_5sec" } );
        _FkbrtiEngine_5sec_.start();
        console.log('FkbrtiEngine 5sec 초기화 성공');
    } catch (error) {
        console.error('FkbrtiEngine 5sec 초기화 실패:', error);
    }
    try {
        _FkbrtiEngine_10sec_ = new FkbrtiEngine( { symbol: "KRW-BTC", tickMs: 10000, table_name: "tb_fkbrti_10sec" } );
        _FkbrtiEngine_10sec_.start();
        console.log('FkbrtiEngine 10sec 초기화 성공');
    } catch (error) {
        console.error('FkbrtiEngine 10sec 초기화 실패:', error);
    }
}

module.exports = {
    init_zmq_depth_subscriber,
    init_zmq_ticker_subscriber,
    start_fkbrti_engine,
}