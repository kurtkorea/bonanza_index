"use strict";

const { Router } = require("express");
const router = Router();

const { verifyToken, verifyTokenRole } = require("../middleware/token");
const { respMsgStr, respData, respMsg } = require("../utils/common");
const { verifyData, verifyTypes } = require("../middleware/verify");
const { prePaging } = require("../middleware/paging");
const common= require("../utils/common");
const { db, Op } = require("../db/quest_db");
const { once } = require('events');
const { processDailyFKBRTIBackup } = require("../cron/daily_fkbrti");
const { processDailyOrderbookBackup } = require("../cron/daily_orderbook");

router.use("/*", (req, resp, next) => {
	//#swagger.tags = ["Index History"]
	//#swagger.responses[440] = { description: '각종 오류 - 상세 내용은 message 참조' }
	next();
});

router.get("/", async (req, resp, next) => {
	// #swagger.description = 'FKBRTI 지수 히스토리 파일 다운로드'
	// #swagger.parameters['from_date'] = {in:"query",type:"string", description:"검색시작시간 (예: 2025-09-01)"}
	// #swagger.parameters['to_date'] = {in:"query",type:"string", description:"검색마지막시간 (예: 2025-09-30)"}
	try {
		const { from_date, to_date } = req.query;

		console.log('[file_download] request received', { from_date, to_date });

		// 날짜 파라미터를 QuestDB용 ISO 8601 문자열로 변환
		let fromDate = null;
		let toDate = null;
		
		// 날짜 문자열을 QuestDB용 ISO 8601 문자열로 변환하는 함수
		const parseDateToISO = (dateStr) => {
			if (!dateStr) return null;
			// YYYY-MM-DD 형식인지 확인
			const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
			const match = dateStr.match(datePattern);
			if (match) {
				const year = parseInt(match[1], 10);
				const month = parseInt(match[2], 10);
				const day = parseInt(match[3], 10);
				
				// 유효성 검사
				if (month < 1 || month > 12 || day < 1 || day > 31) {
					throw new Error(`Invalid date: ${dateStr}`);
				}
				
				// Date 객체 생성하여 유효성 검사 (잘못된 날짜인지 확인, 예: 2025-02-30)
				const date = new Date(year, month - 1, day);
				if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
					throw new Error(`Invalid date: ${dateStr}`);
				}
				
				// QuestDB용 ISO 8601 형식으로 변환 (UTC 시간)
				// YYYY-MM-DD 형식을 YYYY-MM-DDTHH:mm:ss.sssZ 형식으로 변환
				const isoString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`;
				
				return isoString;
			}
			// 형식이 맞지 않으면 일반 Date 생성자 사용하여 ISO 문자열로 변환
			const date = new Date(dateStr);
			if (isNaN(date.getTime())) {
				throw new Error(`Invalid date format: ${dateStr}`);
			}
			return date.toISOString();
		};
		
		try {
			if (from_date) {
				fromDate = parseDateToISO(from_date);
				if (!fromDate) {
					return resp.status(400).json({ 
						result: false, 
						message: `Invalid from_date format: ${from_date}. Expected format: YYYY-MM-DD` 
					});
				}
			}
			if (to_date) {
				// to_date의 다음 날 00:00:00으로 설정 (해당 날짜의 23:59:59까지 포함)
				const toDateISO = parseDateToISO(to_date);
				if (!toDateISO) {
					return resp.status(400).json({ 
						result: false, 
						message: `Invalid to_date format: ${to_date}. Expected format: YYYY-MM-DD` 
					});
				}
				// 다음 날의 ISO 문자열 생성
				const toDateObj = new Date(toDateISO);
				toDateObj.setUTCDate(toDateObj.getUTCDate() + 1);
				toDate = toDateObj.toISOString();
			}
		} catch (dateError) {
			console.error('[file_download] date parse error', dateError);
			return resp.status(400).json({ 
				result: false, 
				message: dateError.message || `Invalid date format` 
			});
		}

		console.log('[file_download] parsed dates', { fromDate, toDate });

		const headers = [
			'시간',
			'fkbrti_1s',
			'fkbrti_5s',
			'fkbrti_10s',
			'UPBIT',
			'BITTHUMB',
			'COINONE',
			'KORBIT',
			'ACTUAL_AVG',
			'DIFF_1',
			'DIFF_2',
			'DIFF_3',
			'RATIO_1',
			'RATIO_2',
			'RATIO_3',
		];

		const escapeCsvValue = (value) => {
			if (value === null || value === undefined || Number.isNaN(value)) return '';
			const str = String(value);
			if (/[",\n\r]/.test(str)) {
				return '"' + str.replace(/"/g, '""') + '"';
			}
			return str;
		};

		const writeRow = async (values) => {
			const line = values.map(escapeCsvValue).join(',') + '\n';
			if (!resp.write(line, 'utf8')) {
				await once(resp, 'drain');
			}
		};

		const fileName = `fkbrti_export_${from_date || 'all'}_${to_date || 'all'}.csv`;
		resp.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
		resp.setHeader('Content-Type', 'text/csv; charset=utf-8');
		resp.setHeader('Transfer-Encoding', 'chunked');

		if (!resp.write('\uFEFF', 'utf8')) {
			await once(resp, 'drain');
		}
		await writeRow(headers);

		const batchSize = 10000; // 메모리 문제 방지를 위해 배치 크기 축소
		let processedCount = 0;
		let lastCreatedAt = null;
		let maxIterations = 10000; // 무한 루프 방지
		let iterationCount = 0;

		const window5 = [];
		let sum5 = 0;
		const window10 = [];
		let sum10 = 0;

		console.log('[file_download] streaming CSV started !!!!!!!', { batchSize });

		// 클라이언트 연결 끊김 감지
		let isClientConnected = true;
		resp.on('close', () => {
			isClientConnected = false;
			console.log('[file_download] client disconnected');
		});

		while (isClientConnected && iterationCount < maxIterations) {
			iterationCount++;
			
			try {
				const chunkQuery = `
					SELECT
						createdAt AS "createdAt",
						index_mid AS "indexMid",
						expected_status AS "expectedStatus"
					FROM tb_fkbrti_1sec
					WHERE createdAt >= cast(:fromDateUTC as timestamp)
						AND createdAt < cast(:toDateUTC as timestamp)
						${lastCreatedAt ? 'AND createdAt > cast(:lastCreatedAt as timestamp)' : ''}
					ORDER BY createdAt
					LIMIT :limit
				`;

				const replacements = {
					fromDateUTC: fromDate,
					toDateUTC: toDate,
					limit: batchSize,
				};
				if (lastCreatedAt) {
					replacements.lastCreatedAt = lastCreatedAt;
				}

				const chunk = await db.sequelize.query(chunkQuery, {
					replacements,
					type: db.Sequelize.QueryTypes.SELECT,
					raw: true,
				});

				if (!chunk || chunk.length === 0) {
					break;
				}

				for (const row of chunk) {
					if (!isClientConnected) {
						console.log('[file_download] client disconnected during processing');
						break;
					}

					lastCreatedAt = row.createdAt;

					const indexMid = Number(row.indexMid ?? 0) || 0;

					window5.push(indexMid);
					sum5 += indexMid;
					if (window5.length > 5) {
						sum5 -= window5.shift();
					}
					const fkbrti5 = window5.length ? sum5 / window5.length : indexMid;

					window10.push(indexMid);
					sum10 += indexMid;
					if (window10.length > 10) {
						sum10 -= window10.shift();
					}
					const fkbrti10 = window10.length ? sum10 / window10.length : indexMid;

					let expectedStatus;
					try {
						expectedStatus = row.expectedStatus ? JSON.parse(row.expectedStatus) : [];
					} catch (e) {
						expectedStatus = [];
					}

					const upbitEntry = expectedStatus.find(x => x.exchange == "E0010001");
					const bitthumbEntry = expectedStatus.find(x => x.exchange == "E0020001");
					const coinoneEntry = expectedStatus.find(x => x.exchange == "E0030001");
					const korbitEntry = expectedStatus.find(x => x.exchange == "E0050001");

					const upbitPrice = upbitEntry?.price ?? null;
					const bitthumbPrice = bitthumbEntry?.price ?? null;
					const coinonePrice = coinoneEntry?.price ?? null;
					const korbitPrice = korbitEntry?.price ?? null;

					let sum = 0;
					let count = 0;
					for (const expectedItem of expectedStatus) {
						if (expectedItem?.reason === 'ok' && Number.isFinite(expectedItem?.price)) {
							sum += expectedItem.price;
							count++;
						}
					}
					const actualAvg = count > 0 ? sum / count : 0;

					let basePrice = upbitPrice;
					if (basePrice === undefined || basePrice === null) {
						basePrice = bitthumbPrice;
					}

					const diff1 = basePrice !== undefined && basePrice !== null ? basePrice - indexMid : 0;
					const diff2 = basePrice !== undefined && basePrice !== null ? basePrice - fkbrti5 : 0;
					const diff3 = basePrice !== undefined && basePrice !== null ? basePrice - fkbrti10 : 0;

					let ratio1 = 0;
					let ratio2 = 0;
					let ratio3 = 0;
					if (basePrice && basePrice !== 0) {
						ratio1 = Math.abs(diff1 / basePrice) * 100;
						ratio2 = Math.abs(diff2 / basePrice) * 100;
						ratio3 = Math.abs(diff3 / basePrice) * 100;
					}

					const createdAtUtc = new Date(row.createdAt);
					const createdAtKST = new Date(createdAtUtc.getTime() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00');

					await writeRow([
						createdAtKST,
						indexMid,
						fkbrti5,
						fkbrti10,
						upbitPrice,
						bitthumbPrice,
						coinonePrice,
						korbitPrice,
						actualAvg,
						diff1,
						diff2,
						diff3,
						ratio1,
						ratio2,
						ratio3,
					]);
					processedCount += 1;
				}

				console.log('[file_download] chunk processed', { processedCount, lastCreatedAt, iterationCount });

				if (chunk.length < batchSize) {
					break;
				}
			} catch (chunkError) {
				console.error('[file_download] chunk processing error', chunkError);
				// 에러 발생 시에도 응답을 정상적으로 종료
				if (isClientConnected) {
					resp.status(500).json({
						result: false,
						message: `데이터 처리 중 오류가 발생했습니다: ${chunkError.message}`
					});
				}
				return;
			}
		}

		if (iterationCount >= maxIterations) {
			console.error('[file_download] max iterations reached', { iterationCount, processedCount });
			if (isClientConnected) {
				resp.status(500).json({
					result: false,
					message: '처리 시간이 초과되었습니다. 날짜 범위를 줄여주세요.'
				});
			}
			return;
		}

		console.log('[file_download] processed data count', processedCount);

		if (processedCount === 0) {
			console.warn('[file_download] no data to export', { fromDate, toDate });
			if (isClientConnected) {
				resp.status(404).json({
					result: false,
					message: '다운로드할 데이터가 없습니다.'
				});
			}
			return;
		}

		if (isClientConnected) {
			resp.end();
			console.log('[file_download] completed successfully', { fileName, processedCount });
		} else {
			console.log('[file_download] client disconnected before completion');
		}

  	} catch (error) {
		console.error('파일 다운로드 처리 중 에러 발생:', error);
  		next(error);
  	}
});


router.get("/test_fkbrti_download", async (req, resp, next) => {
	try {
		const { from_date, to_date } = req.query;

		await processDailyFKBRTIBackup();

		resp.json({
			result: true,
			message: '파일 다운로드 완료',
		});

	} catch (error) {
		console.error('파일 다운로드 처리 중 에러 발생:', error);
		next(error);
	}
});

router.get("/test_orderbook_download", async (req, resp, next) => {
	try {
		const { from_date, to_date } = req.query;

		await processDailyOrderbookBackup();

		resp.json({
			result: true,
			message: '파일 다운로드 완료',
		});

	} catch (error) {
		console.error('파일 다운로드 처리 중 에러 발생:', error);
		next(error);
	}
});


module.exports = router;
