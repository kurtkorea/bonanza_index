// ddl.js
const db = require("../db/db.js");

async function fkbrti_10sec_schema(db) {
    try {
        const fkbrti_10sec = `
        CREATE TABLE IF NOT EXISTS tb_fkbrti_10sec (
            symbol          SYMBOL CAPACITY 128,
            vwap_buy      DOUBLE,
            vwap_sell     DOUBLE,
            index_mid     DOUBLE,
            expected_exchanges TEXT,
            sources         TEXT,
            expected_status TEXT,
            provisional     BOOLEAN,
            no_publish      BOOLEAN,    
            createdAt       TIMESTAMP
        ) TIMESTAMP(createdAt)
            PARTITION BY DAY
            WAL;`;
        await db.sequelize.query(fkbrti_10sec);
        console.log("[DDL] tb_fkbrti_10sec ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        console.error("[DDL] tb_fkbrti_10sec error", error);
    }
}

module.exports = { fkbrti_10sec_schema };
