import { message } from "antd";
import React, { useEffect } from "react";
import { useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import validator from "validator";

const LoginForm = ({ setForgot }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const onSubmitCatch = async (e) => {

    console.log ( "TRY LOGIN");

    e.preventDefault();
    if (validation(e)) {
      dispatch({
        type: "user/login",
        payload: {
          username: e.target.username.value,
          password: e.target.password.value,
          remember: false,
          // navigate: navigate,
        },
      });
    }
  };

  const validation = (e) => {
    if (validator.isEmpty(e.target.username.value)) {
      message.warn("아이디가 입력되지 않았습니다.");
      return false;
    }
    if (validator.isEmpty(e.target.password.value)) {
      message.warn("비밀번호가 입력되지 않았습니다.");
      return false;
    }
    return true;
  };

  return (
    <div className="form-main">
      <div className="thbit-form thbit-form-login">        
        <h2 className="thbit-section-title">
          <strong>로그인</strong>
        </h2>
        <form onSubmit={onSubmitCatch} autoComplete="off" className="form">
          <div className="row">
            <span className="fld full">
              <input
                type="text"
                name="username"
                id="label_username"
                minLength="3"
                maxLength="35"
                required
                autoComplete="off"
                placeholder="아이디를 입력하세요."
                className="inp"
              />
              <label htmlFor="label_username" className="label">
                사용자아이디
              </label>
            </span>
          </div>
          <div className="row">
            <span className="fld full">
              <input
                type="password"
                name="password"
                id="label_password"
                minLength="3"
                maxLength="35"
                required
                autoComplete="off"
                placeholder="비밀번호를 입력하세요."
                className="inp"
              />
              <label htmlFor="label_password" className="label">
                비밀번호
              </label>
              <i className="ic-btn func-passtype fa-solid fa-eye thbit-tooltip">
                <span className="tip">View Password</span>
              </i>
            </span>
          </div>
          <div className="row">
            {/* <Link to="/forgot" className="txt-main">
              <u>Forgot your password?</u>
            </Link> */}
            {/* <a onClick={() => setForgot(true)} className="txt-main">
              <u>Forgot your password?</u>
            </a> */}
          </div>
          <div className="row">
            <button type="submit" className="fld full on">
              로그인
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginForm;
