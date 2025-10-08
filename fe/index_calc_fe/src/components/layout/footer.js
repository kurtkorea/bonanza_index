import { message } from "antd";
import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import NoticeModal from "../noticemodal";

const Footer = () => {
  const login = useSelector((store) => store.UserReducer.login);

  const onClicknotice = () => {
    if (!login) {
      message.warn("please login");
      return;
    } else {
      ShowModal();
    }
  };

  const onClickChat = () => {
    if (!login) {
      message.warn("please login");
      return;
    } else {
      ShowModal();
    }
  };

  const ShowModal = () => {
    /* 모달 */
    if ($("*").is("[data-modal]")) {
      $(document).on("click", "[data-modal]", function (e) {
        $("body").addClass("no-overflow");
        var modal = $(this).data("modal");
        $(".thbit-modal." + modal)
          .parent(".thbit-modal-wrapper")
          .addClass("open");
        $(".thbit-modal." + modal).addClass("open");
      });
      $("[data-modal-close]").on("click", function (e) {
        $("body").removeClass("no-overflow");
        $(".thbit-modal").removeClass("open");
        $(".thbit-modal-wrapper").removeClass("open");
      });
      $(document).on("click", ".thbit-modal-wrapper", function (e) {
        if (!$(e.target).closest(".thbit-modal").length > 0) {
          $("body").removeClass("no-overflow");
          $(".thbit-modal").removeClass("open");
          $(".thbit-modal-wrapper").removeClass("open");
        }
      });
      $(document).keyup(function (e) {
        if (e.keyCode === 27) {
          $("body").removeClass("no-overflow");
          $(".thbit-modal").removeClass("open");
          $(".thbit-modal-wrapper").removeClass("open");
        }
      });
    }
    /* 모달 */
  };

  return (
    <>
      <footer className="thbit-footer">
        <div className="thbit-wrapper">
          <div className="thbit-inner">
            <div className="footer-main">
              <nav className="fnb">
                <ul>
                  <li>
                    <a href="#">서비스</a>
                    <ul>
                      <li>
                        {/* <Link to="/market">Market</Link> */}
                      </li>
                      <li>
                        <Link to="/trade">거래</Link>
                      </li>
                      <li>
                        <Link to="/trade">오버나잇</Link>
                      </li>                      
                    </ul>
                  </li>
                  <li>
                    <a>지원</a>
                    <ul>
                      {/* <li>
                        <Link to="/notice">Notice</Link>
                      </li> */}
                      <li>
                        <a data-modal="modal-notice" onClick={() => onClicknotice()}>
                          공지사항
                        </a>
                      </li>
                      <li>
                        {/* <Chat showlabel="HELP" /> */}
                        {/* <a data-modal="modal-chat" onClick={() => onClickChat()}>
                          Help
                        </a> */}
                      </li>
                    </ul>
                  </li>
                  <li>
                    <a href="legal-terms">입출금</a>
                    <ul>
                      {/* <li>
                        <Link to="/wallet">Wallet Overview</Link>
                      </li> */}
                      <li>
                        <Link to="/wallet/deposit">입금</Link>
                      </li>
                      <li>
                        <Link to="/wallet/withdraw">출금</Link>
                      </li>
                      {/* <li>
                        <Link to="/wallet/exchange">Exchange</Link>
                      </li>
                      <li>
                        <Link to="/wallet/p2p">P2P</Link>
                      </li> */}
                    </ul>
                  </li>
                  {/* <li>
                    <Link to="/legal/terms">이용약관</Link>
                    <ul>
                      <li>
                        <Link to="/legal/terms">운영정책</Link>
                      </li>
                      <li>
                        <Link to="/legal/privacy">개인정보</Link>
                      </li>
                    </ul>
                  </li> */}
                </ul>
              </nav>
              <div className="logos">
                <a href="./" className="footer-logo">
                  <span className="thbit-img">
                    {/* <img src="/images/common/logo.jpg" alt="TheBit - Bitcoin Margin Exchange" /> */}
                  </span>
                </a>
                <div className="company-info">


                  {/* <a href="mailto:aa@thebit.ddd" className="inb">
                    <i className="fa-regular fa-envelope"></i> Support
                  </a> */}
                  {/* <a href="mailto:aa@thebit.ddd" className="inb">
                    Support
                  </a> */}

                  {/* <div className="thbit-dropdown">
                    <span className="trigger">
                      <i className="fa-solid fa-arrow-up-right-from-square"></i> 바로가기
                    </span>
                    <div className="dropdown">
                      <a href="#" target="_blank" className="p">
                        비트코인
                      </a>
                      <a href="#" target="_blank" className="p">
                        이더리움
                      </a>
                    </div>
                  </div> */}
                </div>
              </div>
            </div>
            <div className="info">
              <div className="dic">
                {/* <p>가상자산은 고위험 상품으로써 투자금의 전부 또는 일부 손실을 초래 할 수 있습니다.</p> */}

                <p>Copyright ⓒ X-TRADER. All Right Reserved.</p>
              </div>

              {/* <nav className="thbit-sns-ico">
                <ul>
                  <li>
                    <a href="#" className="thbit-tooltip">
                      <span className="tip">Telegram</span>
                      <i className="fa-brands fa-telegram"></i>
                    </a>
                  </li>
                  <li>
                    <a href="#" className="thbit-tooltip">
                      <span className="tip">Youtube</span>
                      <i className="fa-brands fa-youtube"></i>
                    </a>
                  </li>
                  <li>
                    <a href="#" className="thbit-tooltip">
                      <span className="tip">Facebook</span>
                      <i className="fa-brands fa-facebook-f"></i>
                    </a>
                  </li>
                  <li>
                    <a href="#" className="thbit-tooltip">
                      <span className="tip">
                        Twitter
                        <br />
                        facebook
                      </span>
                      <i className="fa-brands fa-twitter"></i>
                    </a>
                  </li>
                  <li>
                    <a href="#" className="thbit-tooltip">
                      <span className="tip">Instagram</span>
                      <i className="fa-brands fa-instagram"></i>
                    </a>
                  </li>
                </ul>
              </nav> */}
            </div>
          </div>
        </div>
      </footer>
      <NoticeModal />
    </>
  );
};

export default Footer;
