$(document).ready(function(e){

	$('a[href*=\\#]:not([href=\\#])').on( "click", function() {
		if (location.pathname.replace(/^\//,'') == this.pathname.replace(/^\//,'') && location.hostname == this.hostname) {
		  var target = $(this.hash);
		  target = target.length ? target : $('[name=' + this.hash.slice(1) +']');
		  if (target.length) {
			if (this.hash.split('#')[1] == 'entra-body') {
				history.pushState('', document.title, window.location.pathname);
			} else {
				history.replaceState(null, null, this.hash);
			}
			var scMargin = 0;
			if ( $(this).data('margin') ) scMargin = $(this).data('margin');
			$('html,body').animate({
			  scrollTop: target.offset().top - headerTop + 100 - scMargin
			}, 1000);
			return false;
		  }
		}
	});
	$(window).on('load resize scroll', function() {
		if($(window).scrollTop() < 10) {
				history.pushState('', document.title, window.location.pathname);
		}
	});


	$('.thbit-toggle .toggle').on('click',function(e){
		$(this).toggleClass('on');
	});


});

function isScrolledIntoView(elem) {
	var winHalf =  jQuery(window).height() / 2;
	var docViewTop = jQuery(window).scrollTop();
	var docViewBottom = docViewTop + jQuery(window).height();

	var elemTop = jQuery(elem).offset().top;
	var elemBottom = elemTop + jQuery(elem).height();

	if ($(window).height() > ($(elem).height() + ($(window).height() / 3)) ) {
	return ((elemBottom <= docViewBottom) && (elemTop >= docViewTop));
	} else {
	return ((elemTop < docViewTop + winHalf));
	}
}


function removeLocationHash(){
	var noHashURL = window.location.href.replace(/#.*$/, '');
	window.history.replaceState('', document.title, noHashURL) 
}


function copyClip(value) {
    var sample = document.createElement("textarea");
    document.body.appendChild(sample);
    sample.value = value;
    sample.select();
    document.execCommand("copy");
    document.body.removeChild(sample);
}
function percentDecimal(percent) {
	const parsed = parseFloat(percent);
	if (!Number.isNaN(parsed)) {
		return parseFloat(percent) / 100;
	} else {
		return 0;
	}
}
function addCommas(value,sosu = true) {
	if (sosu) return value.toLocaleString(undefined, {maximumFractionDigits: 4});
	else  return value.toLocaleString(undefined, {maximumFractionDigits: 0});
}

