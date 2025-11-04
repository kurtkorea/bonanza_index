$(document).ready(function (e) {
  $('[data-theme]').on('click', function (e) {
    var theme = $(this).data('theme');
    $('body').toggleClass(theme);
    var bodyClass = $('body').attr('class');
    $.cookie('tradeTheme', bodyClass, '/');
    $('.thbit-range-slider').each(function (e) {
      rangeSlider($(this));
    });
    if (theme == 'trading-theme-dark') {
      if ($('body').hasClass('trading-theme-dark')) {
        changeFX('dark');
        if ($('meta[name="theme-color"]').length > 0)
          document.querySelector('meta[name="theme-color"]').setAttribute('content', '#1e2326');
      } else {
        changeFX('light');
        if ($('meta[name="theme-color"]').length > 0)
          document.querySelector('meta[name="theme-color"]').setAttribute('content', '#fff');
      }
    }
  });
  /* 달력피커 */
  $('[date-pick]').flatpickr({
    disableMobile: 'true',
    dateFormat: 'Y-m-d',
  });
  /* 달력피커 */
  /* 달력피커 범위 */
  $('[date-pick-range]').on('click change', function (e) {
    var dateFrom = $(this).parents('.thbit-trade-inlineform').find('[date-pick-range]:first-child').val();
    var dateTo = $(this).parents('.thbit-trade-inlineform').find('[date-pick-range]:last-child').val();
    if (dateFrom > dateTo) {
      alert('조회 시작일이 종료일 보다 클 수 없습니다');
      return false;
    }
    var range = $(this).attr('date-pick-range');
  });
  /* 달력피커 범위 */

  /* 상단 알림바 */
  /* 티커 */
  // $(".thbit-trade-notice .notice > ul > li").each(function(e){
  // 	$(this).attr("data-order",e + 1);
  // });
  // var noticeTimer;
  // function noticeTicker(){
  // 	noticeTimer = setInterval(function() {
  // 		$(".thbit-trade-notice .notice > ul > li:nth-child(1)").clone().appendTo( $(".thbit-trade-notice .notice > ul") );
  // 		if($(window).innerWidth() > 768) $(".thbit-trade-notice .notice > ul > li:nth-child(2)").clone().appendTo( $(".thbit-trade-notice .notice > ul") );

  // 		$(".thbit-trade-notice .notice > ul > li:nth-child(1)").animate({ opacity: 0, 'marginTop': '-5px' }, 500, function() { $(this).remove(); });
  // 		if($(window).innerWidth() > 768) $(".thbit-trade-notice .notice > ul > li:nth-child(2)").animate({ opacity: 0, 'marginTop': '-5px' }, 500, function() { $(this).remove(); });
  // 	}, 4000);
  // }
  // noticeTicker();
  // $(".thbit-trade-notice .notice").hover(function() {
  // 	if (!$('.thbit-trade-notice-wrapper').hasClass('more')) clearInterval(noticeTimer);
  // }, function() {
  // 	if (!$('.thbit-trade-notice-wrapper').hasClass('more')) noticeTicker();
  // });
  // 			/* 티커 */
  // $('.thbit-trade-notice .ctr.close .tip').text($('.thbit-trade-notice-wrapper').hasClass('close') ? "공지 열기" : "공지 닫기");
  // $('.thbit-trade-notice .ctr.close').on('click', function (e) {
  // 		var tip = $('.thbit-trade-notice .ctr.close .tip').text();
  // 		$('.thbit-trade-notice .ctr.close .tip').text(tip == "Close" ? "Open Notice" : "Close");
  // 		$('.thbit-trade-notice-wrapper').toggleClass('close');
  // 		if ($('.thbit-trade-notice-wrapper').hasClass('close')) {
  // 					$.cookie('tradeNotice', 'close', '/');
  // 		} else {
  // 					$.cookie('tradeNotice', '', '/');
  // 					$('html,body').animate({ scrollTop: 0 }, 100);
  // 		}
  // });
  // $('.thbit-trade-notice .ctr.more').on('click', function (e) {
  // 		var tip = $('.thbit-trade-notice .ctr.more .tip').text();
  // 		$('.thbit-trade-notice .ctr.more .tip').text(tip == "More" ? "Reduce" : "More");
  // 		$('.thbit-trade-notice-wrapper').toggleClass('more');
  // 		if ($('.thbit-trade-notice-wrapper').hasClass('more')) {
  // 			clearInterval(noticeTimer);
  // 			$(".thbit-trade-notice .notice > ul > li").sort((a,b) => $(a).data("order") - $(b).data("order")).appendTo(".thbit-trade-notice .notice > ul");
  // 		} else {
  // 			noticeTicker();
  // 		}
  // });
  /* 상단 알림바 */

  // $('.thbit-trade-side-ctr').on('click', function (e) {
  // 		$(".thbit-trade-side-ctr .ctr-item").slideUp(0);
  // 		$(this).find('.ctr-item').slideDown(0);

  // 		var viewport = $(window).innerWidth();
  // 		var pointview = $(this).find('.ctr-item').offset().left + $(this).find('.ctr-item').outerWidth();
  // 		if (pointview > viewport) $(this).find('.ctr-item').addClass('ri');
  // });
  // $(document).on("click mousemove","body",function(e) {
  // 		if( !$(e.target).closest(".thbit-trade-side-ctr").length > 0 && !$(e.target).closest(".thbit-trade-side-ctr .ctr-item").length > 0 ) {
  // 			$(".thbit-trade-side-ctr .ctr-item").slideUp(0);
  // 		}
  // });

  /* 오더북 */
  $(document).on('click', '[data-price-pick]', function (e) {
    var price = $(this).data('price-pick');
    $('input[data-price-put]').val(price);
  });
  $('.thbit-trade-price-list .list-ctr .sort').on('click', function (e) {
    var sort = $(this).data('sort');
    $('.thbit-trade-price-list').attr('data-sort', 'sort-' + sort);
  });
  // $(document).on('mouseenter', ".thbit-trade-price-list .list-group .list-wrap .list", function() {
  // 	var price = $(this).find('.price').text();
  // 	var amount = $(this).find('.amount').text();
  // 	var total = $(this).find('.total').text();
  // 	$('.thbit-trade-price-list .main-tip .value.price').text(price);
  // 	$('.thbit-trade-price-list .main-tip .value.amount').text(amount);
  // 	$('.thbit-trade-price-list .main-tip .value.total').text(total);
  // 	var posTop = $(this).offset().top - 150;
  // 	$(this).parents('.thbit-trade-price-list').find('.main-tip').css('visibility','visible');
  // 	$(this).parents('.thbit-trade-price-list').find('.main-tip').css('top',posTop+'px');
  // });
  // $(document).on('mouseleave', ".thbit-trade-price-list .list-group .list-wrap .list", function() {
  // 	$(this).parents('.thbit-trade-price-list').find('.main-tip').css('visibility','hidden');
  // });
  /* 오더북 */

  /* 샘플임 불필요한것 */
  // var orderTimer = setInterval(function() {
  // 	$(".thbit-trade-price-list .list-group .list").each(function(e){
  // 		var range = Math.round(Math.random() * 39) + 1;
  // 		$(this).find('.bar').css('width',range+'%');
  // 	});
  // 	/*
  // 	$(".thbit-trade-price-list .list-group").each(function(e){
  // 		$(this).find('.list').first().clone().appendTo($(this).find('.list-wrap')).show();
  // 		$(this).find('.list').first().remove();
  // 	});
  // 	*/
  // 	var samplePrice1 = $('.thbit-trade-price-list .list-sell .list:first-child').find('.price').text();
  // 	var samplePrice2 = $('.thbit-trade-price-list .list-buy .list:last-child').find('.price').text();
  // 	$(".thbit-trade-price-list .list-sum .contract").text(samplePrice1);
  // 	$(".thbit-trade-price-list .list-sum .market").text('$'+samplePrice2);
  // 	$(".thbit-trade-price-list .list-sum .contract").attr('class','contract');
  // 	var samArr = ['','buy-color','sell-color'];
  // 	var sam = samArr[Math.floor(Math.random()*samArr.length)];
  // 	$(".thbit-trade-price-list .list-sum .contract").addClass(sam);
  // }, 500);
  /* 샘플임 불필요한것 */

  /* 레인지 선택 바 */
  $('.thbit-range-slider').on('input', function () {
    rangeSlider($(this));
  });
  $('.thbit-range-slider').each(function (e) {
    rangeSlider($(this));
  });
  $('.thbit-trade-order-range-slider .range-pointer .pointer').on('click', function () {
    var range = $(this).data('range');
    $(this).parents('.thbit-trade-order-range-slider').find('.thbit-range-slider').val(range);
    var dis = $(this).parents('.thbit-trade-order-range-slider').find('.thbit-range-slider');
    rangeSlider(dis);
    var thisP = $(this).parents('.thbit-trade-order-range-slider').find('.tip');
    $(thisP).addClass('on');
    setTimeout(function () {
      $(thisP).removeClass('on');
    }, 1000);
  });
  /* 레인지 선택 바 */

  /* 증감버튼 */
  var timeupdn = 0;
  $('[data-updn-step]')
    .on('mousedown touchstart', function () {
      var dis = $(this);
      var add = $(dis).data('updn-step');
      var val = $(dis).parents('.form-fld').find('.inp').val();
      var isDecimal = val.toString().split('.');
      if (isDecimal[1]) var dLen = isDecimal[1].length;

      timeupdn = setInterval(function () {
        add = parseFloat(add);
        val = parseFloat(val);
        if (!val) val = 0;

        val = val + add;

        if (dLen > 0) val = val.toFixed(dLen);
        if (val <= 0) val = 0;
        $(dis).parents('.form-fld').find('.inp').val(val);
      }, 50);
    })
    .on('mouseup mouseleave touchend', function () {
      clearInterval(timeupdn);
    });
  /* 증감버튼 */

  /* 탭 */
  $('.thbit-trade-tab .tab').on('click', function () {
    var tabGroup = $(this).data('tab-group');
    var tabID = $(this).data('tab-id');
    $('[data-tab-group="' + tabGroup + '"]').removeClass('on');
    $('[data-tab-group="' + tabGroup + '"][data-tab-id="' + tabID + '"]').addClass('on');
    $('[data-tab-group="' + tabGroup + '"] input').attr('disabled', true);
    $('[data-tab-group="' + tabGroup + '"][data-tab-id="' + tabID + '"] input').attr('disabled', false);
  });
  /* 탭 */
  $('.thbit-trade-side-ctr.ctr-tick .item').on('click', function () {
    var val = $(this).text();
    $('.thbit-trade-side-ctr.ctr-tick .tick').text(val);
  });

  /* 코인리스트 */
  // $(document).on("click","[data-wish-coin]",function(e) {
  // 	var coin = $(this).data("wish-coin");
  // 	$(this).toggleClass('on');
  // 	if ( $(this).hasClass('on') ) {
  // 		$(this).parents('.list').clone().appendTo( $('.thbit-trade-price-list.coin-list .list-group[data-tab-id="my"] .list-wrap') );
  // 	} else {
  // 		$('.thbit-trade-price-list.coin-list .list [data-wish-coin="'+coin+'"]').removeClass('on');
  // 		$('.thbit-trade-price-list.coin-list .list-group[data-tab-id="my"] [data-wish-coin="'+coin+'"]').parents('.list').remove();
  // 	}
  // });
  // $("[data-list-search]").on( "keyup keypress change", function() {
  // 	var str = $(this).val();
  // 	if (str) {
  // 		$("[data-list-search-clear]").addClass('on');
  // 		$("[data-list-search-string]").each(function(e){
  // 			if ($(this).data('list-search-string').toLowerCase().indexOf(str.toLowerCase())!=-1) $(this).slideDown(0);
  // 			else  $(this).slideUp(0);
  // 		});
  // 	} else {
  // 		$("[data-list-search-clear]").removeClass('on');
  // 		$("[data-list-search-string]").slideDown(0);
  // 	}
  // });
  // $("[data-list-search-clear]").on( "click", function() {
  // 	$("[data-list-search]").val("");
  // 	$("[data-list-search-string]").slideDown(0);
  // 	$(this).removeClass('on');
  // });
  /* 코인리스트 */

  /* 모바일 주문창 */
  $(document).on('click', '[data-order-ctr]', function (e) {
    if ($(window).innerWidth() <= 768) {
      var ctr = $(this).data('order-ctr');
      if (ctr == 'full') {
        $('.thbit-trade-section').toggleClass('order-full');
      } else if (ctr == 'close') {
        $('.thbit-trade-section').removeClass('order-open');
      } else if (ctr == 'open') {
        $('.thbit-trade-section').addClass('order-open');
      }
    }
  });
  /* 모바일 주문창 */
});

function rangeSlider(dis) {
  if ($('body').hasClass('trading-theme-dark')) {
    var trackColor = '#141516';
  } else {
    var trackColor = '#eee';
  }
  var val = ($(dis).val() - $(dis).attr('min')) / ($(dis).attr('max') - $(dis).attr('min'));
  var percent = val * 100;

  $(dis).css(
    'background-image',
    '-webkit-gradient(linear, left top, right top, ' +
      'color-stop(' +
      percent +
      '%, #18b6c1), ' +
      'color-stop(' +
      percent +
      '%, ' +
      trackColor +
      ')' +
      ')'
  );

  $(dis).css(
    'background-image',
    '-moz-linear-gradient(left center, #18b6c1 0%, ' +
      trackColor +
      ' ' +
      percent +
      '%, ' +
      trackColor +
      ' ' +
      percent +
      '%, ' +
      trackColor +
      ' 100%)'
  );

  var bubSize = $(dis).val() * 0.08;
  $(dis)
    .parent('.thbit-tooltip')
    .find('.tip')
    .css('left', 'calc( ' + $(dis).val() + '% - ' + bubSize + '% - 2px )');
  $(dis)
    .parent('.thbit-tooltip')
    .find('.tip')
    .text($(dis).val() + '%');
  $(dis).parents('.form-row').find('.inp').val($(dis).val());
}
