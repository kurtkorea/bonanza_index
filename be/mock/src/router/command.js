"use strict";

const { Router } = require("express");
const router = Router();

const { verifyToken, verifyTokenRole } = require("../middleware/token");
const { respMsgStr, respData, respMsg } = require("../common");
const { verifyData, verifyTypes } = require("../middleware/verify");
const { OpenOrder } = require("../../models");
const common= require("../common");

router.use("/*", (req, resp, next) => {
	//#swagger.tags = ["Advertise"]
	//#swagger.responses[440] = { description: '각종 오류 - 상세 내용은 message 참조' }
	next();
});

router.get("/", async (req, resp, next) => {
	// #swagger.description = '광고 데이터 요청'
	// #swagger.parameters['type'] = {in:"query",type:"string", description:"asc 또는 desc - 기본값 desc"}
	// #swagger.parameters['order'] = {in:"query",type:"string", description:"asc 또는 desc - 기본값 asc"}
	// #swagger.parameters['sort'] = {in:"query",type:"string", description:"정렬할 필드 이름 - 기본값은 advertise_order" }
	// try {
	// 	const whereOption = {};
	// 	if (req.query.user_id) {
	// 		whereOption.user_id = req.query.user_id;
	// 	}
	// 	resp.json(
	// 		await OpenOrder.findByUserId(req.query.user_id),
	// 	);
	// } catch (error) {
	// 	next(error);
	// }
});

// router.post("/", verifyTokenRole("admin"), verifyData(verifyTypes.Body, ["type", "url"]), async (req, resp, next) => {
// 	// #swagger.description = '광고 추가'
// 	/* #swagger.parameters["body"] = {in:"body", schema: {
// 				$type: "menu",
// 				$url: "http://test.com/img/a.jpg",
// 				$order: 0,
// 				$status: "show",
// 			},
// 			description : "광고 추가 객체, order 및 status는 없는경우 각각 0, show 기본값으로 처리됨"
// 		}*/
// 	try {
// 		const result = await Advertise.create(
// 			{
// 				advertise_type: req.body.type,
// 				advertise_url: req.body.url,
// 				advertise_order: req.body?.order ?? 0,
// 				advertise_status: req.body?.status ?? "show",
// 			},
// 			{ logging },
// 		);
// 		resp.json(result);
// 	} catch (error) {
// 		next(error);
// 	}
// });

router.post("/", /*verifyTokenRole("admin"),*/ verifyData(verifyTypes.Body, [  "market"
																			, "symbol"
																			, "user_id"
																			, "position_type"
																			, "is_settle"
																			, "order_type"
																			, "order_price"
																			, "order_volume"
																			, "leverage"
																			, "isolate"
																		
	]), async (req, resp, next) => {
	// #swagger.description = '광고 정렬 수정'
	/* #swagger.parameters["body"] = {in:"body", schema: {
				$type: "menu",
				$orders: [1,2,5,4],
			},
			description : "광고 정렬 수정, orders 에 advertise_no 순서에 따라 order번호가 증가되어 자동 변경됨"
		}*/
	try {
		
		const order = await OpenOrder.build_order(req.body)
		var orders = common.open_orders.get(order.symbol);
		if ( orders == null)
		{
			orders = new Array();
			common.open_orders.set( order.symbol, orders );
		}
		orders.push(order);
		req.body.success = true;
		resp.json(req.body);
	} catch (error) {
		next(error);
	}
});

module.exports = router;
