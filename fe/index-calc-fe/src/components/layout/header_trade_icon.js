import React from "react";

const Trade_Icon = () => {
  return (
    <>
      <li className="ico add">
        <a>
          <i className="material-symbols-rounded">backup_table</i>
        </a>
        <ul>
          <div className="thbit-layout-set">
            <span className="title">거래화면 레이아웃</span>
            <div className="container">
              <span className="item on" data-layout-set="side-right">
                <i className="thbit-img">
                  <img src="/images/icon/layout-side-right.svg" />
                </i>
              </span>
              {/* <span className="item" data-layout-set="bottom-center">
                <i className="thbit-img">
                <img src="/images/icon/layout-bottom-center.svg" />
                </i>
              </span> */}
              <span className="item" data-layout-set="side-left">
                <i className="thbit-img">
                  <img src="/images/icon/layout-side-left.svg" />
                </i>
              </span>
              <span className="item" data-layout-set="bottom-side">
                <i className="thbit-img">
                  <img src="/images/icon/layout-bottom-side.svg" />
                </i>
              </span>
            </div>
          </div>
        </ul>
      </li>
    </>
  );
};

export default Trade_Icon;
