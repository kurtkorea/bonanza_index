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

// 페이지 경로 매핑 (Vite가 코드 스플리팅을 수행할 수 있도록)
const pageMap = {
	'/': () => import('../pages/index'),
	'/index': () => import('../pages/index'),
	'/trade': () => import('../pages/trade'),
	'/missing': () => import('../pages/missing'),
};

export const DynamicRoute = (props) => {
	const location = useLocation();
	const getPage = useCallback(
		(path) => {
			// 경로 정규화: /trade -> /trade, / -> /index
			const normalizedPath = path === '/' ? '/index' : path;
			console.log('[DynamicRoute] Importing page for path:', normalizedPath);
			
			// 경로 매핑에서 찾기
			const importFn = pageMap[normalizedPath];
			if (importFn) {
				return importFn()
					.then((module) => module.default)
					.catch((e) => {
						console.error('[DynamicRoute] Import failed:', normalizedPath, e);
						return import('../pages/missing').then((module) => module.default);
					});
			}
			
			// 매핑에 없는 경우 동적 import 시도
			// Vite가 변수를 사용한 동적 import를 분석할 수 없으므로 @vite-ignore 사용
			const importPath = `../pages${normalizedPath}`;
			console.log('[DynamicRoute] Dynamic import:', importPath);
			return import(/* @vite-ignore */ importPath)
				.then((module) => module.default)
				.catch((e) => {
					console.error('[DynamicRoute] Import failed:', importPath, e);
					if (/not find module|Cannot find module|Failed to fetch/.test(e.message)) {
						return import('../pages/missing').then((module) => module.default);
					}
					throw e;
				});
		},
		[],
	);
	if (!(props.auth ?? true)) {
		return <Navigate replace to={props.redirect ?? "/"} />;
	}
	// props.path가 있으면 사용하고, 없으면 location.pathname 사용
	const routePath = props.path || location.pathname;
	return <AsyncComponent path={routePath} component={getPage(routePath)} loading={<LoadingPage />} />;
};

export const LoadingPage = () => {
	return <div className="loading" />;
};
