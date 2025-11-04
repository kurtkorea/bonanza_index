import classNames from 'classnames';
import React from 'react';
import { useSelector } from 'react-redux';
import common from '../../common';
import Lang from "../lang";

const TradeAsset = () => {
  
  const tradeReducer = useSelector(({ TradeReducer }) => TradeReducer);  
  const ratioColor = common.judgeChangeVariable(0, ['buy-color', '', 'sell-color']);  
  const boxcolor = common.judgeChangeVariable(tradeReducer.change_symbol, ["up-color", "", "dn-color"]);
  const realColor = common.judgeChangeVariable(tradeReducer.diff, ['up-color', 'eq-color', 'dn-color']);

  const symbol = useSelector((store) => store.OrderReducer.symbol);
  const stockList = useSelector((store) => store.TradeReducer.stockList);
	let findSymbolData = stockList?.find((item) => item.symbol == symbol);  

  return (
    <div className="thbit-trade-asset asset-margin full" data-simplebar>

      <p className="asset-item">
        <span className="label up-color">데이트레이딩구분</span>
        <strong className={tradeReducer.current_symbol.daytrading == true ? "up-color" : "dn-color"}>
          {tradeReducer.current_symbol.daytrading == true ? "가능" : "불가능"}
        </strong>
      </p>   

      <p className="asset-item">
        <span className="label">거래소</span>
        <strong className={classNames('value', boxcolor)}>
        {tradeReducer.current_symbol.market == 1 ? "TWSE" : "TPEX"}
        </strong>
      </p>        

      <p className="asset-item">
        <span className="label">종목명</span>
        <strong className={classNames('value', boxcolor)}>
          {tradeReducer.current_symbol.kor_name + "/" + tradeReducer.current_symbol.chi_name}
        </strong>
      </p>  

      <p className="asset-item">
        <span className="label">영문명</span>
        <strong className={classNames('value', boxcolor)}>
          {tradeReducer.current_symbol.eng_name}
        </strong>
      </p>   

      <p className="asset-item">
        <span className="label">종목구분</span>
        <strong className="up-color">
          {tradeReducer.current_symbol.symbol_type_name}
        </strong>
      </p>   

      <p className="asset-item">
        <span className="label">호가단위/거래단위</span>
        <strong className={classNames('value', boxcolor)}>
          {common.pricisionFormat_Precision(tradeReducer.current_symbol.depth_unit, 2) + "/" + common.pricisionFormat_Precision(tradeReducer.current_symbol.trading_unit, 0)}
        </strong>
      </p>   

      <p className="asset-item">
        <span className="label">외국계회사상장</span>
        <strong className={classNames('value', boxcolor)}>
          {tradeReducer.current_symbol.foreign_stock == true ? "외국" : "로컬"}
        </strong>
      </p>   

      <p className="asset-item">
        <span className="label">상하한가</span>
        <strong className={classNames('value', boxcolor)}>
          {common.pricisionFormat_Precision(tradeReducer.current_symbol.rise_price / 10000, 2) + "/" + common.pricisionFormat_Precision(tradeReducer.current_symbol.fall_price / 10000, 2)}
        </strong>
      </p>

      <p className="asset-item">
        <span className="label">현재가</span>
        <strong className={classNames('value', realColor)}>
          {common.pricisionFormat_Precision(tradeReducer.close / 10000, 2) + "/" + common.pricisionFormat_Precision(tradeReducer.rate / 10000, 2) + "%"}
        </strong>
      </p>

      <p className="asset-item">
        <span className="label">전일종가</span>
        <strong className={classNames('value', boxcolor)}>
          {common.pricisionFormat_Precision(tradeReducer.last_price / 10000 , 2)}
        </strong>
      </p>

      <p className="asset-item">
        <span className="label">업종</span>
        <strong className={classNames('value', boxcolor)}>
          {tradeReducer.current_symbol.industry_name} 
          ({tradeReducer.current_symbol.industry})
        </strong>
      </p>    

      <p className="asset-item">
        <span className="label">시장이상코드</span>
        <strong className={classNames('value', boxcolor)}>
          {tradeReducer.current_symbol.abnomal_code_name}
          ({tradeReducer.current_symbol.abnomal_code})
        </strong>
      </p>

      <p className="asset-item">
        <span className="label">상장주식수</span>
        <strong className={classNames('value', boxcolor)}>
          {common.isEmpty(findSymbolData) ? 0 : common.pricisionFormat_Precision(findSymbolData.share_count, 0)}
        </strong>
      </p>      

      <p className="asset-item">
        <span className="label">종목마스터갯수</span>
        <strong className={classNames('value', boxcolor)}>
          {common.pricisionFormat_Precision(tradeReducer.master_count, 0)}
        </strong>
      </p>          
      <p className="asset-item">
        <span className="label">종목마스터일자</span>
        <strong className="up-color">
          {tradeReducer.master_active_date}
        </strong>
      </p>    
      <p className="asset-item">
        <span className="label">종목마스터버젼</span>
        <strong className={classNames('value', boxcolor)}>
          {tradeReducer.master_version}
        </strong>
      </p>       

      <p className="asset-item">
        <span className="label">RISE/FALL(VI/BUY/SELL/TRADING)</span>
        <strong className={classNames('value', boxcolor)}>
          {tradeReducer.instant_rf + "/" + tradeReducer.buy_rf + "/" + tradeReducer.sell_rf + "/" + tradeReducer.trading_rf}
        </strong>
      </p>       
                                
    </div>
  );
};

export default TradeAsset;
