const { Sequelize, DataTypes } = require("sequelize");
const crypto = require("crypto");

class IndexProcessInfo extends Sequelize.Model {
    static init(sequelize) {
        return super.init(
            {
                id: {
                    type: DataTypes.BIGINT,
                    autoIncrement: true,
                    primaryKey: true,
                },
                process_id: {
                    type: DataTypes.STRING(128),
                    allowNull: false,
                },
                process_info: {
                    type: DataTypes.TEXT,
                    allowNull: false,
                    defaultValue: "",
                },
                createdAt: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                },
                updatedAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
            },
            {
                sequelize,
                modelName: "IndexProcessInfo",
                tableName: "tb_index_process_info",
                charset: "utf8mb4",
                collate: "utf8mb4_unicode_ci",
                indexes: [{ unique: true, fields: ["process_id"] }],
                timestamps: true,
                createdAt: true,
                updatedAt: true,
                hooks: {
                    beforeCreate: (instance) => {
                        if (!instance.process_id) {
                            instance.process_id = crypto.randomUUID();
                        }
                    }
                }
            }
        );
    }

    /**
     * process_id 값으로 프로세스 정보를 조회합니다.
     * @param {string} process_id 
     * @returns {Promise<IndexProcessInfo|null>}
     */
    static async getProcessInfo(process_id) {
        return this.findOne({ where: { process_id } });
    }

    /**
     * 상세한 프로세스 정보를 조회합니다.
     * @param {string} exchange_cd 
     * @param {string} price_id 
     * @param {string} product_id 
     * @returns {Promise<Array<Object>>}
     */
    static async getProcessInfoDetail(exchange_cd, price_id, product_id) {
        const query = `
            SELECT
                A.exchange_cd,
                A.price_id,
                A.product_id,
                A.exchange_won_code,
                B.exchange_nm,
                B.api_url,
                B.wss_url,
                C.code AS price_id_cd,
                D.code AS product_id_cd,
                CONCAT(C.code, '-', D.code ) AS symbol
            FROM tb_coin_exchange AS A
            INNER JOIN tb_exchange AS B ON A.exchange_cd = B.EXCHANGE_CD
            LEFT JOIN tb_coin_code AS C ON A.price_id = C.id
            LEFT JOIN tb_coin_code AS D ON A.product_id = D.id
            WHERE A.use_yn = 'Y'
              AND A.exchange_cd = ?
              AND A.price_id = ?
              AND A.product_id = ?
        `;
        const result = await this.sequelize.query(query, {
            type: Sequelize.QueryTypes.SELECT,
            replacements: [exchange_cd, price_id, product_id]
        });

        for ( const item of result ) {
            if ( item.exchange_cd === "E0020001" ) {
                item.wss_url = "wss://ws-api.bithumb.com/websocket/v1";
            }
        }
        
        return result;
    }

    static async getMasterInfo() {
        const process_info = `
            SELECT process_info FROM tb_index_process_info WHERE process_id LIKE 'collector-process%'
        `;
        const result = await this.sequelize.query(process_info, {
            type: Sequelize.QueryTypes.SELECT
        });

        let master_info = [];

        if ( result.length > 0 ) {
            const items = JSON.parse(result[0].process_info);
            for ( const item of items ) {
                const process_info_detail = await this.getProcessInfoDetail(item.exchange_cd, item.price_id, item.product_id);
                master_info.push(process_info_detail[0]);
            }
        }

        let symbols = new Set();
        for ( const item of master_info ) {
            symbols.add(item.symbol);
        }  
        return {master_info, symbols: Array.from(symbols)};
    }    
}

module.exports = IndexProcessInfo;
