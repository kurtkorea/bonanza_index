// ddl.js

async function trade_schema(db) {
    try {
        const trade = `
        CREATE TABLE IF NOT EXISTS tb_exchange_trade (
            tran_dt        STRING,     -- VARCHAR(8)
            exchange_cd    SYMBOL CAPACITY 1024,    -- VARCHAR(8) -> SYMBOL 추천
            sequential_id  STRING,                  -- VARCHAR(30)
            price_id       LONG,                    -- BIGINT
            product_id     LONG,                    -- BIGINT
            tran_tm        STRING,                  -- VARCHAR(6)
            buy_sell_gb    SYMBOL CAPACITY 4,       -- '1'/'2' or 'ASK'/'BID'
            trade_price    DOUBLE,
            trade_volumn   DOUBLE,
            timestamp      LONG,                    -- BIGINT (ms/us timestamp)
            cont_dtm       STRING,                  -- VARCHAR(20)
            marketAt        TIMESTAMP,              -- 거래소에서 찍혀온 시간
            collectorAt    TIMESTAMP,              -- 수집 시간
            dbAt            TIMESTAMP,              -- DB에 저장된 시간
            diff_ms         DOUBLE,                 -- 거래소에서 찍혀온 시간과 수집 시간의 차이
            diff_ms_db      DOUBLE                  -- 거래소에서 찍혀온 시간과 DB에 저장된 시간의 차이
        ) TIMESTAMP(marketAt)
            PARTITION BY DAY
            WAL;`;
        await db.sequelize.query(trade);
        console.log("[DDL] tb_exchange_trade ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        console.error("[DDL] tb_exchange_trade error", error);
    }
}

module.exports = { trade_schema };
