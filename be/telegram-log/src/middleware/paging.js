const { respMsg } = require("../common");

exports.prePaging =
	(sort = "createdAt", order = "desc", size = 30) =>
	(req, resp, next) => {
		//    #swagger.parameters['page'] = {type:"integer", description:"1 이상 - 기본값 1"}
		req.page = parseInt(req.query.page ?? 1);
		//    #swagger.parameters['size'] = {type:"integer", description:"1 이상 - 기본값 30"}
		req.size = parseInt(req.query.size ?? size);
		//    #swagger.parameters['order'] = {type:"string", description:"asc 또는 desc - 기본값 desc"}
		req.order = req.query.order ?? order;
		//    #swagger.parameters['sort'] = {type:"string", description:"정렬할 필드 이름 - 기본값은 createdAt" }
		req.sort = req.query.sort ?? sort;
		if (req.page < 1) {
			return respMsg(resp, "param_error", "page");
		}
		if (req.size < 1) {
			return respMsg(resp, "param_error", "size");
		}
		next();
	};
const preStringDateOption = { field: "query", latest: false };

exports.preStringDate =
	(fieldName, option = preStringDateOption) =>
	(req, resp, next) => {
		const nextOption = { ...preStringDateOption, ...option };
		try {
			req[fieldName] = new Date(req[nextOption.field][fieldName]).setHours(nextOption.latest ? 24 : 0, 0, 0, 0);
		} catch (error) {
			return respMsg(resp, "param_error", fieldName);
		}
		next();
	};
