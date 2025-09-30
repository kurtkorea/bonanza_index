const Sequelize = require("sequelize");

module.exports = class tb_fkbrti_1sec extends Sequelize.Model {
	static init(sequelize) {
		return super.init(
			{
				symbol: {
					type: Sequelize.STRING(128),
				},
				vwap_buy: {
					type: Sequelize.DOUBLE,
				},
				vwap_sell: {
					type: Sequelize.DOUBLE,
				},
				index_mid: {
					type: Sequelize.DOUBLE,
				},
				expected_exchanges: {
					type: Sequelize.TEXT,
				},
				sources: {
					type: Sequelize.TEXT,
				},
				expected_status: {
					type: Sequelize.TEXT,
				},
				provisional: {
					type: Sequelize.BOOLEAN,
				},
				no_publish: {
					type: Sequelize.BOOLEAN,
				},
				createdAt: {
					type: Sequelize.TIME,
				},
			},
			{
				sequelize,
				modelName: "tb_fkbrti_1sec",
				tableName: "tb_fkbrti_1sec",
				charset: "utf8mb4",
				collate: "utf8mb4_general_ci",
			},
		);
	}

	/**
	 * FKBRTI 지수 계산 (5초, 10초 이동평균 포함)
	 * @param {Object} options - 쿼리 옵션
	 * @param {Date} options.fromDate - 시작 날짜
	 * @param {Date} options.toDate - 종료 날짜
	 * @param {number} options.page - 페이지 번호 (기본값: 1)
	 * @param {number} options.size - 페이지 크기 (기본값: 100)
	 * @param {string} options.order - 정렬 순서 (asc/desc, 기본값: desc)
	 * @returns {Promise<Object>} 계산된 지수 데이터 및 페이징 정보
	 */
	static async getIndexWithMovingAverage(options = {}) {
		const { 
			fromDate, 
			toDate, 
			page = 1, 
			size = 100,
			order = 'desc'
		} = options;
		
		let whereClause = '';
		const replacements = {};

		if (fromDate && toDate) {
			whereClause = 'WHERE createdAt >= :fromDate AND createdAt < :toDate';
			replacements.fromDate = fromDate;
			replacements.toDate = toDate;
		}

		// 전체 개수 조회
		const countQuery = `
			SELECT COUNT(*) as total
			FROM tb_fkbrti_1sec
			${whereClause}
		`;

		const countResult = await this.sequelize.query(countQuery, {
			replacements,
			type: Sequelize.QueryTypes.SELECT,
			raw: true
		});

		const totalCount = parseInt(countResult[0].total);
		const totalPages = Math.ceil(totalCount / size);

		// 데이터 조회 - QuestDB는 OFFSET을 지원하지 않으므로 전체 데이터를 가져온 후 애플리케이션에서 슬라이스
		const orderDirection = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
		
		// 페이징을 위해 필요한 전체 데이터만 조회 (page * size 만큼)
		const maxLimit = page * size;
		
		const query = `
			SELECT
				createdAt,
				vwap_buy,
				vwap_sell,
				index_mid AS fkbrti_1s,
				avg(index_mid) OVER (
					ORDER BY createdAt
					ROWS BETWEEN 4 PRECEDING AND CURRENT ROW
				) AS fkbrti_5s,
				avg(index_mid) OVER (
					ORDER BY createdAt
					ROWS BETWEEN 9 PRECEDING AND CURRENT ROW
				) AS fkbrti_10s,
				expected_exchanges,
				sources,
				expected_status,
				provisional,
				no_publish
			FROM tb_fkbrti_1sec
			${whereClause}
			ORDER BY createdAt ${orderDirection}
			LIMIT ${maxLimit}
		`;

		const results = await this.sequelize.query(query, {
			replacements,
			type: Sequelize.QueryTypes.SELECT,
			raw: true
		});

		// 애플리케이션 레벨에서 페이징 처리
		const startIndex = (page - 1) * size;
		const endIndex = startIndex + size;
		const pagedResults = results.slice(startIndex, endIndex);

		// JSON 필드 파싱
		const datalist = pagedResults.map(item => ({
			...item,
			expected_exchanges: this.parseJSON(item.expected_exchanges),
			sources: this.parseJSON(item.sources),
			expected_status: this.parseJSON(item.expected_status)
		}));

		return {
			pagination: {
				page,
				size,
				totalCount,
				totalPages,
				hasNext: page < totalPages,
				hasPrev: page > 1
			},
			datalist
		};
	}

	/**
	 * FKBRTI 지수 히스토리 조회 (이동평균 없이 기본 데이터만)
	 * @param {Object} options - 쿼리 옵션
	 * @param {string} options.fromDate - 시작 날짜 (ISO 문자열)
	 * @param {string} options.toDate - 종료 날짜 (ISO 문자열)
	 * @param {number} options.page - 페이지 번호 (기본값: 1)
	 * @param {number} options.size - 페이지 크기 (기본값: 100)
	 * @param {string} options.order - 정렬 순서 (asc/desc, 기본값: desc)
	 * @returns {Promise<Object>} 지수 히스토리 데이터 및 페이징 정보
	 */
	static async getIndexHistory(options = {}) {
		const { 
			fromDate, 
			toDate, 
			page = 1, 
			size = 100,
			order = 'desc'
		} = options;
		
		const whereClause = {};
		
		if (fromDate && toDate) {
			whereClause.createdAt = {
				[this.sequelize.Sequelize.Op.gte]: fromDate,
				[this.sequelize.Sequelize.Op.lt]: toDate
			};
		}

		// 전체 개수 조회
		const totalCount = await this.count({
			where: whereClause,
			logging: process.env.QDB_LOG === "true"
		});

		const totalPages = Math.ceil(totalCount / size);
		
		// 페이징을 위해 필요한 데이터만 조회 (page * size 만큼)
		const maxLimit = page * size;
		const orderDirection = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

		const results = await this.findAll({
			attributes: { 
				exclude: ['id', 'updatedAt'] 
			},
			where: whereClause,
			limit: maxLimit,
			order: [['createdAt', orderDirection]],
			raw: true,
			logging: process.env.QDB_LOG === "true"
		});

		// 애플리케이션 레벨에서 페이징 처리
		const startIndex = (page - 1) * size;
		const endIndex = startIndex + size;
		const pagedResults = results.slice(startIndex, endIndex);

		// JSON 필드 파싱
		const datalist = pagedResults.map(item => ({
			...item,
			expected_exchanges: this.parseJSON(item.expected_exchanges),
			sources: this.parseJSON(item.sources),
			expected_status: this.parseJSON(item.expected_status)
		}));

		return {
			pagination: {
				page,
				size,
				totalCount,
				totalPages,
				hasNext: page < totalPages,
				hasPrev: page > 1
			},
			datalist
		};
	}

	/**
	 * JSON 문자열 파싱 헬퍼 메서드
	 * @param {string} value - JSON 문자열
	 * @returns {Object|null} 파싱된 객체 또는 null
	 */
	static parseJSON(value) {
		if (!value || typeof value !== 'string') {
			return value;
		}
		try {
			return JSON.parse(value);
		} catch (e) {
			return null;
		}
	}
};
