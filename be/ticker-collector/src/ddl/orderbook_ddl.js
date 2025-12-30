// ddl.js

async function orderbook_schema(db) {
    try {
        const orderbook = `
            CREATE TABLE tb_order_book_units (
                ts TIMESTAMP,
                exchange_cd SYMBOL CAPACITY 16 CACHE,
                price_id LONG,
                product_id LONG,
                order_tp SYMBOL CAPACITY 8 CACHE,
                price DOUBLE,
                size DOUBLE
            )
            TIMESTAMP(ts)
            PARTITION BY DAY
            WAL
            WITH
            maxUncommittedRows = 500000,
            o3MaxLag = 600000000us;
        `;
        await db.sequelize.query(orderbook);
        console.log("[DDL] tb_order_book_units ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        console.error("[DDL] tb_order_book_units error", error);
    }
}

module.exports = { orderbook_schema };
