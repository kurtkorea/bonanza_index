"use strict";

const { Router } = require("express");
const router = Router();

const { verifyToken, verifyTokenRole } = require("../middleware/token");
const { respMsgStr, respData, respMsg } = require("../utils/common");
const { verifyData, verifyTypes } = require("../middleware/verify");
const { prePaging } = require("../middleware/paging");
const common= require("../utils/common");
const { db, Op } = require("../db/db");

router.use("/*", (req, resp, next) => {
	//#swagger.tags = ["Index History"]
	//#swagger.responses[440] = { description: '각종 오류 - 상세 내용은 message 참조' }
	next();
});

router.get("/", prePaging("createdAt", "desc", 100), async (req, resp, next) => {
	// #swagger.description = 'FKBRTI 지수 히스토리 조회 (기본 데이터)'
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

		const result = await db.tb_fkbrti_1sec.getIndexHistory(options);
		
		resp.json({
			result: true,
			...result
		});
	} catch (error) {
		console.error('에러 발생:', error);
		next(error);
	}
});



module.exports = router;
