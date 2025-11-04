import React, { useEffect, useState } from "react";
import axios from "axios";
import { useQuery } from "react-query";
import { useSelector } from "react-redux";
import { useQueryState } from "../common/queryState";
import common from '../common';

const NoticeModal = () => {
  // const [openKey] = useQueryState("open", null, []);
  const login = useSelector((store) => store.UserReducer.login);

  const id = useSelector((store) => store.UserReducer.username);

  const { data, isFetching } = useQuery(
    "notice",
    async () => {
      const { data } = await axios.get("/mts/get_notice?" + "id=" + id );
      return data;
    },
    {
      staleTime: Infinity,
      cacheTime: Infinity,
      refetchOnMount: false,
      placeholderData: { datalist: [] },
      enabled: login,
      onSuccess: () => {
        console.log("완료");
      },
    }
  );

  useEffect(() => {
    noticeEffect();
  }, [isFetching]);

  const noticeEffect = () => {
    /* 공지 */
    $(".thbit-notice-list .notice-list .list-title").on("click", function (e) {
      $(this).parent(".notice-list").toggleClass("open");
      if ($(this).parent(".notice-list").hasClass("open")) {
        $(this).parent(".notice-list").find(".list-content").slideDown();
      } else {
        $(this).parent(".notice-list").find(".list-content").slideUp();
      }
    });
    $(document).on("click", "[data-article-pop]", function () {
      var articleNum = $(this).data("article-pop");
      var article = $('.thbit-notice-list .notice-list[data-article="' + articleNum + '"]');
      article.addClass("open");
      article.find(".list-content").slideDown();
      $(".thbit-notice-list .simplebar-content-wrapper").animate({ scrollTop: 0 }, 0);
      $(".thbit-notice-list .simplebar-content-wrapper").animate({ scrollTop: $(article).offset().top - 62 }, 1000);
    });
    /* 공지 */
  };

  return (
    <div className="thbit-modal-wrapper">
      <div className="thbit-modal modal-notice modal-mobile-full">
        <div className="modal-head">
          <h2 className="title">공지사항</h2>
        </div>

        <div className="thbit-notice-list thbit-scroll-content">
          {data?.datalist?.map((item, index) => (
            <div className="notice-list" data-article={index + 1} key={item.id}>
              <h2 className="list-title">{common.convertDateOnly(item.time) + " " + item.title}</h2>
              <div className="list-content">{item.body}</div>
            </div>
          ))}
        </div>

        <a data-modal-close className="close">
          <strong>Close</strong>
        </a>
      </div>
    </div>
  );
};

export default NoticeModal;
