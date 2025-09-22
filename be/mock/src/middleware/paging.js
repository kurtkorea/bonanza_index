exports.prePaging =
	(defaultSort = "time", defaultOrder = "desc", defaultSize = 10) =>
	(req, resp, next) => {
		req.page = parseInt(req.query.page ?? 1);
		req.size = parseInt(req.query.size ?? defaultSize);
		req.order = req.query.order ?? defaultOrder;
		req.sort = req.query.sort ?? defaultSort;
		if (req.page < 1) {
			return resp.status(400).json({ message: "page 요청 오류" });
		}
		if (req.size < 1) {
			return resp.status(400).json({ message: "size 요청 오류" });
		}
		next();
	};
const preStringDateOption = { field: "query", latest: false };

exports.preStringDate =
	(fieldName, option = preStringDateOption) =>
	(req, resp, next) => {
		const nextOption = { ...preStringDateOption, ...option };
		if(req[nextOption.field][fieldName]){
			try {
				req[fieldName] = new Date(new Date(req[nextOption.field][fieldName]).setHours(nextOption.latest ? 24 : 0, 0, 0, 0));
			} catch (error) {
				return resp.status(400).json({ message: `${fieldName} 날짜 형식 변환 오류` });
			}
		}
		next();
	};
