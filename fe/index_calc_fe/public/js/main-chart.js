$(document).ready(function(e){
		$('.tab[data-market-list]').on('click', function (e) {
				var tabID = $(this).data('market-list');
				$(this).parent('*').find('.tab').removeClass('on');
				$(this).addClass('on');
				$('.list-wrap[data-market-list]').removeClass('on');
				$('.list-wrap[data-market-list="'+tabID+'"]').addClass('on');
				doChunk();
		});


Highcharts.SparkLine = function (a, b, c) {
    const hasRenderToArg = typeof a === 'string' || a.nodeName;
    let options = arguments[hasRenderToArg ? 1 : 0];
    const defaultOptions = {
        chart: {
            renderTo: (options.chart && options.chart.renderTo) || (hasRenderToArg && a),
            backgroundColor: null,
            borderWidth: 0,
            type: 'area',
            margin: [0, 0, 0, 0],
            width: 100,
            height: 30,
            style: {
                overflow: 'visible'
            },
            skipClone: true
        },
        title: {
            text: ''
        },
        credits: {
            enabled: false
        },
        xAxis: {
            labels: {
                enabled: false
            },
            title: {
                text: null
            },
            startOnTick: false,
            endOnTick: false,
            tickPositions: []
        },
        yAxis: {
            endOnTick: false,
            startOnTick: false,
            labels: {
                enabled: false
            },
            title: {
                text: null
            },
            tickPositions: [0]
        },
        legend: {
            enabled: false
        },
        tooltip: {
            hideDelay: 0,
            outside: true,
            shared: true,
			style: {
				zIndex: 9900
			}
        },
        plotOptions: {
            series: {
				animation: {
					enabled: true,
					duration: 1000,
					easing: 'swing'
				},
                lineWidth: 1,
                shadow: false,
                states: {
                    hover: {
                        lineWidth: 1
                    }
                },
				marker: {
                    radius: 0,
                    states: {
                        hover: {
                            radius: 0
                        }
                    }
                },
				fillOpacity: 0.01
            }
        }
    };

    options = Highcharts.merge(defaultOptions, options);

    return hasRenderToArg ?
        new Highcharts.Chart(a, options, c) :
        new Highcharts.Chart(options, b);
};

const start = +new Date(),
    tds = Array.from(document.querySelectorAll('[data-sparkline]')),
    fullLen = tds.length;

let n = 0;

function doChunk() {
    const time = +new Date(),
        len = tds.length;

    for (let i = 0; i < len; i += 1) {
        const td = tds[i];
        const stringdata = td.dataset.sparkline;
        const arr = stringdata.split('; ');
        const data = arr[0].split(', ').map(parseFloat);
        const chart = {};

        if (arr[1]) {
            chart.type = arr[1];
        }
		const updn = $('[data-sparkline]').eq(i).attr('data-type');
		/*
		if (updn == 'dn') tcolor = '#f85046';
		else  tcolor = '#4c96c9';
		*/
		if (updn == 'dn') {
			tcolor = '#ff6137';
			ecolor = 'rgba(237,59,24,0)';
		} else {
			tcolor = '#03b37c';
			ecolor = 'rgba(3,179,124,0)';
		}

        Highcharts.SparkLine(td, {
            series: [{
               color: tcolor,
				fillColor: {
					linearGradient: [0, 0, 0, 29],
					stops: [
						[0, tcolor],
						[1, ecolor]
					]
				},
               data: data,
                pointStart: 1
            }],
            chart: chart
        });

        n += 1;

        if (new Date() - time > 500) {
            tds.splice(0, i + 1);
            setTimeout(doChunk, 0);
            break;
        }

    }
}
doChunk();


});


