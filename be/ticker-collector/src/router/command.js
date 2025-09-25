"use strict";

const { Router } = require("express");
const router = Router();

const { verifyToken, verifyTokenRole } = require("../middleware/token");
const { respMsgStr, respData, respMsg } = require("../utils/common");
const { verifyData, verifyTypes } = require("../middleware/verify");
// const { Messages } = require("../../models");
const common= require("../utils/common");

router.use("/*", (req, resp, next) => {
	next();
});

router.get("/", async (req, resp, next) => {
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
	try {
		// OpenOrder 모델이 없으므로 임시로 주석 처리
		// const order = await OpenOrder.build_order(req.body)
		// var orders = common.open_orders.get(order.symbol);
		// if ( orders == null)
		// {
		// 	orders = new Array();
		// 	common.open_orders.set( order.symbol, orders );
		// }
		// orders.push(order);
		req.body.success = true;
		resp.json(req.body);
	} catch (error) {
		next(error);
	}
});

module.exports = router;
