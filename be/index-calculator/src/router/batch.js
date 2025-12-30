"use strict";

const { Router } = require("express");
const router = Router();
const { Worker } = require('worker_threads');
const path = require('path');
const { respMsg, respData } = require("../utils/common");
const { verifyData, verifyTypes } = require("../middleware/verify");
const logger = require('../utils/logger.js');

// 실행 중인 Worker들을 관리하는 Map
const activeWorkers = new Map();

router.use("/*", (req, resp, next) => {
	//#swagger.tags = ["Batch Processing"]
	//#swagger.responses[440] = { description: '각종 오류 - 상세 내용은 message 참조' }
	next();
});

/**
 * 배치 처리 시작
 * POST /api/batch/process
 */
router.post("/process", 
	verifyData(verifyTypes.Body, ["startTime", "endTime"]), 
	async (req, resp, next) => {
		// #swagger.description = 'order_book_units 데이터를 사용하여 FKBRTI 인덱스를 배치로 계산합니다.'
		/* #swagger.parameters["body"] = {
			in: "body",
			schema: {
				$startTime: "2025-01-01T00:00:00Z",
				$endTime: "2025-01-01T23:59:59Z",
				$symbol: "KRW-BTC",
				$depth: 15,
				$staleMs: 30000,
				$expectedExchanges: ["E0010001", "E0020001", "E0030001", "E0050001"],
				$tableName: "tb_fkbrti_1sec",
				$chunkSizeHours: 1,
				$gcInterval: 10000,
				$enableGc: true
			},
			description: "배치 처리 파라미터 (chunkSizeHours: 청크 크기(시간), gcInterval: GC 유도 간격(초), enableGc: GC 활성화 여부)"
		} */
		try {
			const {
				startTime,
				endTime,
				symbol = 'KRW-BTC',
				depth = 15,
				staleMs = 30000,
				expectedExchanges = ['E0010001', 'E0020001', 'E0030001', 'E0050001'],
				tableName = 'tb_fkbrti_1sec'
			} = req.body;

			// 시간 유효성 검증
			const start = new Date(new Date(startTime).getTime() + 9 * 60 * 60 * 1000);
			const end = new Date(new Date(endTime).getTime() + 9 * 60 * 60 * 1000);

			if (isNaN(start.getTime()) || isNaN(end.getTime())) {
				return respMsg(resp, "validation_error", " - 유효하지 않은 시간 형식입니다.");
			}

			if (start >= end) {
				return respMsg(resp, "validation_error", " - 시작 시간이 종료 시간보다 늦거나 같습니다.");
			}

			// Worker ID 생성
			const workerId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

			// Worker 생성
			const workerPath = path.join(__dirname, '../worker/batch_worker.js');
			const worker = new Worker(workerPath, {
				workerData: {
					startTime: start.toISOString(),
					endTime: end.toISOString(),
					symbol,
					depth,
					staleMs,
					expectedExchanges,
					tableName,
					// GC 관리 옵션 (요청에서 전달 가능)
					chunkSizeHours: req.body.chunkSizeHours || 1, // 청크 크기 (시간 단위, 기본 1시간)
					gcInterval: req.body.gcInterval || 10000, // GC 유도 간격 (처리된 초 단위, 기본 10000초)
					enableGc: req.body.enableGc !== false // GC 유도 활성화 여부 (기본 true)
				}
			});

			// Worker 상태 관리
			const workerInfo = {
				id: workerId,
				startTime: start.toISOString(),
				endTime: end.toISOString(),
				symbol,
				status: 'running',
				startedAt: new Date().toISOString(),
				progress: {
					processed: 0,
					total: 0,
					percentage: 0
				}
			};

			activeWorkers.set(workerId, {
				worker,
				info: workerInfo
			});

			// Worker 메시지 수신
			worker.on('message', (message) => {
				if (message.type === 'progress') {
					workerInfo.progress = {
						processed: message.processed,
						total: message.total,
						percentage: parseFloat(message.progress)
					};
					// logger.info({
					// 	workerId,
					// 	progress: workerInfo.progress
					// }, '[BatchRouter] 배치 처리 진행 중');
				} else if (message.type === 'complete') {
					workerInfo.status = 'completed';
					workerInfo.completedAt = new Date().toISOString();
					workerInfo.result = message.result;
					logger.info({
						workerId,
						result: message.result
					}, '[BatchRouter] 배치 처리 완료');
				} else if (message.type === 'error') {
					workerInfo.status = 'error';
					workerInfo.error = message.error;
					workerInfo.completedAt = new Date().toISOString();
					logger.error({
						workerId,
						error: message.error
					}, '[BatchRouter] 배치 처리 오류');
				}
			});

			// Worker 종료 처리
			worker.on('exit', (code) => {
				if (code !== 0 && workerInfo.status === 'running') {
					workerInfo.status = 'error';
					workerInfo.error = { message: `Worker exited with code ${code}` };
					workerInfo.completedAt = new Date().toISOString();
				}
				logger.info({
					workerId,
					exitCode: code,
					status: workerInfo.status
				}, '[BatchRouter] Worker 종료');
			});

			// Worker 오류 처리
			worker.on('error', (error) => {
				workerInfo.status = 'error';
				workerInfo.error = {
					message: error.message,
					stack: error.stack
				};
				workerInfo.completedAt = new Date().toISOString();
				logger.error({
					workerId,
					err: String(error),
					stack: error.stack
				}, '[BatchRouter] Worker 오류 발생');
			});

			// 응답 반환
			return resp.status(202).json({
				success: true,
				message: '배치 처리가 시작되었습니다.',
				workerId,
				info: workerInfo
			});

		} catch (error) {
			logger.error({
				err: String(error),
				stack: error.stack
			}, '[BatchRouter] 배치 처리 시작 중 오류');
			next(error);
		}
	}
);

/**
 * 배치 처리 상태 조회
 * GET /api/batch/status/:workerId
 */
router.get("/status/:workerId", async (req, resp, next) => {
	// #swagger.description = '배치 처리 상태를 조회합니다.'
	try {
		const { workerId } = req.params;

		const workerData = activeWorkers.get(workerId);

		if (!workerData) {
			return respMsg(resp, "not_found", " - 해당 Worker를 찾을 수 없습니다.");
		}

		return resp.status(200).json({
			success: true,
			workerId,
			info: workerData.info
		});

	} catch (error) {
		logger.error({
			err: String(error),
			stack: error.stack
		}, '[BatchRouter] 배치 처리 상태 조회 중 오류');
		next(error);
	}
});

/**
 * 실행 중인 모든 배치 처리 목록 조회
 * GET /api/batch/list
 */
router.get("/list", async (req, resp, next) => {
	// #swagger.description = '실행 중인 모든 배치 처리 목록을 조회합니다.'
	try {
		const workers = Array.from(activeWorkers.entries()).map(([id, data]) => ({
			workerId: id,
			info: data.info
		}));

		return resp.status(200).json({
			success: true,
			count: workers.length,
			workers
		});

	} catch (error) {
		logger.error({
			err: String(error),
			stack: error.stack
		}, '[BatchRouter] 배치 처리 목록 조회 중 오류');
		next(error);
	}
});

/**
 * 배치 처리 취소
 * POST /api/batch/cancel/:workerId
 */
router.post("/cancel/:workerId", async (req, resp, next) => {
	// #swagger.description = '실행 중인 배치 처리를 취소합니다.'
	try {
		const { workerId } = req.params;

		const workerData = activeWorkers.get(workerId);

		if (!workerData) {
			return respMsg(resp, "not_found", " - 해당 Worker를 찾을 수 없습니다.");
		}

		if (workerData.info.status !== 'running') {
			return respMsg(resp, "validation_error", " - 이미 완료되었거나 취소된 작업입니다.");
		}

		// Worker에 취소 메시지 전송
		workerData.worker.postMessage({ type: 'cancel' });

		// Worker 종료 대기
		await workerData.worker.terminate();

		workerData.info.status = 'cancelled';
		workerData.info.completedAt = new Date().toISOString();

		// Worker 제거
		activeWorkers.delete(workerId);

		return resp.status(200).json({
			success: true,
			message: '배치 처리가 취소되었습니다.',
			workerId
		});

	} catch (error) {
		logger.error({
			err: String(error),
			stack: error.stack
		}, '[BatchRouter] 배치 처리 취소 중 오류');
		next(error);
	}
});

/**
 * Summary 계산 수동 실행
 * POST /api/batch/summary/calculate
 */
router.post("/summary/calculate", async (req, resp, next) => {
	// #swagger.description = 'Summary 통계를 수동으로 계산하여 tb_fkbrti_summary에 저장합니다.'
	/* #swagger.parameters["body"] = {
		in: "body",
		schema: {
			$symbols: ["KRW-BTC"]
		},
		description: "처리할 심볼 목록 (선택적, 없으면 기본값 사용)"
	} */
	try {
		const { symbols } = req.body;
		
		// SummaryScheduler 인스턴스 가져오기 (글로벌 또는 새로 생성)
		const scheduler = global.summaryScheduler;
		
		if (!scheduler) {
			return resp.status(400).json({
				success: false,
				message: 'Summary 스케줄러가 초기화되지 않았습니다.'
			});
		}
		
		// 수동 실행
		await scheduler.executeManual();
		
		return resp.status(200).json({
			success: result.success,
			message: 'Summary 계산이 완료되었습니다.',
			result
		});

	} catch (error) {
		logger.error({
			err: String(error),
			stack: error.stack
		}, '[BatchRouter] Summary 계산 중 오류');
		next(error);
	}
});

/**
 * Summary 스케줄러 상태 조회
 * GET /api/batch/summary/status
 */
router.get("/summary/status", async (req, resp, next) => {
	// #swagger.description = 'Summary 스케줄러의 상태를 조회합니다.'
	try {
		const scheduler = global.summaryScheduler;
		
		if (!scheduler) {
			return resp.status(200).json({
				success: true,
				enabled: false,
				message: 'Summary 스케줄러가 초기화되지 않았습니다.'
			});
		}

		return resp.status(200).json({
			success: true,
			enabled: scheduler.enabled,
			intervalMs: scheduler.intervalMs,
			intervalMinutes: Math.floor(scheduler.intervalMs / 60000),
			symbols: scheduler.symbols,
			isRunning: scheduler.isRunning,
			timerActive: scheduler.timer !== null
		});

	} catch (error) {
		logger.error({
			err: String(error),
			stack: error.stack
		}, '[BatchRouter] Summary 스케줄러 상태 조회 중 오류');
		next(error);
	}
});

module.exports = router;

