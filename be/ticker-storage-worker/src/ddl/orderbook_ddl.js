// ddl.js
/*
    DAYFIN DML
    CREATE TABLE `tb_order_book_units_202508` (
        `tran_date` VARCHAR(8) NOT NULL COMMENT '거래일자' COLLATE 'utf8mb4_general_ci',
        `tran_time` VARCHAR(6) NOT NULL COMMENT '가격ID' COLLATE 'utf8mb4_general_ci',
        `exchange_cd` VARCHAR(8) NOT NULL COMMENT '거래소코드 ' COLLATE 'utf8mb4_general_ci',
        `price_id` BIGINT(20) NOT NULL COMMENT '가격ID',
        `product_id` BIGINT(20) NOT NULL COMMENT '코인ID',
        `order_tp` VARCHAR(1) NOT NULL COMMENT 'ask(매도) : 1, bid(매수) : 2' COLLATE 'utf8mb4_general_ci',
        `price` DOUBLE NOT NULL COMMENT '호가',
        `size` DOUBLE NULL DEFAULT NULL COMMENT '잔량',
        PRIMARY KEY (`tran_date`, `tran_time`, `exchange_cd`, `price_id`, `product_id`, `order_tp`, `price`) USING BTREE
    )
    COMMENT='거래소 호가 상세'
    COLLATE='utf8mb4_general_ci'
    ENGINE=InnoDB
    ;
    DAYFIN DML
*/
const logger = require('../utils/logger.js');

async function orderbook_schema(db) {
    try {
        const orderbook = `
        CREATE TABLE IF NOT EXISTS tb_order_book (
            tran_date       SYMBOL,
            tran_time       SYMBOL,
            exchange_cd     SYMBOL CAPACITY 1024,
            price_id        LONG,
            product_id      LONG,
            order_tp        SYMBOL CAPACITY 4,
            price           DOUBLE,
            size            DOUBLE,                  -- 여기까지 DAYFIN DML과 SYNC 맞춤 (아래부터는 성능 체크용 추가)
            marketAt        TIMESTAMP,               -- 거래소에서 찍혀온 시간
            coollectorAt    TIMESTAMP,               -- 수집 시간
            dbAt            TIMESTAMP,               -- DB에 저장된 시간
            diff_ms         DOUBLE,                  -- 거래소에서 찍혀온 시간과 수집 시간의 차이
            diff_ms_db      DOUBLE                   -- 거래소에서 찍혀온 시간과 DB에 저장된 시간의 차이
        ) TIMESTAMP(marketAt)
            PARTITION BY DAY
            WAL;`;
        await db.sequelize.query(orderbook);
        logger.info("[DDL] tb_order_book ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        logger.error({ ex: "DDL", err: String(error), stack: error.stack }, "[DDL] tb_order_book error");
    }
}

module.exports = { orderbook_schema };
