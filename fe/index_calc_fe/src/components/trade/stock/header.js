import axios from "axios";
import classNames from "classnames";
import React, { useEffect } from "react";
import { useQuery } from "react-query";
import { useSelector } from "react-redux";
import common from "../../../common";

const TradeHeader = ({title, is_button = true}) => {
  return (
    <>
      <div className="item-wrapper" style={{ marginTop: "5px" }}>
        <div style={{ display: "flex", alignItems: "center", height: "40px", width: "100%" }}>
          <div
            className="item-name"
            style={{
              width: "80%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "40px",
              textAlign: "left",
              fontSize: "18px",
              fontWeight: "bold",
            }}
          >
            {title}
          </div>
          { is_button == true && (
            <div className="thbit-trade-inlineform antd-style" style={{ display: "flex", alignItems: "center", height: "100%", justifyContent: "flex-end", width: "120px", marginRight: "10px" }}>
              <button type="button" className="btn" onClick={() => {}}>
                조회
              </button>
            </div>
          )}
        </div>
      </div>   

    </>
  );
};

export default TradeHeader;
