"use strict";

const { Router } = require("express");
const router = Router();
const { send_publisher } = require("../utils/zmq-sender-pub.js");

router.use("/*", (req, resp, next) => {
	//#swagger.tags = ["Index History"]
	//#swagger.responses[440] = { description: '각종 오류 - 상세 내용은 message 참조' }
	next();
});

router.get("/", async (req, resp, next) => {
	// #swagger.description = '명령어 요청'
	// #swagger.parameters['process_id'] = {in:"query",type:"string", description:"프로세스 ID"}
	// #swagger.parameters['command'] = {in:"query",type:"string", description:"명령어"}
	try {
        const process_id = req.query.process_id ;
        const command = req.query.command;

        if (!process_id || !command) {
            return resp.status(400).json({
                result: false,
                message: "프로세스 ID 또는 명령어가 없습니다."
            });
        }

        send_publisher("command/" + process_id, { process_id : process_id, command : command });
		
		resp.json({
			result: true,
		});
	} catch (error) {
		console.error('에러 발생:', error);
		next(error);
	}
});



module.exports = router;
