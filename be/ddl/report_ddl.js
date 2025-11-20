// ddl.js

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
        console.log("[DDL] tb_report ensured (WAL, PARTITION BY DAY).");
    } catch (error) {
        console.error("[DDL] tb_report error", error);
    }
}   

module.exports = { report_schema };
