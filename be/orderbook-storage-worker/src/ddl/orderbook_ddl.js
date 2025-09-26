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
            marketAt       TIMESTAMP,               -- 거래소에서 찍혀온 시간
            coollectorAt   TIMESTAMP,               -- 수집 시간
            dbAt         TIMESTAMP,                 -- DB에 저장된 시간
            diff_ms      DOUBLE,                     -- 거래소에서 찍혀온 시간과 수집 시간의 차이
            diff_ms_db   DOUBLE                     -- 거래소에서 찍혀온 시간과 DB에 저장된 시간의 차이
        ) TIMESTAMP(marketAt)
            PARTITION BY DAY
            WAL;`;
        await db.sequelize.query(orderbook);
        console.log("[DDL] tb_order_book ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        console.error("[DDL] tb_order_book error", error);
    }
}

module.exports = { orderbook_schema };
