exports.getIp = (req, resp, next) => {
	try {
		let ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
		if (ip.substr(0, 7) == "::ffff:") {
			ip = ip.substr(7);
		}
		req.getip = ip;
	} catch (error) {
		req.getip = "0.0.0.0";
	}
	next();
};