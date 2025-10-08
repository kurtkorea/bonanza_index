import { message, Modal } from "antd";
import axios from "axios";
import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Countdown from "antd/lib/statistic/Countdown";
import moment from "moment";
import queryString from "query-string";

const checkMailFormat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

const SignupForm = () => {
  const location = useLocation();

  const { recommender } = queryString.parse(location.search);

  const [reff_id, set_reff_id] = useState("");
  const [SMSAuth, setSMSAuth] = useState(false);
  const [MobileNo, setMobileNo] = useState("");
  const [SMS_Text, setSMS_Text] = useState("");
  const [SMS_LimitTime, setSMS_LimitTime] = useState(moment());
  const [SMSAuthComplete, setSMSAuthComplete] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);

  const onSubmitCatch = (e) => {
    e.preventDefault();
    const form = e.target;
    if (!form.username.value.match(checkMailFormat)) {
      message.warn("You have entered an invalid ID email address");
      return;
    }
    if (form.password.value.length < 6) {
      message.warn("Password is too short. It must be 6 more length.");
      return;
    }
    if (form.confirm.value !== form.password.value) {
      message.warn("Between input password and confirm password are not same. Check your passwor again.");
      return;
    }

    if (!SMSAuthComplete) {
      message.warn("Please check SMS authentication.");
      return;
    }

    axios
      .post(process.env.ORDERSERVERURL + "/MemberJoin", {
        id: form.username.value.trim(),
        password: form.password.value,
        name: form.name.value.trim(),
        mobile: MobileNo,
        recommender: form.recommend.value,
        bank: "",
        bankAccount: "",
        bankOwner: "",
        EMAIL: "",
        BIRTHDAY: "",
        recommenderType: "code",
        clientleveltypeid: "1",
      })
      .then(({ data }) => {
        if (data.result === "true") {
          message.success(data.message);
          setShowMemberModal(true);
        } else {
          message.error(data.message);
        }
      });
  };

  const onReqSMSAuth = async () => {
    try {
      var regPhone = /^01([0|1|6|7|8|9])-?([0-9]{3,4})-?([0-9]{4})$/;
      if (regPhone.test(MobileNo) === true) {
        const { data } = await axios.get(process.env.ORDERSERVERURL + "/auth_sms", {
          params: {
            mobile: MobileNo,
          },
        });
        if (data.result === "check_sms") {
          message.warn("Authentication SMS is still processing. Input authentication number in SMS.");
          setSMSAuth(true);
          setSMS_LimitTime(moment(data.verifyAt));
        } else if (data.result === "true") {
          message.warn("Input authentication number in SMS.");
          setSMSAuth(true);
          setSMS_LimitTime(moment(data.verifyAt));
        } else if (data.result === "false") {
          message("api확인");
          // message.warn(data.message);
        }
      } else {
        message.warn("It is not type of mobile phone number");
      }
    } catch (error) {
      console.log("onConfirmAccountAuth error", error);
    }
  };

  const onConfirmSMSAuth = async () => {
    try {
      const { data } = await axios.get(process.env.ORDERSERVERURL + "/check_auth_sms", {
        params: {
          mobile: MobileNo,
          verify_code: SMS_Text,
        },
      });
      if (data.result === "true") {
        message.warn(data.message);
        setSMSAuthComplete(true);
      } else if (data.result === "false") {
        message.warn(data.message);
        setSMSAuthComplete(false);
      }
    } catch (error) {
      console.log("onConfirmAccountAuth error", error);
    }
  };

  const IdOnChange = (e) => {
    const currentId = e.target.value;
    var regExp = /[ \{\}\[\]\/?,;:|\)*~`!^\-_+┼<>\#$%&\'\"\\\(\=]/gi;

    console.log(e.currentTarget.value);
    if (regExp.test(e.currentTarget.value)) {
      alert("Special characters cannot be entered.");
      e.currentTarget.value = e.currentTarget.value.substring(0, e.currentTarget.value.length - 1); // 입력한 특수문자 한자리 지움
    }
    if (e.currentTarget.value.substring(0, 1) == "0") {
      alert("The 0 characters cannot be entered.");
      e.currentTarget.value = e.currentTarget.value.substring(0, e.currentTarget.value.length - 1); // 입력한 특수문자 한자리 지움
    }
  };

  const NameOnChange = (e) => {
    const currentId = e.target.value;
    var regExp = /[ \{\}\[\]\/?.,;:|\)*~`!^\-_+┼<>@\#$%&\'\"\\\(\=]/gi;

    console.log(e.currentTarget.value);
    if (regExp.test(e.currentTarget.value)) {
      alert("Special characters cannot be entered.");
      e.currentTarget.value = e.currentTarget.value.substring(0, e.currentTarget.value.length - 1); // 입력한 특수문자 한자리 지움
    }
  };

  useEffect(() => {
    if (location.search === "") {
      let reff_id = sessionStorage.getItem("reff_id");

      set_reff_id(reff_id);
    } else {
      if (recommender != "") {
        sessionStorage.setItem("reff_id", recommender);
        set_reff_id(recommender);
      } else {
        let reff_id = sessionStorage.getItem("reff_id");

        if (reff_id) {
          set_reff_id(reff_id);
        }
      }
    }
  }, []);

  useEffect(() => {
    $(".thbit-form .func-passtype").on("click", function (e) {
      if ($(this).hasClass("fa-eye")) {
        $(this).parent(".fld").find(".inp").attr("type", "text");
        $(this).removeClass("fa-eye");
        $(this).addClass("fa-eye-slash");
        $(this).find(".tip").text("Hide Password");
      } else {
        $(this).parent(".fld").find(".inp").attr("type", "password");
        $(this).removeClass("fa-eye-slash");
        $(this).addClass("fa-eye");
        $(this).find(".tip").text("View Password");
      }
    });
  }, []);

  return (
    <>
      <Modal open={showMemberModal} title={null} footer={null} closable={false} centered={true} maskClosable={false} className={"member-modal"}>
        <div className="popup pop-member">
          <div className="popup-head"></div>
          <div className="popup-body">
            {/* <div className="logo-bx">
							<img src="/assets/images/icon/pop-logo.png" alt="" />
						</div> */}
            <div className="text-center">
              <p className="common-title--50 font-weight-black text-black letter-spacing--n50">THANK YOU!</p>
              <p className="common-text--18 letter-spacing--n25 text-black mt-3">You can use the platform from now on!</p>
            </div>
            <div className="thbit-form thbit-form-register">
              <button type="button" className="fld full on">
                <Link to="/login">Go Login Page</Link>
              </button>
            </div>
          </div>
        </div>
      </Modal>
      <div className="form-main">
        <div className="thbit-form thbit-form-register">
          <h2 className="thbit-section-title">
            <strong>회원가입</strong>
          </h2>
          {/* <p className="txt-main">Enter basic information</p> */}
          <form onSubmit={onSubmitCatch}>
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
                  placeholder="이메일을 입력하세요."
                  className="inp"
                  onChange={IdOnChange}
                />
                <label htmlFor="label_username" className="label">
                  EMAIL
                </label>
              </span>
            </div>
            <div className="row">
              <span className="fld full">
                <input
                  type="text"
                  name="name"
                  id="label_name"
                  minLength="3"
                  maxLength="35"
                  required
                  autoComplete="off"
                  placeholder="이름을 입력하세요."
                  className="inp"
                  onChange={NameOnChange}
                />
                <label htmlFor="label_name" className="label">
                  이름
                </label>
              </span>
            </div>
            <div className="row">
              <span className="fld full">
                <input
                  type="password"
                  name="password"
                  minLength="3"
                  maxLength="35"
                  id="label_password"
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
              <span className="fld full">
                <input
                  type="password"
                  name="confirm"
                  minLength="3"
                  maxLength="35"
                  id="label_confirm"
                  required
                  autoComplete="off"
                  placeholder="확인 비밀번호를 입력하세요."
                  className="inp"
                />
                <label htmlFor="label_confirm" className="label">
                비밀번호 확인
                </label>
                <i className="ic-btn func-passtype fa-solid fa-eye thbit-tooltip">
                  <span className="tip">View Password</span>
                </i>
              </span>
            </div>
            <div className="row">
              <span className="fld full">
                <input
                  type="text"
                  name="recommend"
                  minLength="3"
                  maxLength="35"
                  id="label_recommend"
                  required
                  autoComplete="off"
                  placeholder="추천인을 입력하세요."
                  className="inp"
                  defaultValue={""}
                  readOnly={reff_id ? true : false}
                />
                <label htmlFor="label_recommend" className="label">
                  추천코드
                </label>
              </span>
            </div>
            {/* {SMSAuthComplete ? (
              <div className="row">
                <span className="fld full">
                  <label className="label">SMS Authentication Success</label>
                </span>
              </div>
            ) : (
              <>
                <div className="row">
                  <span className="fld full thbit-tooltip">
                    <input
                      type="text"
                      name="sms_auth"
                      minLength="3"
                      maxLength="35"
                      id="label_sms_authd"
                      required
                      autoComplete="off"
                      placeholder="Enter your phone number"
                      className="inp"
                      onChange={({ target: { value } }) => setMobileNo(value)}
                      readOnly={SMSAuthComplete || SMSAuth}
                    />
                    <label htmlFor="label_sms_authd" className="label">
                      SMS authentication
                    </label>
                    <span className="tip">
                      Please click <b>SEND</b> after enter your phone number
                    </span>
                  </span>
                </div>
                {SMSAuth ? (
                  <>
                    <br />
                    <Countdown title="Remaining time." value={SMS_LimitTime} format="mm:ss" />
                    <div className="row is-link">
                      <span className="fld full thbit-tooltip">
                        <input
                          type="text"
                          name="label_sms_authd_code"
                          autoComplete="off"
                          maxLength="6"
                          onChange={({ target: { value } }) => setSMS_Text(value)}
                          placeholder="Enter Phone Auth Code"
                          className="inp"
                        />
                        <label htmlFor="label_sms_authd_code" className="label">
                          Authentication Code
                        </label>
                      </span>
                      <a className="link" onClick={onConfirmSMSAuth}>
                        <u>Check</u>
                      </a>
                    </div>
                  </>
                ) : (
                  <>
                    <br />
                    <button type="button" onClick={onReqSMSAuth} className="fld full on">
                      SEND
                    </button>
                  </>
                )}
              </>
            )} */}

            <div className="row">
              <button type="submit" className="fld half on">
                회원가입
              </button>
              <Link to="/" className="fld half">
                취소
              </Link>
            </div>
          </form>

          <div className="foot align-c">
            <p className="txt-main">
              이미 회원가입을 하셨나요?{" "}
              <Link to="/login">
                <u>로그인</u>
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default SignupForm;
