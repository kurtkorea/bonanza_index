"use strict";

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { createGzip } = require('zlib');
const { pipeline } = require('stream/promises');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { db } = require('../db/quest_db');
const logger = require('../utils/logger');

// MinIO 설정 함수 (환경 변수가 로드된 후 호출)
function getS3Client() {
	const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'http://minio-service.bonanza-index.svc.cluster.local:9000';
	const MINIO_ACCESS_KEY = process.env.MINIO_ROOT_USER || 'bonanza';
	const MINIO_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD || '56tyghbn';
	const MINIO_REGION = process.env.MINIO_REGION || 'us-east-1';
	
	logger.info({ 
		endpoint: MINIO_ENDPOINT,
		bucket: process.env.MINIO_BUCKET || 'bonanza-index'
	}, '[daily-backup] MinIO configuration');
	
	return new S3Client({
		endpoint: MINIO_ENDPOINT,
		region: MINIO_REGION,
		credentials: {
			accessKeyId: MINIO_ACCESS_KEY,
			secretAccessKey: MINIO_SECRET_KEY,
		},
		forcePathStyle: true, // MinIO는 path-style URL 사용
	});
}

// CSV 값 이스케이프 함수
const escapeCsvValue = (value) => {
	if (value === null || value === undefined || Number.isNaN(value)) return '';
	const str = String(value);
	if (/[",\n\r]/.test(str)) {
		return '"' + str.replace(/"/g, '""') + '"';
	}
	return str;
};

// 전날 데이터를 파일로 생성하고 MinIO에 업로드하는 함수
async function processDailyFKBRTIBackup() {
	const tempDir = path.join(__dirname, '../../temp');
	
	// temp 디렉토리가 없으면 생성
	if (!fs.existsSync(tempDir)) {
		fs.mkdirSync(tempDir, { recursive: true });
	}

	logger.info({ 
		tempDir,
		minioEndpoint: process.env.MINIO_ENDPOINT || 'not set',
		minioBucket: process.env.MINIO_BUCKET || 'not set'
	}, '[daily-fkbrti] Starting processDailyFKBRTIBackup');

	// 전날 날짜 계산 (KST 기준)
	// UTC 15:00:00에 실행되면 KST는 다음날 00:00:00이므로,
	// 실행 시점의 전날(어제) 00:00:00 ~ 23:59:59 데이터를 처리
	const now = new Date();
	const kstOffset = 9 * 60 * 60 * 1000; // KST는 UTC+9
	const nowKST = new Date(now.getTime() + kstOffset);
	
	// 전날(어제) 00:00:00 ~ 23:59:59
	const yesterday = new Date(nowKST);
	yesterday.setDate(yesterday.getDate() - 1);
	yesterday.setHours(0, 0, 0, 0);
	
	const fromDate = new Date(yesterday.getTime() - kstOffset); // UTC로 변환 (전날 00:00:00)
	const toDate = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000); // 다음날 00:00:00 (전날 23:59:59까지 포함)
	
	const dateStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
	const fileName = `fkbrti_${dateStr}.csv`;
	const filePath = path.join(tempDir, fileName);
	const gzipFileName = `${fileName}.gz`;
	const gzipFilePath = path.join(tempDir, gzipFileName);
	
	logger.info({ dateStr, fromDate: fromDate.toISOString(), toDate: toDate.toISOString() }, '[daily-fkbrti] Starting daily backup');

	try {
		const startTime = Date.now();
		
		// CSV 파일 생성 (버퍼링 최적화)
		const writeStream = fs.createWriteStream(filePath, { 
			encoding: 'utf8',
			highWaterMark: 64 * 1024 // 64KB 버퍼 크기
		});
		
		// 스트림 버퍼링을 위한 Promise
		const writeToStream = (data) => {
			return new Promise((resolve, reject) => {
				if (!writeStream.write(data)) {
					writeStream.once('drain', resolve);
				} else {
					resolve();
				}
			});
		};
		
		// BOM 추가 (Excel 호환성)
		await writeToStream('\uFEFF');
		
		// 헤더 작성
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
		await writeToStream(headers.map(escapeCsvValue).join(',') + '\n');
		
		// 배치 크기 증가 (성능 향상)
		const batchSize = 99999999;
		let processedCount = 0;
		let lastCreatedAt = null;
		let iterationCount = 0;
		const maxIterations = 10000;
		
		const window5 = [];
		let sum5 = 0;
		const window10 = [];
		let sum10 = 0;
		
		// CSV 행 버퍼 (배치 쓰기)
		const csvBuffer = [];
		const bufferSize = 1000; // 1000행마다 한 번에 쓰기
		
		// 데이터 조회 및 CSV 작성
		while (iterationCount < maxIterations) {
			iterationCount++;
			
			// WHERE 절 복원 및 최적화 (성능 향상을 위해 필수)
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
				fromDateUTC: fromDate.toISOString(),
				toDateUTC: toDate.toISOString(),
				limit: batchSize,
			};
			if (lastCreatedAt) {
				replacements.lastCreatedAt = lastCreatedAt;
			}
			
			const queryStartTime = Date.now();
			const chunk = await db.sequelize.query(chunkQuery, {
				replacements,
				type: db.Sequelize.QueryTypes.SELECT,
				raw: true,
			});
			const queryTime = Date.now() - queryStartTime;
			
			if (!chunk || chunk.length === 0) {
				break;
			}
			
			// 배치 처리로 성능 향상
			for (const row of chunk) {
				lastCreatedAt = row.createdAt;
				
				const indexMid = Number(row.indexMid ?? 0) || 0;
				
				// 5초 이동평균 계산
				window5.push(indexMid);
				sum5 += indexMid;
				if (window5.length > 5) {
					sum5 -= window5.shift();
				}
				const fkbrti5 = window5.length ? sum5 / window5.length : indexMid;
				
				// 10초 이동평균 계산
				window10.push(indexMid);
				sum10 += indexMid;
				if (window10.length > 10) {
					sum10 -= window10.shift();
				}
				const fkbrti10 = window10.length ? sum10 / window10.length : indexMid;
				
				// expected_status 파싱 (캐싱 최적화)
				let expectedStatus;
				if (row.expectedStatus) {
					try {
						expectedStatus = JSON.parse(row.expectedStatus);
					} catch (e) {
						expectedStatus = [];
					}
				} else {
					expectedStatus = [];
				}
				
				// Exchange 매핑 최적화 (한 번만 순회)
				let upbitPrice = null;
				let bitthumbPrice = null;
				let coinonePrice = null;
				let korbitPrice = null;
				let sum = 0;
				let count = 0;
				
				for (const item of expectedStatus) {
					if (item?.reason === 'ok' && Number.isFinite(item?.price)) {
						sum += item.price;
						count++;
					}
					
					// Exchange 코드별 가격 추출
					switch (item?.exchange) {
						case "E0010001":
							upbitPrice = item.price ?? null;
							break;
						case "E0020001":
							bitthumbPrice = item.price ?? null;
							break;
						case "E0030001":
							coinonePrice = item.price ?? null;
							break;
						case "E0050001":
							korbitPrice = item.price ?? null;
							break;
					}
				}
				
				const actualAvg = count > 0 ? sum / count : 0;
				
				// 기준 가격 (UPBIT 우선, 없으면 BITTHUMB)
				const basePrice = upbitPrice ?? bitthumbPrice ?? null;
				
				const diff1 = basePrice !== null ? basePrice - indexMid : 0;
				const diff2 = basePrice !== null ? basePrice - fkbrti5 : 0;
				const diff3 = basePrice !== null ? basePrice - fkbrti10 : 0;
				
				let ratio1 = 0;
				let ratio2 = 0;
				let ratio3 = 0;
				if (basePrice && basePrice !== 0) {
					const basePriceInv = 100 / basePrice;
					ratio1 = Math.abs(diff1 * basePriceInv);
					ratio2 = Math.abs(diff2 * basePriceInv);
					ratio3 = Math.abs(diff3 * basePriceInv);
				}
				
				// KST 시간 변환 (최적화)
				const createdAtUtc = new Date(row.createdAt);
				const createdAtKST = new Date(createdAtUtc.getTime() + kstOffset).toISOString().replace('Z', '+09:00');
				
				// CSV 행 버퍼에 추가
				const rowData = [
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
				];
				csvBuffer.push(rowData.map(escapeCsvValue).join(','));
				processedCount += 1;
				
				// 버퍼가 가득 차면 한 번에 쓰기
				if (csvBuffer.length >= bufferSize) {
					await writeToStream(csvBuffer.join('\n') + '\n');
					csvBuffer.length = 0; // 배열 초기화
				}
			}
			
			logger.info({ 
				processedCount, 
				lastCreatedAt, 
				iterationCount,
				chunkSize: chunk.length,
				queryTime: `${queryTime}ms`
			}, '[daily-fkbrti] chunk processed');
			
			if (chunk.length < batchSize) {
				break;
			}
		}
		
		// 남은 버퍼 쓰기
		if (csvBuffer.length > 0) {
			await writeToStream(csvBuffer.join('\n') + '\n');
		}
		
		// 파일 스트림 종료
		await new Promise((resolve, reject) => {
			writeStream.end((err) => {
				if (err) reject(err);
				else resolve();
			});
		});
		
		const csvTime = Date.now() - startTime;
		logger.info({ csvTime: `${csvTime}ms`, processedCount }, '[daily-fkbrti] CSV generation completed');
		
		if (processedCount === 0) {
			logger.warn({ dateStr }, '[daily-fkbrti] No data to export');
			// 빈 파일 삭제
			if (fs.existsSync(filePath)) {
				fs.unlinkSync(filePath);
			}
			return;
		}
		
		logger.info({ fileName, processedCount }, '[daily-fkbrti] CSV file created');
		
		// Gzip 압축 (스트림으로 처리하여 메모리 효율성 향상)
		const compressStartTime = Date.now();
		const readStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
		const writeGzipStream = fs.createWriteStream(gzipFilePath, { highWaterMark: 64 * 1024 });
		const gzipStream = createGzip({ level: 6 }); // 압축 레벨 6 (속도와 압축률 균형)
		
		await pipeline(readStream, gzipStream, writeGzipStream);
		const compressTime = Date.now() - compressStartTime;
		logger.info({ gzipFileName, compressTime: `${compressTime}ms` }, '[daily-fkbrti] File compressed');
		
		// 원본 CSV 파일 삭제
		fs.unlinkSync(filePath);
		
		// MinIO에 업로드 (스트림으로 처리하여 메모리 효율성 향상)
		const uploadStartTime = Date.now();
		const MINIO_BUCKET = process.env.MINIO_BUCKET || 'bonanza-index';
		const s3Key = `fkbrti-daily/${dateStr}/${gzipFileName}`;
		const fileStream = fs.createReadStream(gzipFilePath, { highWaterMark: 64 * 1024 });
		
		// S3 클라이언트 생성 (환경 변수 로드 후)
		try {
			const s3Client = getS3Client();
			
			const uploadCommand = new PutObjectCommand({
				Bucket: MINIO_BUCKET,
				Key: s3Key,
				Body: fileStream,
				ContentType: 'application/gzip',
				ContentEncoding: 'gzip',
			});
			
			await s3Client.send(uploadCommand);
			const uploadTime = Date.now() - uploadStartTime;
			logger.info({ s3Key, bucket: MINIO_BUCKET, uploadTime: `${uploadTime}ms` }, '[daily-fkbrti] File uploaded to MinIO');
		} catch (uploadError) {
			const uploadTime = Date.now() - uploadStartTime;
			logger.error({ 
				err: uploadError.message, 
				code: uploadError.code,
				endpoint: process.env.MINIO_ENDPOINT,
				bucket: MINIO_BUCKET,
				uploadTime: `${uploadTime}ms`
			}, '[daily-fkbrti] MinIO upload failed');
			throw uploadError;
		}
		
		// 압축 파일 삭제
		fs.unlinkSync(gzipFilePath);
		
		const totalTime = Date.now() - startTime;
		logger.info({ 
			dateStr, 
			processedCount, 
			s3Key,
			totalTime: `${totalTime}ms`,
			avgTimePerRecord: `${(totalTime / processedCount).toFixed(2)}ms`
		}, '[daily-fkbrti] Daily backup completed successfully');
		
	} catch (error) {
		logger.error({ err: error.message, stack: error.stack, dateStr }, '[daily-backup] Daily backup failed');
		
		// 임시 파일 정리
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
		if (fs.existsSync(gzipFilePath)) {
			fs.unlinkSync(gzipFilePath);
		}
		
		throw error;
	}
}

// 매일 00:00:00 (KST)에 실행하여 전날 데이터 처리
// KST 00:00:00 = UTC 15:00:00 (전날)
// 따라서 UTC 15:00:00에 실행하면 KST 다음날 00:00:00에 실행되어
// 전날(어제) 00:00:00 ~ 23:59:59 데이터를 처리할 수 있음
const cronSchedule = '0 15 * * *'; // UTC 15:00:00 (KST 다음날 00:00:00)

let cronJob = null;

function startDailyFKBRTICron() {
	if (cronJob) {
		logger.warn('[daily-backup] Cron job already started');
		return;
	}
	
	logger.info({ schedule: cronSchedule }, '[daily-backup] Starting daily backup cron job');
	
	cronJob = cron.schedule(cronSchedule, async () => {
		logger.info('[daily-backup] Cron job triggered');
		try {
			await processDailyBackup();
		} catch (error) {
			logger.error({ err: error.message, stack: error.stack }, '[daily-backup] Cron job execution failed');
		}
	}, {
		scheduled: true,
		timezone: 'UTC', // UTC 기준으로 실행
	});
	
	logger.info('[daily-fkbrti] Daily backup cron job started');
}

function stopDailyFKBRTICron() {
	if (cronJob) {
		cronJob.stop();
		cronJob = null;
		logger.info('[daily-backup] Daily backup cron job stopped');
	}
}

// 모듈 내보내기
module.exports = {
	startDailyFKBRTICron,
	stopDailyFKBRTICron,
	processDailyFKBRTIBackup, // 테스트용으로 직접 호출 가능
};
