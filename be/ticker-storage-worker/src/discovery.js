const axios = require("axios");
const { Router } = require("express");
const router = Router();
const logger = require("./utils/logger");
const endpoint = [];
let serviceList = [];

const findEndpoint = (path, layer) => {
	if (layer.route) {
		layer.route.stack.forEach(findEndpoint.bind(null, path.concat(split(layer.route.path))));
	} else if (layer.name === "router" && layer.handle.stack) {
		layer.handle.stack.forEach(findEndpoint.bind(null, path.concat(split(layer.regexp))));
	} else if (layer.method) {
		const endpointMethod = layer.method.toUpperCase();
		const endpointPath = "/" + path.concat(split(layer.regexp)).filter(Boolean).join("/");
		if (!endpoint.find((item) => item.method === endpointMethod && item.path === endpointPath))
			endpoint.push({
				method: endpointMethod,
				path: endpointPath,
			});
	}
};

const split = (thing) => {
	if (typeof thing === "string") {
		return thing.split("/");
	} else if (thing.fast_slash) {
		return "";
	} else {
		var match = thing
			.toString()
			.replace("\\/?", "")
			.replace("(?=\\/|$)", "$")
			.match(/^\/\^((?:\\[.*+?^${}()|[\]\\\/]|[^.*+?^${}()|[\]\\\/])*)\$\//);
		return match ? match[1].replace(/\\(.)/g, "$1").split("/") : "<complex:" + thing.toString() + ">";
	}
};

/**
 * @param {Express} app Express()를 통해 반환받은 express 객체
 *
 * @description 자동 discovery 서비스 등록 모든 라우터를 이 함수 실행 전에 등록 할 것 env파일에 DISCOVERY, SERVICE, ADDRESS, PORT필요
 */

const init = (app) => {
	try {
		logger.info("init discovery service regist");
		app._router.stack.forEach(findEndpoint.bind(null, []));
		axios
			.post(`http://${process.env.DISCOVERY}/service`, { service: process.env.SERVICE, address: process.env.ADDRESS, port: process.env.PORT, endpoint })
			.then(({ data }) => {
				serviceList = data.list;
			});
	} catch (error) {
		logger.error({ ex: "DISCOVERY", err: `${error.name}: ${error.message}` }, "Discovery init error:");
	}
	return app.use("/health", router);
};

router.post("/", (req, resp, next) => {
	if (req.body.list) {
		serviceList = req.body.list;
	}
	resp.send("alive");
});

module.exports = { init };
