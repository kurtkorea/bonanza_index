// ddl.js
const db = require("../db/db.js");

async function fkbrti_1sec_schema(db) {
    try {
        const fkbrti_1sec = `
        CREATE TABLE IF NOT EXISTS tb_fkbrti_1sec (
            symbol          SYMBOL CAPACITY 128,
            vwap_buy      DOUBLE,
            vwap_sell     DOUBLE,
            index_mid     DOUBLE,
            expected_exchanges TEXT,
            sources         TEXT,
            expected_status TEXT,
            provisional     BOOLEAN,
            no_publish      BOOLEAN,            
            actual_avg      DOUBLE,
            diff            DOUBLE,
            ratio           DOUBLE,
            createdAt       TIMESTAMP
        ) TIMESTAMP(createdAt)
            PARTITION BY DAY
            WAL;`;
        await db.sequelize.query(fkbrti_1sec);
        console.log("[DDL] tb_fkbrti_1sec ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        console.error("[DDL] tb_fkbrti_1sec error", error);
    }
}

module.exports = { fkbrti_1sec_schema };
