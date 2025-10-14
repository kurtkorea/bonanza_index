const jwt = require("jsonwebtoken");
const { respMsg } = require("../utils/common");
/**
 * @param {HttpRequest} req
 * @param {HttpResponse} resp
 * @param {*} next
 * @description 헤더 Authorization필드의 토큰 검사, env.JWT_SECRET 체크
 */
exports.verifyToken = (req, resp, next) => {
	try {
		req.tokenDecode = jwt.verify(req.headers.authorization, process.env.JWT_SECRET);
		return next();
	} catch (error) {
		if (error.name === "TokenExpiredError") {
			return respMsg(resp,"token_expire")
		} else {
			return respMsg(resp,"token_invalid")
		}
	}
};

exports.verifyAdminToken = (req, resp, next) => {
	try {
		req.tokenDecode = jwt.verify(req.headers.authorization, process.env.JWT_SECRET);
		if (req.tokenDecode.role !== "admin") {
			return respMsg(resp,"token_permission")
		}
		return next();
	} catch (error) {
		if (error.name === "TokenExpiredError") {
			return respMsg(resp,"token_expire")
		} else {
			return respMsg(resp,"token_invalid")
		}
	}
};

exports.verifyTokenRole = (role) => (req, resp, next) => {
	try {
		req.tokenDecode = jwt.verify(req.headers.authorization, process.env.JWT_SECRET);
		if (req.tokenDecode.role !== role) {
			return respMsg(resp, "token_permission", ` - ${role}`);
		}
		return next();
	} catch (error) {
		if (error.name === "TokenExpiredError") {
			return respMsg(resp, "token_expire");
		} else {
			return respMsg(resp, "token_invalid");
		}
	}
};










