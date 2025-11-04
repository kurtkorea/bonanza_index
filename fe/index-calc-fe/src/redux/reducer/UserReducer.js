import { produce } from "immer";

const initState = sessionStorage.getItem("user")
	? JSON.parse(sessionStorage.getItem("user"))
	: localStorage.getItem("storedLogin")
	? {
			login: false,
			loading: false,
			username: "",
			password: "",
			broker_id: "",
			account: "",
			ip: "",
			...JSON.parse(localStorage.getItem("storedLogin")),
	  }
	: {
			login: false,
			loading: false,
			username: "",
			password: "",
			broker_id: "",
			account: "",			
			ip: "",
	  };

export default (state = initState, { type, payload }) => {
	switch (type) {
		case "user/login":
			return {
				...state,
				loading: true,
			};
		case "user/login/failure":
			return {
				...state,
				loading: false,
			};
		case "user/login/success": {
			const nextState = produce(state, (draft) => {
				draft.login = true;
				draft.loading = false;
				draft.username = payload.username;
				draft.password = payload.password;
				draft.broker_id = payload.broker_id;
				draft.account = payload.account;
				draft.ip = payload.ip;
			});
			sessionStorage.setItem("user", JSON.stringify(nextState));
			return nextState;
		}
		case "user/login/change_password": {
			const nextState = produce(state, (draft) => {
				draft.login = true;
				draft.loading = false;
				draft.username = payload.username;
				draft.password = payload.password;
			});
			sessionStorage.setItem("user", JSON.stringify(nextState));
			return nextState;
		}
		case "user/logout": {
			let nextState = produce(state, (draft) => {
				draft.login = false;
				draft.username = "";
				draft.password = "";
				draft.ip = "";
				draft.level = 0;
			});
			sessionStorage.removeItem("user");
			return nextState;
		}
		default:
			return state;
	}
};
