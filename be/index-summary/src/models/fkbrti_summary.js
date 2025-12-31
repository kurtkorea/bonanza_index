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
}

module.exports = FkbrtiSummary;

