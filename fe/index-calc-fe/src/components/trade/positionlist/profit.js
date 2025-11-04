import { DatePicker } from 'antd';
import axios from 'axios';
import moment from 'moment';
import React, { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { useSelector } from 'react-redux';
import common from '../../../common';

const { RangePicker } = DatePicker;

const defaultRange = [moment().add(-7, 'day'), moment()];

const ProfitTable = () => {
  const [searchOption, setSearchOption] = useState(defaultRange);
  return (
    <>
      <ProfitTableSearchbar setSearchOption={setSearchOption} />
      <div className="thbit-trade-table-container" data-simplebar>
        <table className="thbit-trade-table">
          <thead className="sticky head">
            <tr>
              <th className="align-r">
              날짜
              </th>
              <th className="align-r">
              전체손익
              </th>        
              <th className="align-r">
              손익
              </th>         
							<th className="align-r">
							전체수수료
							</th>			                             
              <th className="align-r">
              선물손익
              </th>
              <th className="align-r">
              선물수수료
              </th>
              <th className="align-r">
              야간선물손익
              </th>
              <th className="align-r">
              야간선물수수료
              </th>              
              <th className="align-r">
              옵션손익
              </th>
              <th className="align-r">
              야간옵션수수료
              </th>
              <th className="align-r">
              야간옵션손익
              </th>
              <th className="align-r">
              옵션수수료
              </th>              
							<th className="align-r">
							해외손익
							</th>
							<th className="align-r">
							해외수수료
							</th>							                            
            </tr>
          </thead>
          <tbody>
            <ProfitTableBody searchOption={searchOption} />
          </tbody>
        </table>
      </div>
    </>
  );
};

const ProfitTableBody = ({ searchOption }) => {
  const { username, login } = useSelector(store => store.UserReducer);
  const { data } = useQuery(
    ['eachdayprofit', searchOption[0].format('YYYY-MM-DD'), searchOption[1].format('YYYY-MM-DD')],
    async () => {
      const { data } = await axios.get(
          '/mts/get_profit?id=' +
          username +
          '&startdate=' +
          searchOption[0].format('YYYY-MM-DD') +
          '&enddate=' +
          searchOption[1].format('YYYY-MM-DD') +
          '&bContractOnly=0'
      );
      data.datalist.reverse();
      return data;
    },
    { staleTime: 1000, cacheTime: 1000, enabled: login, refetchOnMount: false, placeholderData: { datalist: [] } }
  );
  return (data?.datalist ?? []).map((item, index) => (
    <tr key={item.ordnum + 'profit' + index} className={index === 0 ? 'highlight' : ''}>
      <td className="">{index === 0 ? 'TOTAL' : item.date.substring(0, 10)}</td>
      <td className={'align-r ' + common.judgeColorVariable(item.TotalProfit, ['buy-color', '', 'sell-color'])}>
        {common.pricisionFormat_Precision(item.TotalProfit, 0)}
      </td>
      <td className={'align-r ' + common.judgeColorVariable(item.Total, ['buy-color', '', 'sell-color'])}>
        {common.pricisionFormat_Precision(item.TotalProfit, 0)}
      </td>      
      <td className="align-r">{common.pricisionFormat_Precision(item.TotalFee, 0)}</td>      
      <td className={'align-r ' + common.judgeColorVariable(item.F, ['buy-color', '', 'sell-color'])}>
        {common.pricisionFormat_Precision(item.F, 0)}
      </td>
      <td className="align-r">{common.pricisionFormat_Precision(item.F_Fee, 0)}</td>

      <td className={'align-r ' + common.judgeColorVariable(item.NF, ['buy-color', '', 'sell-color'])}>
        {common.pricisionFormat_Precision(item.NF, 0)}
      </td>
      <td className="align-r">{common.pricisionFormat_Precision(item.NF_Fee, 0)}</td>      

      <td className={'align-r ' + common.judgeColorVariable(item.O, ['buy-color', '', 'sell-color'])}>
        {common.pricisionFormat_Precision(item.O, 0)}
      </td>
      <td className="align-r">{common.pricisionFormat_Precision(item.O_Fee, 0)}</td>      

      <td className={'align-r ' + common.judgeColorVariable(item.NO, ['buy-color', '', 'sell-color'])}>
        {common.pricisionFormat_Precision(item.NO, 0)}
      </td>
      <td className="align-r">{common.pricisionFormat_Precision(item.NO_Fee, 0)}</td>            

      <td className={'align-r ' + common.judgeColorVariable(item.FF, ['buy-color', '', 'sell-color'])}>
        {common.pricisionFormat_Precision(item.FF, 0)}
      </td>
      <td className="align-r">{common.pricisionFormat_Precision(item.FF_Fee, 0)}</td>           
    </tr>
  ));
};

const ProfitTableSearchbar = ({ setSearchOption }) => {
  const [range, setRange] = useState(defaultRange);
  const queryClient = useQueryClient();
  const onClickSearch = () => {
    queryClient.invalidateQueries('eachdayprofit');
    setSearchOption(range);
  };

  return (
    <div className="thbit-trade-inlineform antd-style">
      {/* <label htmlFor="date_from" className="label">
        PERIOD
      </label> */}
      <RangePicker
        className="inp date"
        defaultValue={range}
        inputreadOnly={true}
        onCalendarChange={setRange}
        style={{ width: '220px' }}
      />
      <button type="button" className="btn" onClick={onClickSearch}>
      {/* <Lang lang_no={69}></Lang> */}
      </button>
    </div>
  );
};

export default ProfitTable;
