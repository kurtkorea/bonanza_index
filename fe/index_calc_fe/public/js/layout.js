$(document).ready(function (e) {
  $("[data-theme]").on("click", function (e) {
    var theme = $(this).data("theme");
    $("body").toggleClass(theme);
    var bodyClass = $("body").attr("class");
    $.cookie("tradeTheme", bodyClass, "/");
    $(".thbit-range-slider").each(function (e) {
      rangeSlider($(this));
    });
    if (theme == "trading-theme-dark") {
      if ($("body").hasClass("trading-theme-dark")) {
        if (typeof changeFX === "function") changeFX("dark");
        if ($('meta[name="theme-color"]').length > 0 && $("div").hasClass("thbit-main-slide"))
          document.querySelector('meta[name="theme-color"]').setAttribute("content", "#1a1f2c");
        else if ($('meta[name="theme-color"]').length > 0 && !$("div").hasClass("thbit-main-slide"))
          document.querySelector('meta[name="theme-color"]').setAttribute("content", "#1a1f2c");
        $("[data-theme]").find(".material-symbols-rounded").text("dark_mode");
      } else {
        if (typeof changeFX === "function") changeFX("light");
        if ($('meta[name="theme-color"]').length > 0 && $("div").hasClass("thbit-main-slide"))
          document.querySelector('meta[name="theme-color"]').setAttribute("content", "#fff");
        else if ($('meta[name="theme-color"]').length > 0 && !$("div").hasClass("thbit-main-slide"))
          document.querySelector('meta[name="theme-color"]').setAttribute("content", "#fff");
        $("[data-theme]").find(".material-symbols-rounded").text("light_mode");
      }
    }
  });

  $(".tab[data-cate]").on("click", function (e) {
    var cate = $(this).data("cate");
    $(".tab[data-cate]").removeClass("on");
    $('.tab[data-cate="' + cate + '"]').addClass("on");
    if (cate == "all") {
      $("div[data-cate]").slideDown(0);
    } else {
      $("div[data-cate]").slideUp(0);
      $('div[data-cate="' + cate + '"]').slideDown(0);
    }
  });

  //$('.thbit-scroll-content').each((index, element) => new SimpleBar(element));
  $(window).on("load resize scroll", function () {
    if ($(window).scrollTop() > 10) {
      $(".thbit-header").addClass("header-fixed");
      if ($("div").hasClass("thbit-trade-section")) $(".thbit-trade-section").addClass("header-fixed");
      //if ( $('meta[name="theme-color"]').length > 0 && !$('body').hasClass('trading-theme-dark') && $('div').hasClass('thbit-main-slide') ) document.querySelector('meta[name="theme-color"]').setAttribute('content',  '#fff');
      //if ( $('meta[name="theme-color"]').length > 0 && $('body').hasClass('trading-theme-dark') && !$('div').hasClass('thbit-main-slide') ) document.querySelector('meta[name="theme-color"]').setAttribute('content',  '#fff');
    } else {
      $(".thbit-header").removeClass("header-fixed");
      $(".thbit-section").removeClass("on");
      if ($("div").hasClass("thbit-trade-section")) $(".thbit-trade-section").removeClass("header-fixed");
      //if ( $('meta[name="theme-color"]').length > 0 && !$('body').hasClass('trading-theme-dark') && $('div').hasClass('thbit-main-slide') ) document.querySelector('meta[name="theme-color"]').setAttribute('content',  '#fff');
      //if ( $('meta[name="theme-color"]').length > 0 && $('body').hasClass('trading-theme-dark') && !$('div').hasClass('thbit-main-slide') ) document.querySelector('meta[name="theme-color"]').setAttribute('content',  '#fff');
    }

    $(".thbit-section").each(function () {
      if (!$(this).hasClass("on")) {
        var dis = $(this);
        if (isScrolledIntoView($(this))) {
          visibleOn = setTimeout(function () {
            $(dis).addClass("on");
          }, 100);
        } else {
          //clearTimeout(visibleOn);
          //$(dis).removeClass("on");
          /*
									if($(window).scrollTop() < 20) {
										$(dis).removeClass('on');
										clearTimeout(visibleOn);
										numAnimated = 0;
									}
									*/
        }
      }
    });
  });
  /* 코인리스트 */
  $(document).on("click", "[data-wish-coin]", function (e) {
    var coin = $(this).data("wish-coin");
    $(this).toggleClass("on");
    if ($(this).hasClass("on")) {
      $(this).parents(".list").clone().appendTo($('.thbit-trade-price-list.coin-list .list-group[data-tab-id="my"] .list-wrap'));
    } else {
      $('.thbit-trade-price-list.coin-list .list [data-wish-coin="' + coin + '"]').removeClass("on");
      $('.thbit-trade-price-list.coin-list .list-group[data-tab-id="my"] [data-wish-coin="' + coin + '"]')
        .parents(".list")
        .remove();
    }
  });
  $("[data-list-search]").on("keyup keypress change", function () {
    var str = $(this).val();
    if (str) {
      $("[data-list-search-clear]").addClass("on");
      $("[data-list-search-string]").each(function (e) {
        if ($(this).data("list-search-string").toLowerCase().indexOf(str.toLowerCase()) != -1) $(this).slideDown(0);
        else $(this).slideUp(0);
      });
    } else {
      $("[data-list-search-clear]").removeClass("on");
      $("[data-list-search-string]").slideDown(0);
    }
  });
  $("[data-list-search-clear]").on("click", function () {
    $("[data-list-search]").val("");
    $("[data-list-search-string]").slideDown(0);
    $(this).removeClass("on");
  });
  /* 코인리스트 */

  /* 모바일메뉴 */
  mobGnbTop();
  $(".thbit-mobile-menu").on("click", function (e) {
    mobGnbTop();
    $(".thbit-header").toggleClass("open");
  });
  $(".thbit-header").on("click", function (e) {
    if ($(".thbit-header").hasClass("open") && !$(e.target).closest(".thbit-mobile-menu").length > 0 && !$(e.target).closest(".thbit-menu-mobile").length > 0) {
      $(".thbit-header").removeClass("open");
    }
  });
  $(".thbit-menu-mobile .gnb > ul > li > i").on("click", function (e) {
    if (!$(this).parent("li").hasClass("on")) {
      $(this).parent("li").find("ul").slideDown();
      $(this).parent("li").addClass("on");
    } else {
      $(this).parent("li").find("ul").slideUp();
      $(this).parent("li").removeClass("on");
    }
  });
  /* 모바일메뉴 */

  /* 슬라이드 */
  /* 단일슬라이드 */
  document.querySelectorAll(".swiper-container:not([data-slide-col])").forEach(function (s) {
    var next = s.querySelector(".swiper-next");
    var prev = s.querySelector(".swiper-prev");
    var sPaging = s.querySelector(".swiper-pagination");
    if ($(s).parent("div").hasClass("thbit-main-slide")) {
      var sBetween = 260;
    } else {
      var sBetween = 20;
    }
    new Swiper(s, {
      direction: "horizontal",
      spaceBetween: sBetween,
      speed: 1000,
      loop: true,
      autoplay: {
        delay: 5000,
        disableOnInteraction: false,
      },
      navigation: {
        nextEl: next,
        prevEl: prev,
      },
      pagination: {
        el: sPaging,
        clickable: true,
      },
      on: {
        activeIndexChange: function () {
          $(s).parent("div").removeClass("on");
          setTimeout(function () {
            $(s).parent("div").addClass("on");
          }, 1000);
        },
      },
    });
  });
  /* 단일슬라이드 */
  /* 멀티칼럼 슬라이드 */
  document.querySelectorAll(".swiper-container[data-slide-col]").forEach(function (s) {
    var next = s.querySelector(".swiper-next");
    var prev = s.querySelector(".swiper-prev");
    var sPaging = s.querySelector(".swiper-pagination");

    var sCol = $(s).attr("data-slide-col");

    new Swiper(s, {
      direction: "horizontal",
      slidesPerView: sCol,
      spaceBetween: 20,
      speed: 1000,
      loop: true,
      autoplay: {
        delay: 5000,
        disableOnInteraction: false,
      },
      navigation: {
        nextEl: next,
        prevEl: prev,
      },
      pagination: {
        el: sPaging,
        clickable: true,
      },
      breakpoints: {
        100: {
          slidesPerView: 1,
          spaceBetween: 20,
        },
        521: {
          slidesPerView: sCol - 2,
          spaceBetween: 20,
        },
        701: {
          slidesPerView: sCol - 1,
          spaceBetween: 20,
        },
        931: {
          slidesPerView: sCol,
          spaceBetween: 20,
        },
      },
      on: {
        slideChange: function () {},
      },
    });
  });
  /* 멀티칼럼 슬라이드 */

  $(".swiper-container").hover(
    function () {
      this.swiper.autoplay.stop();
    },
    function () {
      $(".swiper-container").each(function () {
        this.swiper.autoplay.stop();
        this.swiper.autoplay.start();
      });
    }
  );
  /* 슬라이드 */

  $(".thbit-faq-list .list-title").on("click", function (e) {
    $(".thbit-faq-list .list-title").not($(this)).parent(".list-row").removeClass("on");
    $(this).parent(".list-row").toggleClass("on");
  });

  /* 로그인, 가입 */
  $(".thbit-form .func-passtype").on("click", function (e) {
    if ($(this).hasClass("fa-eye")) {
      $(this).parent(".fld").find(".inp").attr("type", "text");
      $(this).removeClass("fa-eye");
      $(this).addClass("fa-eye-slash");
      $(this).find(".tip").text("암호숨기기");
    } else {
      $(this).parent(".fld").find(".inp").attr("type", "password");
      $(this).removeClass("fa-eye-slash");
      $(this).addClass("fa-eye");
      $(this).find(".tip").text("암호보이기");
    }
  });
  $('[data-check-terms="click"]').on("click", function (e) {
    $('[data-check-terms="view"]').slideDown(200);
    $(this).parents(".chkwrap").find("input[type=checkbox]").prop("checked", false);
    return false;
  });
  $('[data-check-terms="view"] .close').on("click", function (e) {
    $('[data-check-terms="view"]').slideUp(200);
  });
  $('[data-check-terms="click"]')
    .parents(".chkwrap")
    .find("input[type=checkbox]")
    .change(function () {
      if (this.checked) {
        $('[data-check-terms="view"]').slideUp(200);
      } else {
      }
    });
  /* 로그인, 가입 */

  /* 탭 */
  $("[data-tab-id]").on("click", function () {
    if (!$(this).hasClass("on")) {
      var tabGroup = $(this).data("tab-group");
      var tabID = $(this).data("tab-id");
      $('[data-tab-group="' + tabGroup + '"]').removeClass("on");
      $('[data-tab-group="' + tabGroup + '"][data-tab-id="' + tabID + '"]').addClass("on");
      $('[data-tab-group="' + tabGroup + '"] input').attr("disabled", true);
      $('[data-tab-group="' + tabGroup + '"][data-tab-id="' + tabID + '"] input').attr("disabled", false);
    }
  });
  /* 탭 */

  /* 월렛 */
  $(".func-copytoclip").on("click", function (e) {
    var val = $(this).parent(".fld").find(".inp").val();
    if (val) {
      var title = $(this).parents(".row").find(".thbit-row-title > strong").text();
      copyClip(val);
      alert(title + " is copied.\n" + val);
    } else {
      alert("Not copied. No data found.");
    }
  });
  $(".thbit-percent-sel .btn").on("click", function (e) {
    var percent = percentDecimal($(this).data("percent"));
    var availQty = $(this).parents(".row").find(".data-avail-qty").text();
    availQty = availQty.replace(/,/g, "");
    var val = availQty * percent;
    val = addCommas(val);
    $(this).parents(".row").find(".inp").val(val);
    $(this).parents(".row").find(".thbit-percent-sel .btn").removeClass("on");
    $(this).addClass("on");
  });
  /* 월렛 */

  /* 테이블 */
  $(".thbit-table > thead > tr > th").each(function (e) {
    var label = $(this).text();
    var index = e + 1;
    $(".thbit-table > tbody > tr  td:nth-child(" + index + ")").attr("data-title", label);
  });
  /* 테이블 */

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

  /* 팝오버 */
  if ($("*").is("[data-popover]")) {
    $("[data-popover]").on("click", function (e) {
      var popID = $(this).data("popover");

      var viewport = $(window).innerWidth();
      var pointview = $(this).offset().left + $(".thbit-popover." + popID).outerWidth();
      var posTop = $(this).offset().top - ($(".thbit-popover." + popID).outerHeight() + 87);
      if (pointview > viewport) {
        var posRight = viewport - ($(this).offset().left + $(this).outerWidth());
        $(".thbit-popover." + popID).addClass("ri");
        $(".thbit-popover." + popID).css({ right: posRight + "px", top: posTop + "px" });
      } else {
        var posLeft = $(this).offset().left + $(this).outerWidth() / 2;
        $(".thbit-popover." + popID).removeClass("ri");
        $(".thbit-popover." + popID).css({ left: posLeft + "px", top: posTop + "px" });
      }
      $(".thbit-popover." + popID).slideDown(200);
    });
    $("[data-popover-close]").on("click", function (e) {
      $(".thbit-popover").slideUp(100);
    });
    $(document).on("click", "body", function (e) {
      if (!$(e.target).closest("[data-popover]").length > 0 && !$(e.target).closest(".thbit-popover").length > 0) {
        $(".thbit-popover").slideUp(100);
      }
    });
    $(window).on("resize", function () {
      $(".thbit-popover").slideUp(0);
    });
  }
  /* 팝오버 */
});

/* 모바일메뉴 gnb의 top포지션 */
function mobGnbTop() {
  if ($(".thbit-menu-mobile").is(":visible")) {
    var topPos = $(".thbit-header").outerHeight() + $(".thbit-menu-mobile .snb").outerHeight();
    $(".thbit-menu-mobile .gnb").css("top", topPos + "px");
  }
}
/* 모바일메뉴 gnb의 top포지션 */

jQuery.fn.isChildOverflowing = function (child) {
  var p = jQuery(this).get(0);
  var el = jQuery(child).get(0);
  return (
    el.offsetTop < p.offsetTop ||
    el.offsetLeft < p.offsetLeft ||
    el.offsetTop + el.offsetHeight > p.offsetTop + p.offsetHeight ||
    el.offsetLeft + el.offsetWidth > p.offsetLeft + p.offsetWidth
  );
};
