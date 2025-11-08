"use strict";

const { Router } = require("express");
const router = Router();

const { verifyToken, verifyTokenRole } = require("../middleware/token");
const { respMsgStr, respData, respMsg } = require("../utils/common");
const { verifyData, verifyTypes } = require("../middleware/verify");
const { prePaging } = require("../middleware/paging");
const { db, Op } = require("../db/db");
const common= require("../utils/common");

router.use("/*", (req, resp, next) => {
	//#swagger.tags = ["Index Calculation"]
	//#swagger.responses[440] = { description: '각종 오류 - 상세 내용은 message 참조' }
	next();
});

router.get("/", prePaging("createdAt", "desc", 100), async (req, resp, next) => {
	// #swagger.description = 'FKBRTI 지수 계산 (5초, 10초 이동평균 포함)'
	// #swagger.parameters['from_date'] = {in:"query",type:"datetime", description:"검색시작시간 (예: 2025-09-01T00:00:00Z)"}
	// #swagger.parameters['to_date'] = {in:"query",type:"datetime", description:"검색마지막시간 (예: 2025-09-30T23:59:59Z)"}
	// #swagger.parameters['page'] = {in:"query",type:"integer", description:"페이지 번호 (기본값: 1)"}
	// #swagger.parameters['size'] = {in:"query",type:"integer", description:"페이지 크기 (기본값: 100)"}
	// #swagger.parameters['order'] = {in:"query",type:"string", description:"정렬 순서 - asc 또는 desc (기본값: desc)"}
	try {
		const options = {
			page: req.page,
			size: req.size,
			order: req.order
		};

		// 날짜 파라미터가 있으면 추가
		if (req.query.from_date && req.query.to_date) {
			options.fromDate = new Date(req.query.from_date).toISOString();
			const toDateObj = new Date(req.query.to_date);
			toDateObj.setDate(toDateObj.getDate() + 1);
			options.toDate = toDateObj.toISOString();			
		}

		// console.log("options", options);

		// 모델의 static 메서드 호출
		const result = await db.tb_fkbrti_1sec.getIndexWithMovingAverage(options);

		let new_datalist = [];

		for (const item of result.datalist) {
		  let new_item = {
			createdAt: item.createdAt,
			fkbrti_1s: item.fkbrti_1s,
			fkbrti_5s: item.fkbrti_5s,
			fkbrti_10s: item.fkbrti_10s,
			expected_status: item.expected_status,
			expected_exchanges: item.expected_exchanges,
			sources: item.sources,
			vwap_buy: common.isEmpty(item.vwap_buy) ? 0 : item.vwap_buy,
			vwap_sell: common.isEmpty(item.vwap_sell) ? 0 : item.vwap_sell,
			no_publish: item.no_publish,
			provisional: item.provisional,
			UPBIT: item.expected_status.find(item => item.exchange == "101")?.price,
			BITTHUMB: item.expected_status.find(item => item.exchange == "102")?.price,
			COINONE: item.expected_status.find(item => item.exchange == "104")?.price,
			KORBIT: item.expected_status.find(item => item.exchange == "103")?.price,
			diff_1: item.diff,
			diff_5: 0,
			diff_10: 0,
			ratio_1: item.ratio,
			ratio_5: 0,
			ratio_10: 0,
			actual_avg: item.actual_avg,
		  };
  
		  let sum = 0;
		  let count = 0;
		  for (const expected_status of item.expected_status) {
			if (expected_status.reason == "ok") {
			  sum += expected_status.price;
			  count++;
			}
		  }
  
		  let colF = new_item.BITTHUMB;
		  let colI = new_item.UPBIT;
  
		  if (!colI && colI !== 0) {
			new_item.diff_5 = colF - new_item.fkbrti_5s;
		  } else {
			new_item.diff_5 = colI - new_item.fkbrti_5s;
		  }
  
		  if (!colI && colI !== 0) {
			new_item.diff_10 = colF - new_item.fkbrti_10s;
		  } else {
			new_item.diff_10 = colI - new_item.fkbrti_10s;
		  }
  
		  if (!colI && colI !== 0) {
			new_item.ratio_5 = Math.abs(new_item.diff_5 / colF);
		  } else {
			new_item.ratio_5 = Math.abs(new_item.diff_5 / colI);
		  }
		  new_item.ratio_5 = new_item.ratio_5 * 100;
  
		  if (!colI && colI !== 0) {
			new_item.ratio_10 = Math.abs(new_item.diff_10 / colF);
		  } else {
			new_item.ratio_10 = Math.abs(new_item.diff_10 / colI);
		  }
		  new_item.ratio_10 = new_item.ratio_10 * 100;
  
		  new_datalist.push(new_item);
		}		

		result.datalist = [...new_datalist];
		resp.json({
			result: true,
			...result
		});
	} catch (error) {
		console.error('에러 발생:', error);
		next(error);
	}
});

router.get("/stats", async (req, resp, next) => {
	// #swagger.description = 'FKBRTI 통계 조회 (기간별 DIFF 및 RATIO 통계) - 1D, 1W, 1M, 1Y'
	// #swagger.responses[200] = { description: '성공 시 통계 데이터 반환' }
	try {
		const stats = await db.tb_fkbrti_1sec.getStatsSQL();

		resp.json({
			result: true,
			stats
		});
	} catch (error) {
		console.error('통계 조회 에러:', error);
		next(error);
	}
});

module.exports = router;
