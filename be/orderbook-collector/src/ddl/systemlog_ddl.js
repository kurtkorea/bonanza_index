// ddl.js
const logger = require('../utils/logger.js');
async function systemlog_schema(db) {
    try {
        const systemlog = `
        CREATE TABLE IF NOT EXISTS tb_system_log (
            content         TEXT,
            createdAt       TIMESTAMP
        ) TIMESTAMP(createdAt)
            PARTITION BY DAY
            WAL;`;
        await db.sequelize.query(systemlog);
        logger.info("[DDL] tb_system_log ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        logger.error({ ex: "DDL", err: String(error) }, "[DDL] tb_system_log error");
    }
}   

module.exports = { systemlog_schema };
