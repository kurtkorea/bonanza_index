const jwt = require("jsonwebtoken");
const { respMsg } = require("../common");
/**
 * @param {HttpRequest} req
 * @param {HttpResponse} resp
 * @param {*} next
 * @description 헤더 Authorization필드의 토큰 검사, env.JWT_SECRET 체크
 */
exports.verifyToken = (req, resp, next) => {
	try {
		//  #swagger.parameters['authorization'] = { description: 'JWT 토큰',in:'header', required: 'true' }
		req.tokenDecode = jwt.verify(req.headers.authorization, process.env.JWT_SECRET);
		return next();
	} catch (error) {
		if (error.name === "TokenExpiredError") {
			// #swagger.responses[420] = { description: '토큰 만료' }
			return respMsg(resp,"token_expire")
		} else {
			// #swagger.responses[401] = { description: '유효하지 않은 토큰' }
			return respMsg(resp,"token_invalid")
		}
	}
};

exports.verifyAdminToken = (req, resp, next) => {
	try {
		//  #swagger.parameters['authorization'] = { description: 'JWT 토큰 - role: admin', in: 'header', required: 'true' }
		req.tokenDecode = jwt.verify(req.headers.authorization, process.env.JWT_SECRET);
		if (req.tokenDecode.role !== "admin") {
			// #swagger.responses[403] = { description: '토큰 권한이 admin이 아님' }
			return respMsg(resp,"token_permission")
		}
		return next();
	} catch (error) {
		if (error.name === "TokenExpiredError") {
			// #swagger.responses[420] = { description: '토큰 만료' }
			return respMsg(resp,"token_expire")
		} else {
			// #swagger.responses[401] = { description: '유효하지 않은 토큰' }
			return respMsg(resp,"token_invalid")
		}
	}
};

exports.verifyTokenRole = (role) => (req, resp, next) => {
	try {
		//  #swagger.parameters['authorization'] = { description: 'JWT 토큰 - 권한체크 있음', in: 'header', required: 'true' }
		req.tokenDecode = jwt.verify(req.headers.authorization, process.env.JWT_SECRET);
		if (req.tokenDecode.role !== role) {
			// #swagger.responses[403] = { description: '토큰의 권한이 접근가능한 api가 아님' }
			return respMsg(resp, "token_permission", ` - ${role}`);
		}
		return next();
	} catch (error) {
		if (error.name === "TokenExpiredError") {
			// #swagger.responses[420] = { description: '토큰 만료' }
			return respMsg(resp, "token_expire");
		} else {
			// #swagger.responses[401] = { description: '유효하지 않은 토큰' }
			return respMsg(resp, "token_invalid");
		}
	}
};

exports.verifyTokenRoleLawer = (req, resp, next) => {
	try {
		//  #swagger.parameters['authorization'] = { description: 'JWT 토큰 - 권한체크 있음', in: 'header', required: 'true' }
		req.tokenDecode = jwt.verify(req.headers.authorization, process.env.JWT_SECRET);
		if (req.tokenDecode.role !== "user" || req.tokenDecode.level < 20 || 39 < req.tokenDecode.level) {
			// #swagger.responses[403] = { description: '토큰의 권한이 접근가능한 api가 아님' }
			return respMsg(resp, "token_permission", ` - lawer`);
		}
		return next();
	} catch (error) {
		if (error.name === "TokenExpiredError") {
			// #swagger.responses[420] = { description: '토큰 만료' }
			return respMsg(resp, "token_expire");
		} else {
			// #swagger.responses[401] = { description: '유효하지 않은 토큰' }
			return respMsg(resp, "token_invalid");
		}
	}
};