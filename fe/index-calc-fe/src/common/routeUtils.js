import React, { useCallback, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

// export const PrivateRoute = ({ componentPath = "", auth = false, to = "/login" }) => {
// 	const params = useParams();
// 	const LazyComponent = lazy(() => import(`../pages${componentPath + (params["*"] !== "" && "/" + params["*"])}`))
// 		.then((module) => module.default)
// 		.catch((e) => {
// 			if (/not find module/.test(e.message)) {
// 				return import("../pages" + "/missing").then((module) => module.default);
// 			}
// 			throw e;
// 		});
// 	return auth ? (
// 		<Suspense fallback={<LoadingPage />}>
// 			<LazyComponent />
// 		</Suspense>
// 	) : (
// 		<Navigate replace to={to} />
// 	);
// };

const AsyncComponent = (props) => {
	const [Component, setComponent] = useState(null);

	useEffect(() => {
		let cleanedUp = false;
		props.component
			.then((component) => {
				if (cleanedUp) {
					return;
				}
				setComponent(() => component);
			})
			.catch((e) => {
				if (!cleanedUp) {
					setComponent(null);
				}
				throw e;
			});
		return () => {
			setComponent(null);
			cleanedUp = true;
		};
	}, [props.path]);
	return Component ? React.createElement(Component) : props.loading;
};

export const DynamicRoute = (props) => {
	const location = useLocation();
	const getPage = useCallback(
		(path) =>
			import("../pages" + path)
				.then((module) => module.default)
				.catch((e) => {
					if (/not find module/.test(e.message)) {
						return import("../pages" + "/missing").then((module) => module.default);
					}
					throw e;
				}),
		[],
	);
	if (!(props.auth ?? true)) {
		return <Navigate replace to={props.redirect ?? "/"} />;
	}
	return <AsyncComponent path={location.pathname} component={getPage(location.pathname)} loading={<LoadingPage />} />;
};

export const LoadingPage = () => {
	return <div className="loading" />;
};
