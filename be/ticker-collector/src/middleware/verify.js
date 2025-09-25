const { respMsg } = require("../utils/common");

exports.verifyTypes = Object.freeze({ Header: "headers", Body: "body", Query: "query", Param: "params" });

exports.verifyData =
	(field = "body", params = []) =>
	(req, resp, next) => {
		if (!params.every((param) => req[field].hasOwnProperty(param))) {
			return respMsg(resp, "param_require", `${field} : ${params}`)
		}
		next();
	};



