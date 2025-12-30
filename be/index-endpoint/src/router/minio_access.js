"use strict";

const { Router } = require("express");
const router = Router();
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");

const { verifyToken, verifyTokenRole } = require("../middleware/token");
const { respMsgStr, respData, respMsg } = require("../utils/common");
const { verifyData, verifyTypes } = require("../middleware/verify");
const { prePaging } = require("../middleware/paging");
const common= require("../utils/common");
const { db, Op } = require("../db/quest_db");
const { once } = require('events');

// MinIO S3 클라이언트 생성
function getS3Client() {
	const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'http://minio-service.bonanza-index.svc.cluster.local:9000';
	const MINIO_ACCESS_KEY = process.env.MINIO_ROOT_USER || 'bonanza';
	const MINIO_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD || '56tyghbn';
	const MINIO_REGION = process.env.MINIO_REGION || 'us-east-1';
	
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

router.use("/*", (req, resp, next) => {
	//#swagger.tags = ["MinIO Access"]
	//#swagger.responses[440] = { description: '각종 오류 - 상세 내용은 message 참조' }
	next();
});

router.get("/list", async (req, resp, next) => {
	// #swagger.description = 'MinIO 버킷 파일 리스트 조회'
	// #swagger.parameters['prefix'] = {in:"query",type:"string", description:"파일 경로 prefix (예: orderbook/)"}
	// #swagger.parameters['maxKeys'] = {in:"query",type:"integer", description:"최대 반환 개수 (기본: 1000)"}
	// #swagger.parameters['continuationToken'] = {in:"query",type:"string", description:"페이징용 continuation token"}
	try {
		const { prefix, maxKeys, continuationToken } = req.query;
		const bucket = process.env.MINIO_BUCKET || 'bonanza-index';
		
		const s3Client = getS3Client();
		
		// continuationToken이 유효한 값인지 확인 (빈 문자열, "0", null, undefined 제외)
		const validContinuationToken = continuationToken && 
			continuationToken !== '' && 
			continuationToken !== '0' && 
			continuationToken !== 'null' 
			? continuationToken 
			: undefined;
		
		const command = new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix || '',
			MaxKeys: maxKeys ? parseInt(maxKeys, 10) : 1000,
			...(validContinuationToken && { ContinuationToken: validContinuationToken }),
		});
		
		const response = await s3Client.send(command);
		
		let fileList = (response.Contents || []).map(item => ({
			key: item.Key,
			size: item.Size,
			lastModified: item.LastModified,
			etag: item.ETag,
		}));
		
		// 파일명(key) 기준 내림차순 정렬 (최신 파일이 먼저 - 파일명에 날짜가 포함된 경우)
		// fileList.sort((a, b) => {
		// 	// 파일명에서 날짜 추출 (예: orderbook_20231126_KRW-BTC.csv.gz)
		// 	const getDateFromKey = key => {
		// 		const match = key.match(/(\d{8})/);
		// 		return match ? match[1] : null;
		// 	};
		// 	const dateA = getDateFromKey(a.key);
		// 	const dateB = getDateFromKey(b.key);
			
		// 	// 날짜가 있으면 날짜 기준으로 정렬 (내림차순)
		// 	if (dateA && dateB) {
		// 		return dateB.localeCompare(dateA);
		// 	}
		// 	// 날짜가 없으면 파일명 전체로 정렬 (내림차순)
		// 	return b.key.localeCompare(a.key);
		// });
		
		resp.status(200).json({
			files: fileList,
			isTruncated: response.IsTruncated || false,
			nextContinuationToken: response.NextContinuationToken || null,
			keyCount: response.KeyCount || 0,
		});
		
	} catch (error) {
		console.error('MinIO 파일 리스트 조회 중 에러 발생:', error);
		next(error);
	}
});

router.get("/", async (req, resp, next) => {
	// #swagger.description = 'MinIO 버킷 파일 리스트 조회 (기본 엔드포인트)'
	// #swagger.parameters['prefix'] = {in:"query",type:"string", description:"파일 경로 prefix (예: orderbook/)"}
	// #swagger.parameters['maxKeys'] = {in:"query",type:"integer", description:"최대 반환 개수 (기본: 1000)"}
	try {
		const { prefix, maxKeys, continuationToken } = req.query;
		const bucket = process.env.MINIO_BUCKET || 'bonanza-index';
		
		const s3Client = getS3Client();
		
		// continuationToken이 유효한 값인지 확인 (빈 문자열, "0", null, undefined 제외)
		const validContinuationToken = continuationToken && 
			continuationToken !== '' && 
			continuationToken !== '0' && 
			continuationToken !== 'null' 
			? continuationToken 
			: undefined;
		
		const command = new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix || '',
			MaxKeys: maxKeys ? parseInt(maxKeys, 10) : 1000,
			...(validContinuationToken && { ContinuationToken: validContinuationToken }),
		});
		
		const response = await s3Client.send(command);
		
		let fileList = (response.Contents || []).map(item => ({
			key: item.Key,
			size: item.Size,
			lastModified: item.LastModified,
			etag: item.ETag,
		}));
		// 파일명을 기준으로 최근 날짜순으로 내림차순 정렬 (파일명에 날짜가 포함된 경우)
		fileList.sort((a, b) => {
			// 예: 'orderbook_20231126_KRW-BTC.csv.gz' 파일명에서 20231126 추출
			const getDateFromKey = key => {
				const match = key.match(/(\d{8})/);
				return match ? match[1] : null;
			};
			const dateA = getDateFromKey(a.key);
			const dateB = getDateFromKey(b.key);
			if (dateA === dateB) return 0;
			if (!dateA) return 1;
			if (!dateB) return -1;
			return dateB.localeCompare(dateA);
		});
		
		resp.status(200).json({
			files: fileList,
			isTruncated: response.IsTruncated || false,
			nextContinuationToken: response.NextContinuationToken || null,
			keyCount: response.KeyCount || 0,
		});
		
	} catch (error) {
		console.error('MinIO 파일 리스트 조회 중 에러 발생:', error);
		next(error);
	}
});

router.get("/download", async (req, resp, next) => {
	// #swagger.description = 'MinIO 버킷 파일 다운로드'
	// #swagger.parameters['key'] = {in:"query",type:"string", required:true, description:"다운로드할 파일의 키 (예: orderbook/orderbook_20251126_KRW-BTC.csv.gz)"}
	try {
		const { key } = req.query;
		const bucket = process.env.MINIO_BUCKET || 'bonanza-index';
		
		if (!key) {
			return resp.status(400).json({ message: "파일 키(key) 파라미터가 필요합니다." });
		}
		
		const s3Client = getS3Client();
		
		const command = new GetObjectCommand({
			Bucket: bucket,
			Key: key,
		});
		
		const response = await s3Client.send(command);
		
		// 파일명 추출 (키에서 마지막 부분)
		const fileName = key.split('/').pop() || key;
		
		// Content-Type 설정 (파일 확장자에 따라)
		let contentType = 'application/octet-stream';
		if (fileName.endsWith('.csv.gz') || fileName.endsWith('.gz')) {
			contentType = 'application/gzip';
		} else if (fileName.endsWith('.csv')) {
			contentType = 'text/csv; charset=utf-8';
		} else if (fileName.endsWith('.json')) {
			contentType = 'application/json';
		}
		
		// 응답 헤더 설정
		resp.setHeader('Content-Type', contentType);
		resp.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
		
		// Content-Length가 있으면 설정
		if (response.ContentLength) {
			resp.setHeader('Content-Length', response.ContentLength);
		}
		
		// Last-Modified가 있으면 설정
		if (response.LastModified) {
			resp.setHeader('Last-Modified', response.LastModified.toUTCString());
		}
		
		// ETag가 있으면 설정
		if (response.ETag) {
			resp.setHeader('ETag', response.ETag);
		}
		
		// 스트림을 응답으로 파이프
		if (response.Body) {
			// Body를 Node.js ReadableStream으로 변환
			const stream = response.Body;
			
			// 스트림을 응답으로 전송
			stream.pipe(resp);
			
			// 에러 처리
			stream.on('error', (error) => {
				console.error('파일 다운로드 스트림 에러:', error);
				if (!resp.headersSent) {
					resp.status(500).json({ message: '파일 다운로드 중 에러가 발생했습니다.' });
				}
			});
			
			// 클라이언트 연결 끊김 감지
			resp.on('close', () => {
				if (stream.destroy) {
					stream.destroy();
				}
			});
		} else {
			resp.status(404).json({ message: '파일을 찾을 수 없습니다.' });
		}
		
	} catch (error) {
		console.error('MinIO 파일 다운로드 중 에러 발생:', error);
		
		// 404 에러 처리
		if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
			return resp.status(404).json({ message: '파일을 찾을 수 없습니다.' });
		}
		
		next(error);
	}
});

module.exports = router;
