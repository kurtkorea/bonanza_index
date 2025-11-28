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
	}, '[daily-orderbook-backup] MinIO configuration');
	
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
async function processDailyOrderbookBackup() {
	const tempDir = path.join(__dirname, '../../temp');
	
	// temp 디렉토리가 없으면 생성
	if (!fs.existsSync(tempDir)) {
		fs.mkdirSync(tempDir, { recursive: true });
	}

	logger.info({ 
		tempDir,
		minioEndpoint: process.env.MINIO_ENDPOINT || 'not set',
		minioBucket: process.env.MINIO_BUCKET || 'not set'
	}, '[daily-orderbook-backup] Starting processDailyOrderbookBackup');

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
	const fileName = `orderbook_${dateStr}.csv`;
	const filePath = path.join(tempDir, fileName);
	const gzipFileName = `${fileName}.gz`;
	const gzipFilePath = path.join(tempDir, gzipFileName);
	
	logger.info({ dateStr, fromDate: fromDate.toISOString(), toDate: toDate.toISOString() }, '[daily-orderbook-backup] Starting daily backup');

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
			'tran_date',
			'tran_time',
			'exchange_cd',
			'price_id',
			'product_id',
			'order_tp',
			'price',
			'size',
			'marketAt',
			'collectorAt',
			'dbAt',
			'diff_ms',
			'diff_ms_db',
		];
		await writeToStream(headers.map(escapeCsvValue).join(',') + '\n');
		
		// 배치 크기 증가 (성능 향상)
		const batchSize = 50000000;
		let processedCount = 0;
		let lastMarketAt = null;
		let iterationCount = 0;
		const maxIterations = 10000;
		
		// CSV 행 버퍼 (배치 쓰기)
		const csvBuffer = [];
		const bufferSize = 1000; // 1000행마다 한 번에 쓰기
		
		// 데이터 조회 및 CSV 작성
		while (iterationCount < maxIterations) {
			iterationCount++;
			
			// WHERE 절 최적화 (성능 향상을 위해 필수)
			const chunkQuery = `
				SELECT
					tran_date,
					tran_time,
					exchange_cd,
					price_id,
					product_id,
					order_tp,
					price,
					size,
					marketAt,
					coollectorAt AS "collectorAt",
					dbAt,
					diff_ms,
					diff_ms_db
				FROM tb_order_book
				WHERE marketAt >= cast(:fromDateUTC as timestamp)
					AND marketAt < cast(:toDateUTC as timestamp)
					${lastMarketAt ? 'AND marketAt > cast(:lastMarketAt as timestamp)' : ''}
				ORDER BY marketAt, exchange_cd, price_id, order_tp
				LIMIT :limit
			`;
			
			const replacements = {
				fromDateUTC: fromDate.toISOString(),
				toDateUTC: toDate.toISOString(),
				limit: batchSize,
			};
			if (lastMarketAt) {
				replacements.lastMarketAt = lastMarketAt;
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
				lastMarketAt = row.marketAt;
				
				// KST 시간 변환 (최적화)
				const marketAtUtc = new Date(row.marketAt);
				const marketAtKST = new Date(marketAtUtc.getTime() + kstOffset).toISOString().replace('Z', '+09:00');
				
				const collectorAtUtc = row.collectorAt ? new Date(row.collectorAt) : null;
				const collectorAtKST = collectorAtUtc ? new Date(collectorAtUtc.getTime() + kstOffset).toISOString().replace('Z', '+09:00') : '';
				
				const dbAtUtc = row.dbAt ? new Date(row.dbAt) : null;
				const dbAtKST = dbAtUtc ? new Date(dbAtUtc.getTime() + kstOffset).toISOString().replace('Z', '+09:00') : '';
				
				// CSV 행 버퍼에 추가
				const rowData = [
					marketAtKST,
					row.tran_date || '',
					row.tran_time || '',
					row.exchange_cd || '',
					row.price_id ?? 0,
					row.product_id ?? 0,
					row.order_tp || '',
					row.price ?? '',
					row.size ?? '',
					marketAtKST,
					collectorAtKST,
					dbAtKST,
					row.diff_ms ?? '',
					row.diff_ms_db ?? '',
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
				lastMarketAt, 
				iterationCount,
				chunkSize: chunk.length,
				queryTime: `${queryTime}ms`
			}, '[daily-orderbook-backup] chunk processed');
			
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
		logger.info({ csvTime: `${csvTime}ms`, processedCount }, '[daily-orderbook-backup] CSV generation completed');
		
		if (processedCount === 0) {
			logger.warn({ dateStr }, '[daily-orderbook-backup] No data to export');
			// 빈 파일 삭제
			if (fs.existsSync(filePath)) {
				fs.unlinkSync(filePath);
			}
			return;
		}
		
		logger.info({ fileName, processedCount }, '[daily-orderbook-backup] CSV file created');
		
		// Gzip 압축 (스트림으로 처리하여 메모리 효율성 향상)
		const compressStartTime = Date.now();
		const readStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
		const writeGzipStream = fs.createWriteStream(gzipFilePath, { highWaterMark: 64 * 1024 });
		const gzipStream = createGzip({ level: 6 }); // 압축 레벨 6 (속도와 압축률 균형)
		
		await pipeline(readStream, gzipStream, writeGzipStream);
		const compressTime = Date.now() - compressStartTime;
		logger.info({ gzipFileName, compressTime: `${compressTime}ms` }, '[daily-orderbook-backup] File compressed');
		
		// 원본 CSV 파일 삭제
		fs.unlinkSync(filePath);
		
		// MinIO에 업로드 (스트림으로 처리하여 메모리 효율성 향상)
		const uploadStartTime = Date.now();
		const MINIO_BUCKET = process.env.MINIO_BUCKET || 'bonanza-index';
		const s3Key = `orderbook-daily/${dateStr}/${gzipFileName}`;
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
			logger.info({ s3Key, bucket: MINIO_BUCKET, uploadTime: `${uploadTime}ms` }, '[daily-orderbook-backup] File uploaded to MinIO');
		} catch (uploadError) {
			const uploadTime = Date.now() - uploadStartTime;
			logger.error({ 
				err: uploadError.message, 
				code: uploadError.code,
				endpoint: process.env.MINIO_ENDPOINT,
				bucket: MINIO_BUCKET,
				uploadTime: `${uploadTime}ms`
			}, '[daily-orderbook-backup] MinIO upload failed');
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
		}, '[daily-orderbook-backup] Daily backup completed successfully');
		
	} catch (error) {
		logger.error({ err: error.message, stack: error.stack, dateStr }, '[daily-orderbook-backup] Daily backup failed');
		
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

function startDailyOrderbookBackupCron() {
	if (cronJob) {
		logger.warn('[daily-orderbook-backup] Cron job already started');
		return;
	}
	
	logger.info({ schedule: cronSchedule }, '[daily-orderbook-backup] Starting daily backup cron job');
	
	cronJob = cron.schedule(cronSchedule, async () => {
		logger.info('[daily-orderbook-backup] Cron job triggered');
		try {
			await processDailyOrderbookBackup();
		} catch (error) {
			logger.error({ err: error.message, stack: error.stack }, '[daily-orderbook-backup] Cron job execution failed');
		}
	}, {
		scheduled: true,
		timezone: 'UTC', // UTC 기준으로 실행
	});
	
	logger.info('[daily-orderbook-backup] Daily backup cron job started');
}

function stopDailyOrderbookBackupCron() {
	if (cronJob) {
		cronJob.stop();
		cronJob = null;
		logger.info('[daily-orderbook-backup] Daily backup cron job stopped');
	}
}

// 모듈 내보내기
module.exports = {
	startDailyOrderbookBackupCron,
	stopDailyOrderbookBackupCron,
	processDailyOrderbookBackup, // 테스트용으로 직접 호출 가능
};

