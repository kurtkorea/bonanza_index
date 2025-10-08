import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const makeParams = (params = {}) => new URLSearchParams(params).toString().replace(/%2C/g, ",");

export const makeEndpoint = (endPoint = "", params = {}, filter = [undefined, null, ""]) => {
	const nextParams = {};
	for (const [key, value] of Object.entries(params)) {
		!filter.includes(value) && (nextParams[key] = value);
	}
	return endPoint + "?" + makeParams(nextParams);
};

//queryState hook
export const useQueryState = (name = "", defaultValue = null, related = [], clear = false) => {
	const history = useNavigate();
	// get search params
	const query = new URLSearchParams(location.search.replace(/\?/g, ""));

	useEffect(() => {
		if (clear) {
			return setClear;
		}
	}, []);

	const setState = (value) => {
		const nextParams = {};
		const query = new URLSearchParams(location.search.replace(/\?/g, ""));
		related.forEach((relay) => query.get(relay) && (nextParams[relay] = query.get(relay)));
		value && (nextParams[name] = value);
		history(`?${makeParams(nextParams)}`);
	};

	const setOnly = useCallback((value) => {
		const nextParams = {};
		value && (nextParams[name] = value);
		history(`?${makeParams(nextParams)}`);
	}, []);

	const setOverride = (value, override) => {
		const nextParams = {};
		const query = new URLSearchParams(location.search.replace(/\?/g, ""));
		related.forEach((relay) => query.get(relay) && (nextParams[relay] = query.get(relay)));
		value && (nextParams[name] = value);
		Object.assign(nextParams, override);
		history(`?${makeParams(nextParams)}`);
	};

	const setClear = useCallback(() => {
		const nextParams = {};
		const query = new URLSearchParams(location.search.replace(/\?/g, ""));
		related.forEach((relay) => query.get(relay) && (nextParams[relay] = query.get(relay)));
		if (nextParams.hasOwnProperty(name)) {
			delete nextParams[name];
		}
		history(`?${makeParams(nextParams)}`, { replace: true });
	});

	return [query.get(name) ?? defaultValue, setState, setOnly, setOverride];
};

export const setQueryData = (name = "", related = []) => {
	const history = useNavigate();

	const setState = (value) => {
		const nextParams = {};
		const query = new URLSearchParams(location.search.replace(/\?/g, ""));
		related.forEach((relay) => query.get(relay) && (nextParams[relay] = query.get(relay)));
		value && (nextParams[name] = value);
		history(`?${makeParams(nextParams)}`);
	};

	const setClear = useCallback(() => {
		const nextParams = {};
		const query = new URLSearchParams(location.search.replace(/\?/g, ""));
		related.forEach((relay) => query.get(relay) && (nextParams[relay] = query.get(relay)));
		if (nextParams.hasOwnProperty(name)) {
			delete nextParams[name];
		}
		history(`?${makeParams(nextParams)}`, { replace: true });
	});

	return [setState, setClear];
};
