"use strict";

const { Router } = require("express");
const router = Router();
const IndexProcessInfo = require("../model_mysql/index_process_info.js");

router.use("/*", (req, resp, next) => {
	//#swagger.tags = ["Index History"]
	//#swagger.responses[440] = { description: '각종 오류 - 상세 내용은 message 참조' }
	next();
});

router.get("/", async (req, resp, next) => {
    // #swagger.description = '마스터 데이터 요청'
	try {
        const {master_info, symbols} = await IndexProcessInfo.getMasterInfo();
        resp.json({
            result: true,
            master_info: master_info,
            symbols: symbols
        });
	} catch (error) {
		console.error('에러 발생:', error);
		next(error);
	}
});



module.exports = router;
