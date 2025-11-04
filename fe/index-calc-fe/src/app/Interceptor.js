import axios from "axios";
import React, { useEffect } from "react";
import { useDispatch } from "react-redux";

const Interceptor = ({ children }) => {
	const dispatch = useDispatch();
	useEffect(() => {
		axios.interceptors.request.use(
			(reqConfig) => {

				const rememberLogin = localStorage.getItem("storedLogin");
				const sessionLogin = sessionStorage.getItem("user");
				let username;
				let jwt;
				if (rememberLogin) {
					const parseRemember = JSON.parse(rememberLogin);
					username = parseRemember.username;
					jwt = parseRemember.jwt;
				} else if (sessionLogin) {
					const parseRemember = JSON.parse(sessionLogin);
					username = parseRemember.username;
					jwt = sessionStorage.getItem("jwt");
				}
				//if (username) 
				{
					reqConfig.headers = { ...reqConfig.headers, "X-USER-ID": username, "X-AUTH-TOKEN": jwt, "token" : "123456", "mac" : "123456", "ip" : "123456" };
				}
				return reqConfig;
			},
			(error) => {
				console.log("axios interceptor error", error);
				Promise.reject(error);
			},
		);
		axios.interceptors.response.use(
			(respConfig) => {
				return respConfig;
			},
			(error) => {
				if (error.response) {
					if (error.response.status === 405) {
						dispatch({
							type: "user/logout",
						});
					}
				}
				return Promise.reject(error);
			},
		);
	}, []);

	return children;
};

export default Interceptor;
