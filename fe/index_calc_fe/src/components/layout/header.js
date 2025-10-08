import React, { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { setQueryData } from "../../common/queryState";
import NoticeModal from "./modal/notice";
import { message, notification, Popconfirm } from "antd";

import common from "../../common";
import classNames from "classnames";
import Trade_Icon from "./header_trade_icon";
import Lang from "../lang";
import axios from "axios";
import { GlobalOutlined } from "@ant-design/icons";
import SymbolSetupModal from "../trade/stock/symbol_setup";

const Header = () => {
	const dispatch = useDispatch();
	const login = useSelector((store) => store.UserReducer.login);

	const [showNotice, setShowNotice] = useState(false);

	const navigate = useNavigate();

	const onClickLogout = useCallback(() => {
		dispatch({ type: "user/logout" }) 
		navigate("/");
	}, []);

	const onCloseNotice = useCallback(() => {
		setShowNotice(false);
	}, []);

	return (
		<>
			{/* <NoticeModal open={showNotice} onClose={onCloseNotice} /> */}
			<header className="thbit-header">
				<div className="thbit-wrapper">
					<div className="thbit-inner">
						<h1 className="header-logo">
							<Link to="/">
								<i className="logo">
									{/* <img src="/images/common/logo.jpg" alt="TheBit - Bitcoin Margin Exchange" /> */}
								</i>
							</Link>
						</h1>

						<div className="thbit-menu">
							<nav className="gnb">
	
							</nav>
							
							{/* <nav className="snb" style={{ marginRight: "120px" }}>
								<ul>
									<li className="line">
										<>
											<a onClick={() => setShowNotice(true)}>제외종목설정</a>
											{showNotice && (
												<SymbolSetupModal
													open={showNotice}
													onClose={onCloseNotice}
												/>
											)}
										</>
									</li>
								</ul>
							</nav>

							<nav className="snb">
								<ul>
									{login ? (
										<>
											<li className="line">
												<a onClick={onClickLogout}>로그아웃</a>
											</li>
										</>
									) : (
										<>
											<li className="line">
												<Link to="/">Login</Link>
											</li>
										</>
									)}
								</ul>
							</nav> */}
						</div>
					</div>
				</div>
				<i className="bar"></i>
			</header>
		</>
	);
};


export default Header;
