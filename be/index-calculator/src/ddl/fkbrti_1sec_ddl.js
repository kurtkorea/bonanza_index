// ddl.js
const logger = require('../utils/logger.js');

async function fkbrti_1sec_schema(quest_db) {
    try {
        const fkbrti_1sec = `
        CREATE TABLE IF NOT EXISTS tb_fkbrti_1sec (
            tran_date       SYMBOL,
            tran_time       SYMBOL,        
            symbol          SYMBOL CAPACITY 128,
            vwap_buy      DOUBLE,
            vwap_sell     DOUBLE,
            index_mid     DOUBLE,
            expected_status TEXT,
            no_data         BOOLEAN,
            provisional     BOOLEAN,
            no_publish      BOOLEAN,            
            actual_avg      DOUBLE,
            diff            DOUBLE,
            ratio           DOUBLE,
            createdAt       TIMESTAMP
        ) TIMESTAMP(createdAt)
            PARTITION BY DAY
            WAL;`;
        await quest_db.sequelize.query(fkbrti_1sec);
        logger.info({ ex: "DDL" }, "[DDL] tb_fkbrti_1sec ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        logger.error({ ex: "DDL", err: String(error), stack: error.stack }, "[DDL] tb_fkbrti_1sec error");
    }
    
}

module.exports = { fkbrti_1sec_schema };
