// ddl.js
const db = require("../db/db.js");

async function orderbook_schema() {
    try {
        const orderbook = `
        CREATE TABLE IF NOT EXISTS tb_order_book (
            symbol       SYMBOL CAPACITY 4096,
            exchange_no  INT,
            exchange_name SYMBOL CAPACITY 128,
            seq          LONG,                      -- 거래소 시퀀스(고유)
            side         SYMBOL CAPACITY 4,         -- 'B'/'S'
            price        DOUBLE,
            size         DOUBLE,
            fromAt       TIMESTAMP,                 -- 이벤트 시간(타임스탬프 디자인 컬럼)
            createdAt    TIMESTAMP,
            diff_ms      DOUBLE
        ) TIMESTAMP(fromAt)
            PARTITION BY DAY
            WAL;`;
        await db.sequelize.query(orderbook);
        console.log("[DDL] tb_order_book ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        console.error("[DDL] tb_order_book error", error);
    }
}

module.exports = { orderbook_schema };
