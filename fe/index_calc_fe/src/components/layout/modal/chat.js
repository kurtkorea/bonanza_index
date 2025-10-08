import { LoadingOutlined } from "@ant-design/icons";
import { DraggableModal } from "ant-design-draggable-modal";
import axios from "axios";
import moment from "moment";
import { Spin, message } from "antd";
import React, { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import "./chat-style.less";
import common from "../../../common";

const antIcon = <LoadingOutlined style={{ fontSize: 56 }} spin />;

const Chat = ({ showlabel }) => {
  const login = useSelector((state) => state.UserReducer.login);
  const username = useSelector((state) => state.UserReducer.username);
  const chatList = useSelector((state) => state.ChatReducer.chatList);
  const chatEnable = useSelector((state) => state.ChatReducer.chatEnable);
  const chatRequest = useSelector((state) => state.ChatReducer.chatRequest);
  const chatManager = useSelector((state) => state.ChatReducer.chatManager);
  const chatUUID = useSelector((state) => state.ChatReducer.chatUUID);
  const dispatch = useDispatch();
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  const onOk = () => {
    if (!login) {
      message.warn("Please Login");
      return;
    }
    setVisible(true);
  };
  const onCancel = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (chatList.length !== 0) {
      if (!ready) {
        setReady(true);
      }
      // if (chatList[chatList.length - 1].id_from === username && document.querySelector(".chat-list")) {
      //   document.querySelector(".chat-list").scrollTo(0, document.querySelector("#chatList").scrollHeight);
      // }
      document.querySelector(".chat-list")?.scrollTo(0, document.querySelector("#chatList").scrollHeight);
    }
  }, [chatList.length]);

  useEffect(() => {
    if (ready && document.querySelector(".chat-list")) {
      document.querySelector(".chat-list")?.scrollTo(0, document.querySelector("#chatList").scrollHeight);
    }
  }, [ready]);

  const sendChat = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (login) {
      try {
        await axios.get(process.env.CHATSERVERURL + "/v1/chatting/push_chat", {
          params: {
            id_from: username,
            id_to: chatManager,
            msg: form.message.value,
            uuid: chatUUID,
            type: "chat",
          },
        });
        form.message.value = "";
      } catch (error) {
        message.error(error.message);
      }
    }
  };

  const requestChat = async (e) => {
    e.preventDefault();
    if (login) {
      const chatUUID = common.makeGuid();
      const { data } = await axios.post(process.env.CHATSERVERURL + "/v1/chatting/startUserChat", {
        user_id: username,
        uuid: chatUUID,
      });
      if (data.result == true) {
        dispatch({ type: "chat/request", payload: chatUUID });
      }
    }
  };

  const requestCancelChat = async (e) => {
    dispatch({ type: "chat/reset", payload: "" });
  };

  return (
    <>
      <a onClick={onOk}>{showlabel}</a>
      <DraggableModal
        open={visible}
        onOk={onOk}
        onCancel={onCancel}
        className="custom-modal thbit-modal modal-chat modal-mobile-full"
        initialWidth={400}
        initialHeight={600}
        closeIcon={
          <a className="close">
            <strong>Close</strong>
          </a>
        }
        footer={null}
        title={
          <div className="modal-head">
            <h2 className="title">CHATTING</h2>
          </div>
        }
      >
        <div className="thbit-chat">
          <div className="chat-content thbit-scroll-content cust-scrollbar chat-list" id="chatList">
            {chatList.map((item) => (
              <ChatBubble {...item} username={username} key={item.msg_id} />
            ))}
          </div>
          <form onSubmit={sendChat}>
            <div className="chat-input">
              <textarea className="inp" name="message" placeholder="Write a message..."></textarea>
              <button type="submit" className="btn">
                SEND
              </button>
            </div>
          </form>
          <div className={"chat-cover" + (chatEnable ? "" : " on")}>
            {chatRequest ? (
              <div className="waiting_box">
                <Spin className="chat-request-spin" indicator={antIcon} />

                <button className="btn blue chat-request-btn cancel_btn" onClick={requestCancelChat}>
                  {"취 소"}
                </button>
              </div>
            ) : (
              <button className="btn blue chat-request-btn" onClick={requestChat}>
                REQUEST CHAT
              </button>
            )}
          </div>
        </div>
      </DraggableModal>
    </>
  );
};

const ChatBubble = (props) => {
  if (props.id_from === props.username) {
    return (
      <div className="chat-message me">
        <span className="name">{props.id_from}</span>
        <div className="message">
          <span className="bub">{props.msg}</span>
        </div>
        <span className="time">{moment(props.time_stamp).format("MM-DD HH:mm")}</span>
      </div>
    );
  } else {
    return (
      <div className="chat-message other">
        <i className="thbit-img avatar">
          <img src="/images/element/avatar01.png" />
        </i>
        <span className="name">Manager</span>
        <div className="message">
          <span className="bub">{props.msg}</span>
        </div>
        <span className="time">{moment(props.time_stamp).format("MM-DD HH:mm")}</span>
      </div>
    );
  }
};

export default Chat;
