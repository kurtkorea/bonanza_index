import moment from "moment";
import numeral from "numeral";
import axios, { formToJSON } from "axios";
import { isUndefined } from "lodash";
import exportFromJSON from "export-from-json";

export const NIL_SYMBOL = "AAAAAAAA";

String.prototype.fillZero = function (width) {
	return this.length >= width ? this : new Array(width - this.length + 1).join("0") + this;
};

const exportExcel = (columns, datalist, fileName) => {
    try {
        const flatColumns = columns.flatMap((column) => {
            if (column.children) {
                return column.children;
            }
            return column;
        });
        const exportData = datalist.map((item) =>
            flatColumns.reduce((result, column) => {
                let columnData = item[column.dataIndex];
                // if (isNum(columnData)) {
                //  columnData = priceFormat(columnData);
                // }
                result[column.title] = columnData;
                return result;
            }, {}),
        );
        exportFromJSON({ data: exportData, fileName, exportType: "xls" });
    } catch (error) {
        message.error("엑셀 파일 생성 실패");
        console.log(error);
    }
};

export const removeComma = (str) => {
	if (str) {
		return str.replace(/,/g, "");
	} else {
		return "";
	}
};
export const priceFormat = (value) => numeral(value).format("0,0");
export const pricisionFormat = (value) => numeral(value).format("0,0.0000");
export const pricisionFormat_Precision = (value, precision) => {	
	if ( !isNaN(value) && !isNaN(precision) && !isUndefined(value) && !isUndefined(precision) )
	{
		var value = Number.parseFloat(value).toFixed(precision);	
		var fill_zero = new Array(Number(precision) + 1).join("0");
		return numeral(value).format(precision == "0" ? "0,0" : "0,0." + fill_zero);
	} else return "0";
};

export const pricisionFormat_FloorPrecision = (value, precision) => {
	if ( !isNaN(value) && !isNaN(precision) && !isUndefined(value) && !isUndefined(precision) )
	{
		const parsePrecision = parseInt(precision);
		const prePow = Math.pow(10, parsePrecision);
		const resultValue = Math.floor(value * prePow);
		const fillZero = Array(parsePrecision + 1).join("0");
		return numeral(resultValue / prePow).format(parsePrecision > 0 ? "0,0." + fillZero : "0,0");
	} else return "0";
};

export const pricision_FloorPrecision = (value, precision) => {
	if ( !isNaN(value) && !isNaN(precision) && !isUndefined(value) && !isUndefined(precision) )
	{
		const parsePrecision = parseInt(precision);
		const prePow = Math.pow(10, parsePrecision);
		const resultValue = Math.floor(value * prePow);
		const fillZero = Array(parsePrecision + 1).join("0");
		return numeral(resultValue / prePow).format(parsePrecision > 0 ? "0." + fillZero : "0");
	} else return "0";
};

export const judgeChangeChar = (data) => {
	if (data === "1") {
		return "▲";
	} else if (data === "2") {
		return "▲";
	} else if (data === "3") {
		return "-";
	} else if (data === "4") {
		return "▼";
	} else if (data === "5") {
		return "▼";
	}
};

export const get_market_status = (data) => {
	if (data === 1) {
		return "동시호가";
	} else if (data === 2) {
		return "장시작지연";
	} else if (data === 3) {
		return "장시작";
	} else if (data === 4) {
		return "장중";
	} else if (data === 5) {
		return "장마감지연";
	} else if (data === 6) {
		return "장마감";
	}
};

/**
 *
 * @param {String} data
 * @param {[String]} resultArr
 * @description 입력된 change_symbol의 RISE, EVEN, FALL 을 기준으로 각각 resultArr의 0,1,2을 리턴해줌
 */

export const judgeChangeVariable = (data, resultArr = ["up", "eq", "down"]) => {
	if (data > 0 ) {
		return resultArr[0];
	} else if (data == 0) {
		return resultArr[1];
	} else if (data < 0 ) {
		return resultArr[2];
	}
};

export const makeGuid = () => {
	return randomString(8) + "-" + randomString(4) + "-" + randomString(4) + "-" + randomString(4) + "-" + randomString(12);
};
const randomString = (length) => {
	var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZ";
	var randomstring = "";
	for (var i = 0; i < length; i++) {
		var rnum = Math.floor(Math.random() * chars.length);
		randomstring += chars.substring(rnum, rnum + 1);
	}
	return randomstring;
};

const judgeColor = (data) => {
	if (data > 0) {
		return "RISE";
	} else if (data === 0) {
		return "EVEN";
	} else {
		return "FALL";
	}
};

const judgeColorVariable = (data, resultArr = ["up", "", "down"]) => {
	if (data > 0) {
		return resultArr[0];
	} else if (data === 0) {
		return resultArr[1];
	} else {
		return resultArr[2];
	}
};

const checkMobile = () => {
	const tempUser = navigator.userAgent;
	let isMobile = "WTS";
	if (tempUser.indexOf("iPhone") > 0 || tempUser.indexOf("iPad") > 0 || tempUser.indexOf("iPot") > 0 || tempUser.indexOf("Android") > 0) {
		isMobile = "MTS";
	}
	return isMobile;
};

const getActor = () => {
	const thretshold = 768;
	if (window.innerWidth <= thretshold) {
		return "M";
	} else {
		return "W";
	}
};

const increaseStringValue = (value, increaseValue = 1, max = 100) => {
	let next = removeComma(value) * 1;
	if (next < max) {
		next += increaseValue;
	}
	if (max < next) {
		next = max;
	}
	return next.toString();
};
const decreaseStringValue = (value, decreaseValue = 1, min = 0) => {
	let next = removeComma(value) * 1;
	if (next > min) {
		next -= decreaseValue;
	}
	if (next < min) {
		next = min;
	}
	return next.toString();
};

const diffDay = 30;
const dateRangeCheck = (startDate, endDate) => {
	if (Math.abs(startDate.diff(endDate, "days")) < diffDay) {
		return true;
	}
	return false;
};

const convertDateOnly = (datetime) => {
	const d = moment(datetime).format("YYYY년 MM월 DD일");
	return d.toString();
};

const convertDate = (datetime) => {
	const d = moment(datetime).format("YYYY년 MM월 DD일 HH:mm:ss.SSS");
	return d.toString();
};

const convertDateKST = (datetime) => {
	const d = moment.utc(datetime).utcOffset(0).format("YYYY년 MM월 DD일 HH:mm:ss");
	return d.toString();
};

const convertTime = (datetime) => {
	const d = moment(datetime).format("HH:mm:ss");
	return d.toString();
};

const convertTimeString = (str_date) => {
	let d = "";
	if ( str_date.length == 11 )
	{
		d = "0" + str_date.substring( 0, 1 ) + ":" + str_date.substring( 1, 3 ) + ":" + str_date.substring( 3, 5 ) + "." + str_date.substring( 5, 8 );
	} else if ( str_date.length == 12 )
	{
		d = str_date.substring( 0, 2 ) + ":" + str_date.substring( 2, 4 ) + ":" + str_date.substring( 4, 6 ) + "." + str_date.substring( 6, 9 );
	}	
	return d.toString();
};

const convertShortTimeString = (str_date) => {
	let d = "";
	if ( str_date.length == 11 )
	{
		d = "0" + str_date.substring( 0, 1 ) + ":" + str_date.substring( 1, 3 ) + ":" + str_date.substring( 3, 5 );
	} else if ( str_date.length == 12 )
	{
		d = str_date.substring( 0, 2 ) + ":" + str_date.substring( 2, 4 ) + ":" + str_date.substring( 4, 6 );
	}	
	return d.toString();
};

const convertStringTime = (datetime) => {
	const d = datetime.substring( 0, 2 ) + ":" + datetime.substring( 2, 4 ) + ":" + datetime.substring( 4, 6 );
	return d.toString();
};

function iOS() {
	return (
		["iPad Simulator", "iPhone Simulator", "iPod Simulator", "iPad", "iPhone", "iPod"].includes(navigator.platform) ||
		// iPad on iOS 13 detection
		(navigator.userAgent.includes("Mac") && "ontouchend" in document)
	);
}

const lang_data = {
	lang: 0,
	lang_list: [],
};


const randColor = (seed) => {
	const x = Math.sin(seed++) * 10000;
	const rnd = x - Math.floor(x);
  const randomColor = Math.floor(rnd*16777215).toString(16);
  return "#"+randomColor;
};

function isEmpty(str){		
	if(str == "undefined" || str == null || str == "")
		return true;
	else
		return false ;
}

function nvl(str, defaultStr){		
	if(str == "undefined" || str == null || str == "")
		str = defaultStr ;
	
	return str ;
}

const toTimestamp = (strDate) => {
	const dt = moment(strDate).unix();
	return dt;
  };

function chk_symbol(str){		
	if(str == "undefined" || str == null || str == "" || str == NIL_SYMBOL) 
		return true;
	else
		return false ;
}  

const get_today = () => {
	const today = new Date();
	const d = moment(today).format("YYYYMMDD");
	return d.toString();
};

function get_side_name(side){		
	if ( side == 0 )
		return "매수";
	else if ( side == 1 )
		return "매도" ;
}  

function get_market_type_name(market){		
	if ( market == 0 )
		return "지정가";
	else if ( market == 1 )
		return "시장가" ;
}  

function get_fill_type_name(fill){		
	if ( fill == 0 )
		return "Day";
	else if ( fill == 1 )
		return "IOC" ;
	else if ( fill == 2 )
		return "FOK" ;
	else if ( fill == 3 )
		return "UNKNOW" ;		
}  

function get_order_status(market){		
	if ( market == 0 )
		return "신규";
	else if ( market == 1 )
		return "체결" ;
	else if ( market == 2 )
		return "수량정정" ;
	else if ( market == 3 )
		return "가격정정" ;
	else if ( market == 4 )
		return "취소" ;			
	else if ( market == 5 )
		return "거부" ;				
}  

function get_order_step(market){		
	if ( market == 0 )
		return "신규주문";
	else if ( market == 1 )
		return "주문갱신" ;
	else if ( market == 2 )
		return "주문완료" ;	
	else if ( market == 5 )
		return "주문거부" ;		
}  

function get_color_by_ranking(ranking){		
	if ( ranking == 1 )
		return "red";
	else if ( ranking == 2 )
		return "blue" ;
	else if ( ranking == 3 )
		return "green" ;	
	else if ( ranking == 4 )
		return "yellow" ;		
	else if ( ranking == 5 )
		return "purple" ;		
	else if ( ranking == 6 )
		return "orange" ;		
	else if ( ranking == 7 )
		return "brown" ;		
	else if ( ranking == 8 )
		return "gray" ;		
	else if ( ranking == 9 )
		return "black" ;		
	else if ( ranking == 10 )
		return "white" ;		
}  

export default {
	get_order_status,
	get_order_step,
	chk_symbol,
	toTimestamp,
	nvl,
	isEmpty,
	convertTime,
	convertDate,
	convertDateOnly,
	convertStringTime,
	removeComma,
	priceFormat,
	pricisionFormat,
	pricisionFormat_Precision,
	pricisionFormat_FloorPrecision,
	pricision_FloorPrecision,
	increaseStringValue,
	decreaseStringValue,
	makeGuid,
	judgeColor,
	checkMobile,
	judgeChangeChar,
	judgeChangeVariable,
	dateRangeCheck,
	diffDay,
	judgeColorVariable,
	getActor,
	iOS,
	NIL_SYMBOL,
	convertTimeString,
	convertShortTimeString,
	get_today,
	get_side_name,
	get_market_type_name,
	get_fill_type_name,
	get_market_status,
	exportExcel,
  	randColor,
  	get_color_by_ranking,
	  convertDateKST,
};
