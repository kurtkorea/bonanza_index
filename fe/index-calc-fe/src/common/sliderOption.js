import React, { useEffect } from 'react';

const SliderOption = () => {
  useEffect(() => {
    document.querySelectorAll('.swiper-container:not([data-slide-col])').forEach(function (s) {
      var next = s.querySelector('.swiper-next');
      var prev = s.querySelector('.swiper-prev');
      var sPaging = s.querySelector('.swiper-pagination');
      if ($(s).parent('div').hasClass('bione-main-slide')) {
        var sBetween = 260;
      } else {
        var sBetween = 20;
      }
      new Swiper(s, {
        direction: 'horizontal',
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
            $(s).parent('div').removeClass('on');
            setTimeout(function () {
              $(s).parent('div').addClass('on');
            }, 1000);
          },
        },
      });
    });
    document.querySelectorAll('.swiper-container[data-slide-col]').forEach(function (s) {
      var next = s.querySelector('.swiper-next');
      var prev = s.querySelector('.swiper-prev');
      var sPaging = s.querySelector('.swiper-pagination');

      var sCol = $(s).attr('data-slide-col');
      var nav = $(s).attr('data-slide-navigation') ?? 'true';
      var pagination = $(s).attr('data-slide-pagination') ?? 'true';
      var sLoop = $(s).attr('data-slide-loop') == 'false' ? false : true;

      const option = {
        direction: 'horizontal',
        slidesPerView: sCol,
        spaceBetween: 20,
        speed: 1000,
        loop: sLoop,
        autoplay: {
          delay: 5000,
          disableOnInteraction: false,
        },
        ...(nav == 'true' && {
          navigation: {
            nextEl: next,
            prevEl: prev,
          },
        }),
        ...(pagination == 'true' && {
          pagination: {
            el: sPaging,
            clickable: true,
          },
        }),
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
      };
      console.log(option);
      new Swiper(s, option);
    });
  }, []);
};

export default SliderOption;
