import { Divider, message, Modal, Popconfirm, Switch } from "antd";
import axios from "axios";
import classNames from "classnames";
import React, { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import common from "../common";
import { isUndefined } from "lodash";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from 'react-query';
import { DatePicker } from 'antd';
const { RangePicker } = DatePicker;
import moment from 'moment';
import { Table } from "antd";

import MultiExchangeChart from "./index_chart";
import CorrelationTable from "./index_correlation";
import VolatilityTable from "./index_volatility";

const columns = [
  {
    title: 'TIME',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 180,
    align: 'center',
    fixed: 'left',
    render: (text, record) => common.convertDateKST(text),
  },
  {
    title: 'fkbrti-1s',
    dataIndex: 'fkbrti_1s',
    key: 'fkbrti_1s',
    width: 120,
    align: 'right',
    fixed: 'left',
    render: (text, record) => common.pricisionFormat_Precision(text, 0),
  },
  {
    title: 'fkbrti-5s',
    dataIndex: 'fkbrti_5s',
    key: 'fkbrti_5s',
    width: 120,
    align: 'center',
    fixed: 'left',
    render: (text, record) => common.pricisionFormat_Precision(text, 0),
  },
  {
    title: 'fkbrti-10s',
    dataIndex: 'fkbrti_10s',
    key: 'fkbrti_10s',
    width: 120,
    align: 'center',
    fixed: 'left',
    render: (text, record) => common.pricisionFormat_Precision(text, 0),
  },
  {
    title: 'BITTHUMB',
    dataIndex: 'expected_status.102.price',
    key: 'expected_status.102.price',
    width: 120,
    align: 'right',
    fixed: 'left',
    render: (text, record) => record.expected_status.map(item => item.exchange == "102" ? item.reason == "ok" ? common.pricisionFormat_Precision(item.price, 0) : item.reason : ''),
  },

  {
    title: 'COINONE',
    dataIndex: 'expected_status.104.price',
    key: 'expected_status.104.price',
    width: 120,
    align: 'right',
    fixed: 'left',
    render: (text, record) => record.expected_status.map(item => item.exchange == "104" ? item.reason == "ok" ? common.pricisionFormat_Precision(item.price, 0) : item.reason : ''),
  },
  {
    title: 'KORBIT',
    dataIndex: 'expected_status.103.price',
    key: 'expected_status.103.price',
    width: 120,
    align: 'right',
    fixed: 'left',
    render: (text, record) => record.expected_status.map(item => item.exchange == "103" ? item.reason == "ok" ? common.pricisionFormat_Precision(item.price, 0) : item.reason : ''),
  },
  {
    title: 'UPBIT',
    dataIndex: 'expected_status.101.price',
    key: 'expected_status.101.price',
    width: 120,
    align: 'center',
    fixed: 'left',
    render: (text, record) => record.expected_status.map(item => item.exchange == "101" ? item.reason == "ok" ? common.pricisionFormat_Precision(item.price, 0) : item.reason : ''),
  },
  {
    title: 'ACTUAL-AVG',
    dataIndex: 'expected_status.105.price',
    key: 'expected_status.105.price',
    width: 120,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
      let sum = 0;
      let count = 0;
      for (const item of record.expected_status) {
        if (item.reason == "ok") {
          sum += item.price;
          count++;
        }
      }
      return common.pricisionFormat_Precision(sum / count, 0);
    },
  },
  // {
  //   title: 'DIFF-1',
  //   dataIndex: 'expected_status.106.price',
  //   key: 'expected_status.106.price',
  //   width: 120,
  //   align: 'right',
  //   fixed: 'left',
  // },
  // {
  //   title: 'DIFF-2',
  //   dataIndex: 'expected_status.107.price',
  //   key: 'expected_status.107.price',
  //   width: 120,
  //   align: 'right',
  //   fixed: 'left',
  // },
  // {
  //   title: 'DIFF-3',
  //   dataIndex: 'expected_status.108.price',
  //   key: 'expected_status.108.price',
  //   width: 120,
  //   align: 'right',
  //   fixed: 'left',
  // },
  // {
  //   title: 'DIFF-3',
  //   dataIndex: 'expected_status.108.price',
  //   key: 'expected_status.108.price',
  //   width: 120,
  //   align: 'right',
  //   fixed: 'left',
  // },
];

const columns_excel = [
  {
    title: 'TIME',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 180,
    align: 'center',
    fixed: 'left',
    render: (text) => common.convertDateKST(text),
  },
  {
    title: 'seq',
    dataIndex: 'seq',
    key: 'seq',
    width: 180,
    align: 'center',
    fixed: 'left',
  },
  {
    title: 'fkbrti-1s',
    dataIndex: 'fkbrti_1s',
    key: 'fkbrti_1s',
    width: 120,
    align: 'right',
    fixed: 'left',
    render: (text) => common.pricisionFormat_Precision(text, 0),
  },
  {
    title: 'fkbrti-5s',
    dataIndex: 'fkbrti_5s',
    key: 'fkbrti_5s',
    width: 120,
    align: 'center',
    fixed: 'left',
    render: (text) => common.pricisionFormat_Precision(text, 0),
  },
  {
    title: 'fkbrti-10s',
    dataIndex: 'fkbrti_10s',
    key: 'fkbrti_10s',
    width: 120,
    align: 'center',
    fixed: 'left',
    render: (text) => common.pricisionFormat_Precision(text, 0),
  },

  {
    title: 'BITTHUMB',
    dataIndex: 'BITTHUMB',
    key: 'BITTHUMB',
    width: 120,
    align: 'right',
    fixed: 'left',
   },

  {
    title: 'COINONE',
    dataIndex: 'COINONE',
    key: 'COINONE',
    width: 120,
    align: 'right',
    fixed: 'left',
  },
  {
    title: 'KORBIT',
    dataIndex: 'KORBIT',
    key: 'KORBIT',
    width: 120,
    align: 'right',
    fixed: 'left',
  },
  {
    title: 'UPBIT',
    dataIndex: 'UPBIT',
    key: 'UPBIT',
    width: 120,
    align: 'center',
    fixed: 'left',
  },
  {
    title: 'ACTUAL-AVG',
    dataIndex: 'ACTUAL_AVG',
    key: 'ACTUAL_AVG',
    width: 120,
    align: 'right',
    fixed: 'left',
    
  },
];

const IndexCalcTable = () => {
  const queryClient = useQueryClient();
  const defaultRange = [moment().add(-7, 'day'), moment()];
  
  const [range, setRange] = useState(defaultRange);
  const dispatch = useDispatch();

  const [tab_idx, setTabIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  const index_list = useSelector(state => state.IndexReducer.index_data);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(500);
  const [totalCount, setTotalCount] = useState(0);
  const [pagination, setPagination] = useState({hasNext: false, hasPrev: false, page: 1, size: 500, totalCount: 0, totalPages: 0});

  // Fetch data with paging
  const fetchData = async (page = currentPage, size = pageSize) => {
    setLoading(true);
    try {
      const res = await axios.get(process.env.SERVICE + "/v1/index_calc", {
        params: {
          from_date: "2025-10-01",
          to_date: moment().format("YYYY-MM-DD"),
          page: page,
          size: size
        }
      });
      setPagination ( res.data.pagination );
      setTotalCount(res.data.totalCount || res.data.total_count || 0);
      setCurrentPage(page);

      let new_datalist = [];
      for (const item of res.data.datalist) {
        let new_item = {
          createdAt: item.createdAt,
          fkbrti_1s: item.fkbrti_1s,
          fkbrti_5s: item.fkbrti_5s,
          fkbrti_10s: item.fkbrti_10s,
          expected_status: item.expected_status,
          expected_exchanges: item.expected_exchanges,
          sources: item.sources,
          vwap_buy: item.vwap_buy,
          vwap_sell: item.vwap_sell,
          no_publish: item.no_publish,
          provisional: item.provisional,
          BITTHUMB: item.expected_status.find(item => item.exchange == "102")?.price,
          COINONE: item.expected_status.find(item => item.exchange == "104")?.price,
          KORBIT: item.expected_status.find(item => item.exchange == "103")?.price,
          UPBIT: item.expected_status.find(item => item.exchange == "101")?.price,
          ACTUAL_AVG: 0,
        };

        let sum = 0;
        let count = 0;
        for (const expected_status of item.expected_status) {
          if (expected_status.reason == "ok") {
            sum += expected_status.price;
            count++;
          }
        }
        new_item.ACTUAL_AVG = sum / count;
        new_datalist.push(new_item);
      }

      if ( page == 1 ) {
        dispatch({ type: "fkbrti/init", payload : { current_page: page, datalist: new_datalist } }); // maintain for Excel export
      } else {
        dispatch({ type: "fkbrti/append", payload : { current_page: page, datalist: new_datalist } }); // maintain for Excel export
      }
    } catch (err) {
      console.error("조회 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(1, pageSize);
    setCurrentPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, pageSize]);

  // 조회 버튼 클릭시 (항상 1페이지부터)
  const onClickSearch = async ( page = 1, size = pageSize ) => {
    setCurrentPage(page);
    fetchData(page, size);
  };

  const onClickTab = ({ currentTarget }) => {
    setTabIdx(parseInt(currentTarget.getAttribute("data")));
  };

  return (
    <>
      <div className="thbit-trade-list">
        <div className="thbit-trade-inlineform antd-style" style={{ height: "50px", padding: "5px" }}>
          {/* 날짜 선택기 추가 */}
          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
            <div style={{ flex: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <span style={{ fontSize: "16px" }}>
                total : {index_list?.length}
              </span>
            </div>
            <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <span style={{ fontSize: "16px" }}>
                거래소 표기규칙 : no_data(데이터없음) stale(30초간 변동없음) crossed(매수호가/매도호가 역전)
              </span>
            </div>
            {/* <RangePicker className="inp date" style={{ width: "220px", marginRight: "15px" }} defaultValue={range} inputreadOnly={true} onCalendarChange={setRange} /> */}
            <button type="button" className="btn"  
              style={{ height: "40px", lineHeight: "40px", marginRight: "5px" }}
              onClick={async () => {
                onClickSearch(1, pageSize);
              }}
            >
              조회
            </button>
            <button type="button" className="btn" 
              style={{ height: "40px", lineHeight: "40px", marginRight: "5px" }}
              onClick={async () => {
                if ( pagination?.hasNext ) {
                  onClickSearch(currentPage + 1, pageSize);
                }
              }}
            >
              이전
            </button>
            <button
              type="button"
              className="btn"
              style={{ height: "40px", lineHeight: "40px", marginRight: "5px" }}
              onClick={async () => {

                try {
                  const res = await axios.get( process.env.SERVICE + "/v1/index_calc", {
                    params: {
                      from_date: range[0].format('YYYY-MM-DD'),
                      to_date: range[1].format('YYYY-MM-DD'),
                      page: 1,
                      size: 999999,
                      order: "asc"
                    }
                  });

                  let new_datalist = [];
                  let seq = 1;  
                  for (const item of res.data.datalist) {
                    let new_item = {
                      createdAt: item.createdAt,
                      seq: seq,
                      fkbrti_1s: item.fkbrti_1s,
                      fkbrti_5s: item.fkbrti_5s,
                      fkbrti_10s: item.fkbrti_10s,
                      BITTHUMB: item.expected_status.find(item => item.exchange == "102")?.price,
                      COINONE: item.expected_status.find(item => item.exchange == "104")?.price,
                      KORBIT: item.expected_status.find(item => item.exchange == "103")?.price,
                      UPBIT: item.expected_status.find(item => item.exchange == "101")?.price,
                      ACTUAL_AVG: 0,
                    };

                    let sum = 0;
                    let count = 0;
                    for (const expected_status of item.expected_status) {
                      if (expected_status.reason == "ok") {
                        sum += expected_status.price;
                        count++;
                      }
                    }
                    new_item.ACTUAL_AVG = common.pricisionFormat_Precision(sum / count, 0);
                    new_datalist.push(new_item);
                    seq ++;
                  }
                  common.exportExcel(columns_excel, new_datalist, "index_calc");
                } catch (err) {
                  console.error("조회 실패:", err);
                }
              }}
            >
              엑셀
            </button>
          </div>
        </div>
        <div className="thbit-index-tab">
          <a className={classNames("tab", { on: tab_idx === 0 })} data="0" onClick={onClickTab} data-tab-group="list" data-tab-id="position">
          HISTORY
          </a>
          <a className={classNames("tab", { on: tab_idx === 1 })} data="1" onClick={onClickTab} data-tab-group="list" data-tab-id="nodeal">
          CHART
          </a>
          <a className={classNames("tab", { on: tab_idx === 2 })} data="2" onClick={onClickTab} data-tab-group="list" data-tab-id="trade">
          CORRELATION
          </a>
          <a className={classNames("tab", { on: tab_idx === 3 })} data="3" onClick={onClickTab} data-tab-group="list" data-tab-id="trade">
          VOLATILITY
          </a>
        </div>
      </div>


      {tab_idx === 0 && (
      <>
        <div className="thbit-trade-table-container" data-simplebar style={{ height: "100%" }}>
          <Table 
            columns={columns}
            dataSource={index_list}
            rowKey={(record) => `${record.createdAt}`}
            pagination={false}
            // pagination={{
            //   position: ['bottomCenter'], // pagination이 항상 보이도록 위치를 명시적으로 지정
            //   current: currentPage,
            //   pageSize: 10,
            //   total: totalCount,
            //   // showSizeChanger: true,
            //   pageSizeOptions: ['20', '50', '100', '200', '500'],
            //   showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
            // }}
            loading={loading}
            scroll={{ y: 740, x: 'max-content' }}
            style={{ height: "100%" }}
          />
        </div>
      </>
      )}
      {tab_idx === 1 && (
        <div className="thbit-trade-table-container" data-simplebar style={{ height: "100%" }}>
          <MultiExchangeChart data={[...index_list].reverse()} height={740} />
        </div>
      )}
      {tab_idx === 2 && (
        <div
          className="thbit-trade-table-container flex justify-center"
          style={{
            minHeight: "400px",
            height: "100%",
            alignItems: "center",
            overflowY: "hidden",
            marginTop: "150px",
          }}
        >
          <div
            style={{
              minWidth: "900px",
              maxWidth: "1200px",
              margin: "0 auto",
              width: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
              overflowY: "hidden",
            }}
          >
            <CorrelationTable
              data={index_list}
              columns={[
                { key: 'fkbrti_1s' },
                { key: 'fkbrti_5s' },
                { key: 'fkbrti_10s' },
                { key: 'BITTHUMB' },
                { key: 'COINONE' },
                { key: 'KORBIT' },
                { key: 'UPBIT' },
                { key: 'ACTUAL_AVG' },
              ]}
              decimals={6}
            />
          </div>
        </div>
      )}
      {tab_idx === 3 && (
        <div
          className="thbit-trade-table-container flex justify-center"
          style={{
            minHeight: "600px",
            height: "100%",
            alignItems: "center",
            overflowY: "hidden",
            marginTop: "-50px",
          }}
        >
          <div
            style={{
              minWidth: "900px",
              maxWidth: "1200px",
              margin: "0 auto",
              width: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
              overflowY: "hidden",
            }}
          >
            <VolatilityTable
              rows={index_list}
              columns={[
                { key: 'fkbrti_1s' },
                { key: 'fkbrti_5s' },
                { key: 'fkbrti_10s' },
                { key: 'BITTHUMB' },
                { key: 'COINONE' },
                { key: 'KORBIT' },
                { key: 'UPBIT' },
                { key: 'ACTUAL_AVG' },
              ]}
              stepSec={1}        // 데이터 간격(초)
              decimals={2}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default IndexCalcTable;
