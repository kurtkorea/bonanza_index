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
			whereClause = `WHERE to_timezone(createdAt, 'Asia/Seoul') >= to_timezone(:fromDate, 'Asia/Seoul')
							AND to_timezone(createdAt, 'Asia/Seoul') < to_timezone(:toDate, 'Asia/Seoul')
							AND index_mid IS NOT NULL`;
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

		let query = `
			SELECT
				createdAt,
				to_timezone(createdAt, 'Asia/Seoul') AS createdAt_KOR,
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
				actual_avg,
				diff,
				ratio,
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
			raw: true,
		});

		// console.log("results", results);

		// 애플리케이션 레벨에서 페이징 처리
		const startIndex = (page - 1) * size;
		const endIndex = startIndex + size;
		const pagedResults = results.slice(startIndex, endIndex);

		// JSON 필드 파싱
		const datalist = pagedResults.map(item => ({
			...item,
			createdAt: new Date(item.createdAt.getTime() + 18 * 60 * 60 * 1000).toISOString(),
			expected_exchanges: this.parseJSON(item.expected_exchanges),
			sources: this.parseJSON(item.sources),
			expected_status: this.parseJSON(item.expected_status)
		}));

		// console.log("datalist", datalist);
		
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
	 * @param {string} options.fromDate - 시작 날짜 (ISO 8601 문자열, 예: "2025-01-01T00:00:00.000Z")
	 * @param {string} options.toDate - 종료 날짜 (ISO 8601 문자열, 예: "2025-01-02T00:00:00.000Z")
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
		
		let whereClause = '';
		const replacements = {};

		if (fromDate && toDate) {
			// QuestDB의 to_timezone 함수는 ISO 8601 문자열 형식을 요구합니다
			whereClause = `WHERE to_timezone(createdAt, 'Asia/Seoul') >= to_timezone(:fromDate, 'Asia/Seoul')
							AND to_timezone(createdAt, 'Asia/Seoul') < to_timezone(:toDate, 'Asia/Seoul')`;
			// ISO 문자열을 그대로 전달 (QuestDB가 인식할 수 있는 형식)
			replacements.fromDate = fromDate;
			replacements.toDate = toDate;
		}

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

		// 전체 개수 조회
		const totalCount = parseInt(countResult[0].total);
		const totalPages = Math.ceil(totalCount / size);
		
		// 페이징을 위해 필요한 데이터만 조회 (page * size 만큼)
		const maxLimit = page * size;
		const orderDirection = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

		let query = `
			SELECT
				createdAt,
				to_timezone(createdAt, 'Asia/Seoul') AS createdAt_KOR,
				vwap_buy,
				vwap_sell,
				index_mid AS fkbrti_1s,
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
			raw: true,
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
	 * FKBRTI 통계 조회 (SQL 쿼리 버전 - QuestDB JSON 함수 지원 시 사용)
	 * @returns {Promise<Array>} 기간별 통계 데이터 (1D, 1W, 1M, 1Y)
	 * @description QuestDB가 PostgreSQL JSON 함수를 지원하는 경우 사용 가능
	 */
	static async getStatsSQL() {
		try {
			const query = `
							-- 1초 단위 요약
							SELECT
								'1d' as interval,
								'1s' AS second,
								round(min(diff),  4) AS diff_min,
								round(max(diff),  4) AS diff_max,
								round(avg(diff),  4) AS diff_avg,
								round(min(ratio), 4) AS ratio_min,
								round(max(ratio), 4) AS ratio_max,
								round(avg(ratio), 4) AS ratio_avg
							FROM tb_fkbrti_1sec
							WHERE createdAt > dateadd('d', -1, now())

							UNION ALL

							-- 5초 단위 리샘플 요약
							SELECT
								'1d' as interval,
								'5s' AS second,
								round(min(diff_avg),  4) AS diff_min,
								round(max(diff_avg),  4) AS diff_max,
								round(avg(diff_avg),  4) AS diff_avg,
								round(min(ratio_avg), 4) AS ratio_min,
								round(max(ratio_avg), 4) AS ratio_max,
								round(avg(ratio_avg), 4) AS ratio_avg
							FROM (
								SELECT
									avg(diff)  AS diff_avg,
									avg(ratio) AS ratio_avg
								FROM tb_fkbrti_1sec
								WHERE createdAt > dateadd('d', -1, now())
								SAMPLE BY 5s ALIGN TO CALENDAR
							)

							UNION ALL 

							SELECT
								'1d' as interval,
								'10s' AS second,
								round(min(diff_avg),  4) AS diff_min,
								round(max(diff_avg),  4) AS diff_max,
								round(avg(diff_avg),  4) AS diff_avg,
								round(min(ratio_avg), 4) AS ratio_min,
								round(max(ratio_avg), 4) AS ratio_max,
								round(avg(ratio_avg), 4) AS ratio_avg
							FROM (
								SELECT
									avg(diff)  AS diff_avg,
									avg(ratio) AS ratio_avg
								FROM tb_fkbrti_1sec
								WHERE createdAt > dateadd('d', -1, now())
								SAMPLE BY 10s ALIGN TO CALENDAR
							)

							UNION ALL

							SELECT
								'1w' as interval,
								'1s' AS second,
								round(min(diff),  4) AS diff_min,
								round(max(diff),  4) AS diff_max,
								round(avg(diff),  4) AS diff_avg,
								round(min(ratio), 4) AS ratio_min,
								round(max(ratio), 4) AS ratio_max,
								round(avg(ratio), 4) AS ratio_avg
							FROM tb_fkbrti_1sec
							WHERE createdAt > dateadd('d', -7, now())

							UNION ALL

							-- 5초 단위 리샘플 요약
							SELECT
								'1w' as interval,
								'5s' AS second,
								round(min(diff_avg),  4) AS diff_min,
								round(max(diff_avg),  4) AS diff_max,
								round(avg(diff_avg),  4) AS diff_avg,
								round(min(ratio_avg), 4) AS ratio_min,
								round(max(ratio_avg), 4) AS ratio_max,
								round(avg(ratio_avg), 4) AS ratio_avg
							FROM (
								SELECT
									avg(diff)  AS diff_avg,
									avg(ratio) AS ratio_avg
								FROM tb_fkbrti_1sec
								WHERE createdAt > dateadd('d', -7, now())
								SAMPLE BY 5s ALIGN TO CALENDAR
							)

							UNION ALL 

							SELECT
								'1w' as interval,
								'10s' AS second,
								round(min(diff_avg),  4) AS diff_min,
								round(max(diff_avg),  4) AS diff_max,
								round(avg(diff_avg),  4) AS diff_avg,
								round(min(ratio_avg), 4) AS ratio_min,
								round(max(ratio_avg), 4) AS ratio_max,
								round(avg(ratio_avg), 4) AS ratio_avg
							FROM (
								SELECT
									avg(diff)  AS diff_avg,
									avg(ratio) AS ratio_avg
								FROM tb_fkbrti_1sec
								WHERE createdAt > dateadd('d', -7, now())
								SAMPLE BY 10s ALIGN TO CALENDAR
							)

							UNION ALL 

							SELECT
								'1m' as interval,
								'1s' AS second,
								round(min(diff_avg),  4) AS diff_min,
								round(max(diff_avg),  4) AS diff_max,
								round(avg(diff_avg),  4) AS diff_avg,
								round(min(ratio_avg), 4) AS ratio_min,
								round(max(ratio_avg), 4) AS ratio_max,
								round(avg(ratio_avg), 4) AS ratio_avg
							FROM (
								SELECT
									avg(diff)  AS diff_avg,
									avg(ratio) AS ratio_avg
								FROM tb_fkbrti_1sec
								WHERE createdAt > dateadd('M', -1, now())
								SAMPLE BY 1s ALIGN TO CALENDAR
							)

							UNION ALL 

							SELECT
								'1m' as interval,
								'5s' AS second,
								round(min(diff_avg),  4) AS diff_min,
								round(max(diff_avg),  4) AS diff_max,
								round(avg(diff_avg),  4) AS diff_avg,
								round(min(ratio_avg), 4) AS ratio_min,
								round(max(ratio_avg), 4) AS ratio_max,
								round(avg(ratio_avg), 4) AS ratio_avg
							FROM (
								SELECT
									avg(diff)  AS diff_avg,
									avg(ratio) AS ratio_avg
								FROM tb_fkbrti_1sec
								WHERE createdAt > dateadd('M', -1, now())
								SAMPLE BY 5s ALIGN TO CALENDAR
							)

							UNION ALL 

							SELECT
								'1m' as interval,
								'10s' AS second,
								round(min(diff_avg),  4) AS diff_min,
								round(max(diff_avg),  4) AS diff_max,
								round(avg(diff_avg),  4) AS diff_avg,
								round(min(ratio_avg), 4) AS ratio_min,
								round(max(ratio_avg), 4) AS ratio_max,
								round(avg(ratio_avg), 4) AS ratio_avg
							FROM (
								SELECT
									avg(diff)  AS diff_avg,
									avg(ratio) AS ratio_avg
								FROM tb_fkbrti_1sec
								WHERE createdAt > dateadd('M', -1, now())
								SAMPLE BY 10s ALIGN TO CALENDAR
							)

							UNION ALL 

							SELECT
								'1y' as interval,
								'1s' AS second,
								round(min(diff_avg),  4) AS diff_min,
								round(max(diff_avg),  4) AS diff_max,
								round(avg(diff_avg),  4) AS diff_avg,
								round(min(ratio_avg), 4) AS ratio_min,
								round(max(ratio_avg), 4) AS ratio_max,
								round(avg(ratio_avg), 4) AS ratio_avg
							FROM (
								SELECT
									avg(diff)  AS diff_avg,
									avg(ratio) AS ratio_avg
								FROM tb_fkbrti_1sec
								WHERE createdAt > dateadd('y', -1, now())
								SAMPLE BY 1s ALIGN TO CALENDAR
							)

							UNION ALL 

							SELECT
								'1y' as interval,
								'5s' AS second,
								round(min(diff_avg),  4) AS diff_min,
								round(max(diff_avg),  4) AS diff_max,
								round(avg(diff_avg),  4) AS diff_avg,
								round(min(ratio_avg), 4) AS ratio_min,
								round(max(ratio_avg), 4) AS ratio_max,
								round(avg(ratio_avg), 4) AS ratio_avg
							FROM (
								SELECT
									avg(diff)  AS diff_avg,
									avg(ratio) AS ratio_avg
								FROM tb_fkbrti_1sec
								WHERE createdAt > dateadd('y', -1, now())
								SAMPLE BY 5s ALIGN TO CALENDAR
							)

							UNION ALL 

							SELECT
								'1y' as interval,
								'10s' AS second,
								round(min(diff_avg),  4) AS diff_min,
								round(max(diff_avg),  4) AS diff_max,
								round(avg(diff_avg),  4) AS diff_avg,
								round(min(ratio_avg), 4) AS ratio_min,
								round(max(ratio_avg), 4) AS ratio_max,
								round(avg(ratio_avg), 4) AS ratio_avg
							FROM (
								SELECT
									avg(diff)  AS diff_avg,
									avg(ratio) AS ratio_avg
								FROM tb_fkbrti_1sec
								WHERE createdAt > dateadd('y', -1, now())
								SAMPLE BY 10s ALIGN TO CALENDAR
							)
							;

			`;

			const results = await this.sequelize.query(query, {
				type: Sequelize.QueryTypes.SELECT,
				raw: true,
			});

			return results;

			// return results.map(row => ({
			// 	period: row.period,
			// 	'DIFF-1s_MIN': row['DIFF-1s_MIN'],
			// 	'DIFF-1s_MAX': row['DIFF-1s_MAX'],
			// 	'DIFF-1s_AVG': row['DIFF-1s_AVG'],
			// 	'RATIO-1s_MIN': row['RATIO-1s_MIN'],
			// 	'RATIO-1s_MAX': row['RATIO-1s_MAX'],
			// 	'RATIO-1s_AVG': row['RATIO-1s_AVG'],
			// 	'DIFF-5s_MIN': row['DIFF-5s_MIN'],
			// 	'DIFF-5s_MAX': row['DIFF-5s_MAX'],
			// 	'DIFF-5s_AVG': row['DIFF-5s_AVG'],
			// 	'RATIO-5s_MIN': row['RATIO-5s_MIN'],
			// 	'RATIO-5s_MAX': row['RATIO-5s_MAX'],
			// 	'RATIO-5s_AVG': row['RATIO-5s_AVG'],
			// 	'DIFF-10s_MIN': row['DIFF-10s_MIN'],
			// 	'DIFF-10s_MAX': row['DIFF-10s_MAX'],
			// 	'DIFF-10s_AVG': row['DIFF-10s_AVG'],
			// 	'RATIO-10s_MIN': row['RATIO-10s_MIN'],
			// 	'RATIO-10s_MAX': row['RATIO-10s_MAX'],
			// 	'RATIO-10s_AVG': row['RATIO-10s_AVG'],
			// }));
		} catch (error) {
			console.error('SQL 쿼리 실행 실패 (QuestDB가 JSON 함수를 지원하지 않을 수 있습니다):', error.message);
			// SQL 쿼리가 실패하면 JavaScript 버전으로 폴백
			return await this.getStats();
		}
	}

	/**
	 * FKBRTI 통계 조회 (기간별 DIFF 및 RATIO 통계)
	 * @returns {Promise<Array>} 기간별 통계 데이터 (1D, 1W, 1M, 1Y)
	 */
	static async getStats() {
		const now = new Date();
		
		// 기간별 날짜 계산
		const periods = {
			'1D': new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
			'1W': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
			'1M': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
			'1Y': new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
		};

		// 누적기 헬퍼 함수
		const createAccumulator = () => ({
			count: 0,
			min: Number.POSITIVE_INFINITY,
			max: Number.NEGATIVE_INFINITY,
			sum: 0,
		});

		const updateAccumulator = (acc, value) => {
			if (!Number.isFinite(value)) {
				return;
			}
			if (value < acc.min) acc.min = value;
			if (value > acc.max) acc.max = value;
			acc.sum += value;
			acc.count += 1;
		};

		const finalizeAccumulator = (acc) => {
			if (!acc || acc.count === 0 || acc.min === Number.POSITIVE_INFINITY || acc.max === Number.NEGATIVE_INFINITY) {
				return { min: 0, max: 0, avg: 0 };
			}
			return {
				min: acc.min,
				max: acc.max,
				avg: acc.sum / acc.count,
			};
		};

		const stats = [];

		for (const [periodName, fromDate] of Object.entries(periods)) {
			const whereClause = `WHERE to_timezone(createdAt, 'Asia/Seoul') >= to_timezone(:fromDate, 'Asia/Seoul')`;
			
			const query = `
				SELECT
					createdAt,
					index_mid AS fkbrti_1s,
					avg(index_mid) OVER (
						ORDER BY createdAt
						ROWS BETWEEN 4 PRECEDING AND CURRENT ROW
					) AS fkbrti_5s,
					expected_status
				FROM tb_fkbrti_1sec
				${whereClause}
				ORDER BY createdAt DESC
			`;

			const results = await this.sequelize.query(query, {
				replacements: { fromDate: fromDate.toISOString() },
				type: Sequelize.QueryTypes.SELECT,
				raw: true,
			});

			// 누적기 초기화
			const diff1sAcc = createAccumulator();
			const diff5sAcc = createAccumulator();
			const ratio1sAcc = createAccumulator();
			const ratio5sAcc = createAccumulator();

			for (const item of results) {
				const expectedStatus = this.parseJSON(item.expected_status);
				if (!expectedStatus || !Array.isArray(expectedStatus)) continue;

				// UPBIT(101) 및 BITTHUMB(102) 가격 추출
				const upbit = expectedStatus.find(x => x.exchange === '101' || x.exchange === 101);
				const bitthumb = expectedStatus.find(x => x.exchange === '102' || x.exchange === 102);
				
				const basePrice = (upbit && upbit.price !== undefined && upbit.price !== null) 
					? upbit.price 
					: (bitthumb && bitthumb.price !== undefined && bitthumb.price !== null) 
						? bitthumb.price 
						: null;

				if (!basePrice || basePrice === 0) continue;

				const fkbrti1s = item.fkbrti_1s;
				const fkbrti5s = item.fkbrti_5s;

				if (fkbrti1s === null || fkbrti1s === undefined || 
					fkbrti5s === null || fkbrti5s === undefined) continue;

				// DIFF 계산
				const diff1s = basePrice - fkbrti1s;
				const diff5s = basePrice - fkbrti5s;

				// RATIO 계산 (절댓값 * 100)
				const ratio1s = Math.abs(diff1s / basePrice) * 100;
				const ratio5s = Math.abs(diff5s / basePrice) * 100;

				updateAccumulator(diff1sAcc, diff1s);
				updateAccumulator(diff5sAcc, diff5s);
				updateAccumulator(ratio1sAcc, ratio1s);
				updateAccumulator(ratio5sAcc, ratio5s);
			}

			const diff1sStats = finalizeAccumulator(diff1sAcc);
			const diff5sStats = finalizeAccumulator(diff5sAcc);
			const ratio1sStats = finalizeAccumulator(ratio1sAcc);
			const ratio5sStats = finalizeAccumulator(ratio5sAcc);

			stats.push({
				period: periodName,
				'DIFF-1s_MIN': Math.round(diff1sStats.min),
				'DIFF-1s_MAX': Math.round(diff1sStats.max),
				'DIFF-1s_AVG': Math.round(diff1sStats.avg),
				'RATIO-1s_MIN': Math.round(ratio1sStats.min * 100) / 100,
				'RATIO-1s_MAX': Math.round(ratio1sStats.max * 100) / 100,
				'RATIO-1s_AVG': Math.round(ratio1sStats.avg * 100) / 100,
				'DIFF-5s_MIN': Math.round(diff5sStats.min),
				'DIFF-5s_MAX': Math.round(diff5sStats.max),
				'DIFF-5s_AVG': Math.round(diff5sStats.avg),
				'RATIO-5s_MIN': Math.round(ratio5sStats.min * 100) / 100,
				'RATIO-5s_MAX': Math.round(ratio5sStats.max * 100) / 100,
				'RATIO-5s_AVG': Math.round(ratio5sStats.avg * 100) / 100,
			});
		}

		// 기간 순서대로 정렬
		const periodOrder = { '1D': 1, '1W': 2, '1M': 3, '1Y': 4 };
		stats.sort((a, b) => periodOrder[a.period] - periodOrder[b.period]);

		return stats;
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
