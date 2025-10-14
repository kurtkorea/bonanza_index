"use strict";

const { Router } = require("express");
const router = Router();
const { sendTelegramMessageSource } = require("../utils/telegram_push");

router.use("/*", (req, resp, next) => {
	//#swagger.tags = ["Index Calculation"]
	//#swagger.responses[440] = { description: '각종 오류 - 상세 내용은 message 참조' }
	next();
});

router.post("/", async (req, resp, next) => {
	// #swagger.description = '텔레그램 메시지 전송'
    // #swagger.parameters['source'] = {in:"query",type:"string", description:"메시지 소스"}
    // #swagger.parameters['content'] = {in:"query",type:"string", description:"메시지 내용"}

    try {
        const result = {
            source: req.body.source,
            content: req.body.content
        }

        // console.log("req.body", req.body.is_send);

        sendTelegramMessageSource(result.source, result.content, req.body.is_send);
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
