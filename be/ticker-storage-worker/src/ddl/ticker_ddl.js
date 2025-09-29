// ddl.js
const db = require("../db/db.js");

async function ticker_schema(db) {
    try {
        const ticker = `
        CREATE TABLE IF NOT EXISTS tb_ticker (
            symbol       SYMBOL CAPACITY 128,
            exchange_no  SYMBOL CAPACITY 128,
            exchange_name SYMBOL CAPACITY 128,
            open        DOUBLE,
            high        DOUBLE,
            low         DOUBLE,
            close       DOUBLE,
            volume      DOUBLE,
            marketAt     TIMESTAMP,
            collectorAt    TIMESTAMP,
            dbAt         TIMESTAMP,
            diff_ms      DOUBLE,
            diff_ms_db   DOUBLE
        ) TIMESTAMP(marketAt)
            PARTITION BY DAY
            WAL;`;
        await db.sequelize.query(ticker);
        console.log("[DDL] tb_ticker ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        console.error("[DDL] tb_ticker error", error);
    }
}

module.exports = { ticker_schema };
