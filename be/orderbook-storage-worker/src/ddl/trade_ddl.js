// ddl.js
const logger = require('../utils/logger.js');

async function trade_schema(db) {
    try {
        const trade = `
        CREATE TABLE IF NOT EXISTS tb_trade (
            symbol       SYMBOL CAPACITY 128,
            exchange_no  SYMBOL CAPACITY 128,
            exchange_name SYMBOL CAPACITY 128,
            price        DOUBLE,
            volume       DOUBLE,
            side         SYMBOL CAPACITY 4,
            marketAt     TIMESTAMP,
            collectorAt    TIMESTAMP,
            dbAt         TIMESTAMP,
            diff_ms      DOUBLE,
            diff_ms_db   DOUBLE
        ) TIMESTAMP(marketAt)
            PARTITION BY DAY
            WAL;`;
        await db.sequelize.query(trade);
        logger.info("[DDL] tb_trade ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        logger.error({ ex: "DDL", err: String(error), stack: error.stack }, "[DDL] tb_trade error");
    }
}

module.exports = { trade_schema };
