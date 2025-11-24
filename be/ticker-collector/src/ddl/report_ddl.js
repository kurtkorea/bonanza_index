// ddl.js
const logger = require('../utils/logger.js');

async function report_schema(db) {
    try {
        const systemlog = `
        CREATE TABLE IF NOT EXISTS tb_report (
            title           TEXT,
            content         TEXT,
            createdAt       TIMESTAMP
        ) TIMESTAMP(createdAt)
            PARTITION BY DAY
            WAL;`;
        await db.sequelize.query(systemlog);
        logger.info({ ex: "DDL" }, "[DDL] tb_report ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        logger.error({ ex: "DDL", err: String(error), stack: error.stack }, "[DDL] tb_report error");
    }
}   

module.exports = { report_schema };
