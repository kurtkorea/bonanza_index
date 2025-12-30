// ddl.js

async function ticker_schema(db) {
    try {
        const ticker = `
        CREATE TABLE IF NOT EXISTS tb_ticker (
            ts           TIMESTAMP,               -- 거래소에서 찍혀온 시간
            symbol       SYMBOL CAPACITY 128,
            exchange_no  SYMBOL CAPACITY 128,
            exchange_name SYMBOL CAPACITY 128,
            open        DOUBLE,
            high        DOUBLE,
            low         DOUBLE,
            close       DOUBLE,
            volume      DOUBLE,
        ) TIMESTAMP(ts)
            PARTITION BY DAY
            WAL
            WITH maxUncommittedRows=500000, o3MaxLag=600000000us;
        ;`;
        await db.sequelize.query(ticker);
        console.log("[DDL] tb_ticker ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        console.error("[DDL] tb_ticker error", error);
    }
}

module.exports = { ticker_schema };
