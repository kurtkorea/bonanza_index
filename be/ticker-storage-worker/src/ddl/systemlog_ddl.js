// ddl.js

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
        console.log("[DDL] tb_system_log ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        console.error("[DDL] tb_system_log error", error);
    }
}   

module.exports = { systemlog_schema };
