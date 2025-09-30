// ddl.js
const db = require("../db/db.js");

async function fkbrti_5sec_schema(db) {
    try {
        const fkbrti_5sec = `
        CREATE TABLE IF NOT EXISTS tb_fkbrti_5sec (
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
        await db.sequelize.query(fkbrti_5sec);
        console.log("[DDL] tb_fkbrti_5sec ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        console.error("[DDL] tb_fkbrti_5sec error", error);
    }
}

module.exports = { fkbrti_5sec_schema };
