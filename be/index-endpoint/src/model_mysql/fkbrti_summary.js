const { Sequelize, DataTypes } = require("sequelize");

class FkbrtiSummary extends Sequelize.Model {
    static init(sequelize) {
        return super.init(
            {
                id: {
                    type: DataTypes.BIGINT,
                    autoIncrement: true,
                    primaryKey: true,
                },
                symbol: {
                    type: DataTypes.STRING(128),
                    allowNull: false,
                },
                interval: {
                    type: DataTypes.STRING(128),
                    allowNull: false,
                },
                second: {
                    type: DataTypes.STRING(128),
                    allowNull: false,
                },
                diff_min: {
                    type: DataTypes.DOUBLE,
                    allowNull: false,
                },
                diff_max: {
                    type: DataTypes.DOUBLE,
                    allowNull: false,
                },
                diff_avg: {
                    type: DataTypes.DOUBLE,
                    allowNull: false,
                },
                ratio_min: {
                    type: DataTypes.DOUBLE,
                    allowNull: false,
                },
                ratio_max: {
                    type: DataTypes.DOUBLE,
                    allowNull: false,
                },
                ratio_avg: {
                    type: DataTypes.DOUBLE,
                    allowNull: false,
                },
                statTime: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    comment: '통계 시간',
                },
            },
            {
                sequelize,
                modelName: "FkbrtiSummary",
                tableName: "tb_fkbrti_summary",
                charset: "utf8mb4",
                collate: "utf8mb4_unicode_ci",
                // 각 (symbol, interval, second) 조합별로 최근 1건만 유지
                indexes: [{ unique: true, fields: ["symbol", "interval", "second"] }],
                timestamps: true,
                createdAt: true,
                updatedAt: true,
            }
        );
    }

    /**
     * 통계 데이터 조회
     * @param {string} symbol - 심볼 (예: "KRW-BTC")
     * @returns {Promise<Array>} 통계 데이터 배열
     */
    static async getStats(symbol) {
        try {
            const stats = await this.findAll({
                where: {
                    symbol: symbol
                },
                attributes: [
                    'interval',
                    'second',
                    'diff_min',
                    'diff_max',
                    'diff_avg',
                    'ratio_min',
                    'ratio_max',
                    'ratio_avg'
                ],
                order: [
                    ['interval', 'ASC'],
                    ['second', 'ASC']
                ],
                raw: true
            });

            // 기존 API 형식에 맞게 변환 (interval을 소문자로 변환)
            return stats.map(row => ({
                interval: String(row.interval).toLowerCase(), // "1D" -> "1d", "1W" -> "1w" 등
                second: row.second,
                diff_min: row.diff_min,
                diff_max: row.diff_max,
                diff_avg: row.diff_avg,
                ratio_min: row.ratio_min,
                ratio_max: row.ratio_max,
                ratio_avg: row.ratio_avg
            }));
        } catch (error) {
            console.error('통계 조회 에러:', error);
            throw error;
        }
    }
}

module.exports = FkbrtiSummary;

