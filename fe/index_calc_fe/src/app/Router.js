import React from "react";
import { useSelector } from "react-redux";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DynamicRoute } from "../common/routeUtils";
import SliderOption from "../common/sliderOption";

const Router = () => {
	const login = useSelector((store) => store.UserReducer.login);
	SliderOption();

	return (
		<BrowserRouter>
			<Routes>
				{/* <Route path="/chart/*" element={<HTSChartPage />} /> */}
				{/* <Route path="/wallet/*" element={<DynamicRoute redirect="/login" auth={login} />} /> */}
				{/* <Route path="/account/*" element={<DynamicRoute redirect="/login" auth={login} />} /> */}
				{/* <Route path="/copy/trader/:id" element={<CopyTrader />} /> */}
				{/* <Route path="/copy/follow/:id" element={<FollowPage />} /> */}
				{/* <Route path="/copy/*" element={<DynamicRoute redirect="/login" auth={login} />} /> */}
				<Route path="/" element={<DynamicRoute path="/trade" />} />
				<Route path="/trade" element={<DynamicRoute path="/trade" />} />
				{/* <Route path="/notice" element={<DynamicRoute redirect="/login" auth={login} />} /> */}
				{/* <Route path="/agree/:recommender" element={<AgreePage />} /> */}
				<Route path="/*" element={<DynamicRoute redirect="/trade" />} />				
			</Routes>
		</BrowserRouter>
	);
};

export default Router;
