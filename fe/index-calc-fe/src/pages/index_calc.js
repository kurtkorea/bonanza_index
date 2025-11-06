import { Divider, message, Modal, Popconfirm, Switch, Button } from "antd";
import axios from "axios";
import classNames from "classnames";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import common from "../common";
import { isUndefined } from "lodash";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from 'react-query';
import { DatePicker } from 'antd';
const { RangePicker } = DatePicker;
import moment from 'moment';
import { Table, Tag, Tooltip } from "antd";

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
    title: 'fkbrit-1s',
    dataIndex: 'fkbrti_1s',
    key: 'fkbrti_1s',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => common.pricisionFormat_Precision(text, 0),
  },
  {
    title: 'fkbrit-5s',
    dataIndex: 'fkbrti_5s',
    key: 'fkbrti_5s',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => common.pricisionFormat_Precision(text, 0),
  },
  {
    title: 'fkbrit-10s',
    dataIndex: 'fkbrti_10s',
    key: 'fkbrti_10s',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => common.pricisionFormat_Precision(text, 0),
  },
  {
    title: 'Upbit',
    dataIndex: 'UPBIT',
    key: 'UPBIT',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => common.pricisionFormat_Precision(text, 0),
  },
  {
    title: 'Bithumb',
    dataIndex: 'BITTHUMB',
    key: 'BITTHUMB',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => common.pricisionFormat_Precision(text, 0),
  },
  {
    title: 'Coinone',
    dataIndex: 'COINONE',
    key: 'COINONE',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => common.pricisionFormat_Precision(text, 0),
  },
  {
    title: 'Korbit',
    dataIndex: 'KORBIT',
    key: 'KORBIT',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => common.pricisionFormat_Precision(text, 0),
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
  {
    title: 'DIFF-1s',
    dataIndex: 'DIFF_1',
    key: 'DIFF_1',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
      let color = record.DIFF_1 === 0 ? 'black' : record.DIFF_1 < 0 ? 'blue' : 'red';
      return (
        <span style={{ color }}>
          {common.pricisionFormat_Precision(record.DIFF_1, 0)}
        </span>
      );
    },
  },
  {
    title: 'DIFF-5s',
    dataIndex: 'DIFF_2',
    key: 'DIFF_2',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
      let color = record.DIFF_1 === 0 ? 'black' : record.DIFF_1 < 0 ? 'blue' : 'red';
      return (
        <span style={{ color }}>
          {common.pricisionFormat_Precision(record.DIFF_2, 0)}
        </span>
      );
    },
  },
  {
    title: 'DIFF-10s',
    dataIndex: 'DIFF_3',
    key: 'DIFF_3',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
      let color = record.DIFF_3 === 0 ? 'black' : record.DIFF_3 < 0 ? 'blue' : 'red';
      return (
        <span style={{ color }}>
          {common.pricisionFormat_Precision(record.DIFF_3, 0)}
        </span>
      );
    },
  },
  {
    title: 'RATIO-1s',
    dataIndex: 'RATIO_1',
    key: 'RATIO_1',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
      let color = record.RATIO_1 === 0 ? 'black' : record.RATIO_1 < 0 ? 'blue' : 'red';
      return (
        <span style={{ color }}>
          {common.pricisionFormat_Precision(record.RATIO_1, 2)}%
        </span>
      );
    },
  },
  {
    title: 'RATIO-5s',
    dataIndex: 'RATIO_2',
    key: 'RATIO_2',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
      let color = record.RATIO_2 === 0 ? 'black' : record.RATIO_2 < 0 ? 'blue' : 'red';
      return (
        <span style={{ color }}>
          {common.pricisionFormat_Precision(record.RATIO_2, 2)}%
        </span>
      );
    },
  },
  {
    title: 'RATIO-10s',
    dataIndex: 'RATIO_3',
    key: 'RATIO_3',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
      let color = record.RATIO_3 === 0 ? 'black' : record.RATIO_3 < 0 ? 'blue' : 'red';
      return (
        <span style={{ color }}>
          {common.pricisionFormat_Precision(record.RATIO_3, 2)}%
        </span>
      );
    },
  },
  {
    title: '',
    dataIndex: 'SCROLL',
    key: 'SCROLL',
    width: 5,
    align: 'center',
  },
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
  const min_max_info = useSelector(state => state.IndexReducer.MIN_MAX_INFO);
  const total_count = useSelector(state => state.IndexReducer.total_count);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10000);
  const [totalCount, setTotalCount] = useState(0);
  const [pagination, setPagination] = useState({hasNext: false, hasPrev: false, page: 1, size: 500, totalCount: 0, totalPages: 0});
  const [summaryStats, setSummaryStats] = useState({
    '1D': { DIFF_1s: { MIN: 0, MAX: 0, AVG: 0 }, RATIO_1s: { MIN: 0, MAX: 0, AVG: 0 }, DIFF_5s: { MIN: 0, MAX: 0, AVG: 0 }, RATIO_5s: { MIN: 0, MAX: 0, AVG: 0 } },
    '1W': { DIFF_1s: { MIN: 0, MAX: 0, AVG: 0 }, RATIO_1s: { MIN: 0, MAX: 0, AVG: 0 }, DIFF_5s: { MIN: 0, MAX: 0, AVG: 0 }, RATIO_5s: { MIN: 0, MAX: 0, AVG: 0 } },
    '1M': { DIFF_1s: { MIN: 0, MAX: 0, AVG: 0 }, RATIO_1s: { MIN: 0, MAX: 0, AVG: 0 }, DIFF_5s: { MIN: 0, MAX: 0, AVG: 0 }, RATIO_5s: { MIN: 0, MAX: 0, AVG: 0 } },
    '1Y': { DIFF_1s: { MIN: 0, MAX: 0, AVG: 0 }, RATIO_1s: { MIN: 0, MAX: 0, AVG: 0 }, DIFF_5s: { MIN: 0, MAX: 0, AVG: 0 }, RATIO_5s: { MIN: 0, MAX: 0, AVG: 0 } },
  });

  // Fetch data with paging
  const fetchData = async (page = currentPage, size = pageSize) => {
    setLoading(true);
    try {
      const fromDate = range[0] ? range[0].format("YYYY-MM-DD") : moment().subtract(7, 'day').format("YYYY-MM-DD");
      const toDate = range[1] ? range[1].format("YYYY-MM-DD") : moment().format("YYYY-MM-DD");
      
      const res = await axios.get(process.env.SERVICE + "/v1/index_calc", {
        params: {
          from_date: fromDate,
          to_date: toDate,
          page: page,
          size: size
        }
      });
      setPagination ( res.data.pagination );
      setTotalCount(res.data.pagination.totalCount);

      console.log("total_count", res.data.pagination.totalCount);
      setCurrentPage(page);

      let min_max_info_tmp = {
        MIN_DIFF_1: 0,
        MIN_DIFF_2: 0,
        MIN_DIFF_3: 0,
        MAX_DIFF_1: 0,
        MAX_DIFF_2: 0,
        MAX_DIFF_3: 0,
        AVG_RATIO_1: 0,
        AVG_RATIO_2: 0,
        AVG_RATIO_3: 0,
        MAX_RATIO_1: 0,
        MAX_RATIO_2: 0,
        MAX_RATIO_3: 0,
        MIN_ACTUAL_AVG: 0,
        MAX_ACTUAL_AVG: 0,
      }

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
          UPBIT: item.expected_status.find(item => item.exchange == "101")?.price,
          BITTHUMB: item.expected_status.find(item => item.exchange == "102")?.price,
          COINONE: item.expected_status.find(item => item.exchange == "104")?.price,
          KORBIT: item.expected_status.find(item => item.exchange == "103")?.price,
          DIFF_1: 0,
          DIFF_2: 0,
          DIFF_3: 0,
          RATIO_1: 0,
          RATIO_2: 0,
          RATIO_3: 0,
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

        let colF = new_item.BITTHUMB;
        let colI = new_item.UPBIT;

        if (!colI && colI !== 0) {
          new_item.DIFF_1 = colF - new_item.fkbrti_1s;
        } else {
          new_item.DIFF_1 = colI - new_item.fkbrti_1s;
        }

        if (!colI && colI !== 0) {
          new_item.DIFF_2 = colF - new_item.fkbrti_5s;
        } else {
          new_item.DIFF_2 = colI - new_item.fkbrti_5s;
        }

        if (!colI && colI !== 0) {
          new_item.DIFF_3 = colF - new_item.fkbrti_10s;
        } else {
          new_item.DIFF_3 = colI - new_item.fkbrti_10s;
        }

        if (!colI && colI !== 0) {
          new_item.RATIO_1 = Math.abs(new_item.DIFF_1 / colF);
        } else {
          new_item.RATIO_1 = Math.abs(new_item.DIFF_1 / colI);
        }
        new_item.RATIO_1 = new_item.RATIO_1 * 100;

        if (!colI && colI !== 0) {
          new_item.RATIO_2 = Math.abs(new_item.DIFF_2 / colF);
        } else {
          new_item.RATIO_2 = Math.abs(new_item.DIFF_2 / colI);
        }
        new_item.RATIO_2 = new_item.RATIO_2 * 100;

        if (!colI && colI !== 0) {
          new_item.RATIO_3 = Math.abs(new_item.DIFF_3 / colF);
        } else {
          new_item.RATIO_3 = Math.abs(new_item.DIFF_3 / colI);
        }
        new_item.RATIO_3 = new_item.RATIO_3 * 100;

        new_datalist.push(new_item);
      }

      // 통계 계산 (기간별)
      const calcStats = (values) => {
        if (values.length === 0) return { MIN: 0, MAX: 0, AVG: 0 };
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        return { MIN: min, MAX: max, AVG: avg };
      };

      const calculatePeriodStats = (periodDays) => {
        const periodEnd = moment();
        const periodStart = moment().subtract(periodDays, 'day');
        const periodData = new_datalist.filter(item => {
          const itemDate = moment(item.createdAt);
          return itemDate.isAfter(periodStart) && itemDate.isBefore(periodEnd) || itemDate.isSame(periodStart, 'day') || itemDate.isSame(periodEnd, 'day');
        });

        if (periodData.length === 0) {
          return {
            DIFF_1s: { MIN: 0, MAX: 0, AVG: 0 },
            RATIO_1s: { MIN: 0, MAX: 0, AVG: 0 },
            DIFF_5s: { MIN: 0, MAX: 0, AVG: 0 },
            RATIO_5s: { MIN: 0, MAX: 0, AVG: 0 },
          };
        }

        const diff1sValues = periodData.map(item => item.DIFF_1).filter(v => v !== undefined && v !== null);
        const ratio1sValues = periodData.map(item => item.RATIO_1).filter(v => v !== undefined && v !== null);
        const diff5sValues = periodData.map(item => item.DIFF_2).filter(v => v !== undefined && v !== null);
        const ratio5sValues = periodData.map(item => item.RATIO_2).filter(v => v !== undefined && v !== null);

        return {
          DIFF_1s: calcStats(diff1sValues),
          RATIO_1s: calcStats(ratio1sValues),
          DIFF_5s: calcStats(diff5sValues),
          RATIO_5s: calcStats(ratio5sValues),
        };
      };

      if (new_datalist.length > 0) {
        setSummaryStats({
          '1D': calculatePeriodStats(1),
          '1W': calculatePeriodStats(7),
          '1M': calculatePeriodStats(30),
          '1Y': calculatePeriodStats(365),
        });
      }

      // for 루프 밖에서 min_max_info 업데이트
      dispatch({ type: "fkbrti/update_min_max_info", payload : min_max_info_tmp });

      if ( page == 1 ) {
        dispatch({ type: "fkbrti/init", payload : { current_page: page, datalist: new_datalist, total_count: res.data.pagination.totalCount } }); // maintain for Excel export
      } else {
        dispatch({ type: "fkbrti/append", payload : { current_page: page, datalist: new_datalist, total_count: res.data.pagination.totalCount } }); // maintain for Excel export
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
        {/* 상단 조회 및 통계 섹션 */}
        <div style={{ 
          border: "1px solid #d9d9d9", 
          padding: "15px", 
          marginBottom: "10px",
          backgroundColor: "#fafafa"
        }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: "15px" }}>
            <div style={{ marginRight: "20px", minWidth: "120px" }}>
              <div style={{ marginBottom: "5px", fontSize: "12px", color: "#666" }}>조회기간 (최대 1개월)</div>
              <RangePicker 
                className="inp date" 
                style={{ width: "220px" }} 
                value={range} 
                inputReadOnly={true} 
                onChange={setRange}
                format="YYYY-MM-DD"
              />
            </div>
            <div style={{ marginRight: "20px" }}>
              <div style={{ marginBottom: "5px", fontSize: "12px", color: "#666" }}>시작일</div>
              <div style={{ padding: "4px 8px", border: "1px solid #d9d9d9", backgroundColor: "#fff", minWidth: "100px" }}>
                {range[0]?.format('YYYY-MM-DD') || ''}
              </div>
            </div>
            <div style={{ marginRight: "20px" }}>
              <div style={{ marginBottom: "5px", fontSize: "12px", color: "#666" }}>종료일</div>
              <div style={{ padding: "4px 8px", border: "1px solid #d9d9d9", backgroundColor: "#fff", minWidth: "100px" }}>
                {range[1]?.format('YYYY-MM-DD') || ''}
              </div>
            </div>
            <div style={{ marginRight: "20px", flex: 1 }}>
              {/* <div style={{ marginBottom: "5px", fontSize: "12px", color: "#666" }}>'</div> */}
              <div style={{ display: "flex", gap: "5px", marginTop: "20px" }}>
                <Button
                  type="primary"
                  onClick={async () => {
                    onClickSearch(1, pageSize);
                  }}
                >
                  조회
                </Button>
                <Button
                  onClick={async () => {
                    if ( pagination?.hasNext ) {
                      onClickSearch(currentPage + 1, pageSize);
                    }
                  }}
                  disabled={!pagination?.hasNext}
                >
                  다음
                </Button>
                <Button
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
                          UPBIT: item.expected_status.find(item => item.exchange == "101")?.price,
                          BITTHUMB: item.expected_status.find(item => item.exchange == "102")?.price,
                          COINONE: item.expected_status.find(item => item.exchange == "104")?.price,
                          KORBIT: item.expected_status.find(item => item.exchange == "103")?.price,
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
                  파일다운로드
                </Button>
              </div>
            </div>
          </div>

          {/* 통계 테이블 */}
          <div style={{ marginTop: "15px" }}>
            <Table
              columns={[
                {
                  title: '',
                  dataIndex: 'period',
                  key: 'period',
                  width: 80,
                  align: 'center',
                  fixed: 'left',
                },
                {
                  title: 'DIFF-1s',
                  align: 'center',
                  children: [
                    {
                      title: 'MIN',
                      dataIndex: 'diff1s_min',
                      key: 'diff1s_min',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: 'MAX',
                      dataIndex: 'diff1s_max',
                      key: 'diff1s_max',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: 'AVG',
                      dataIndex: 'diff1s_avg',
                      key: 'diff1s_avg',
                      width: 80,
                      align: 'right',
                    },
                  ],
                },
                {
                  title: 'RATIO-1s',
                  align: 'center',
                  children: [
                    {
                      title: 'MIN',
                      dataIndex: 'ratio1s_min',
                      key: 'ratio1s_min',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: 'MAX',
                      dataIndex: 'ratio1s_max',
                      key: 'ratio1s_max',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: 'AVG',
                      dataIndex: 'ratio1s_avg',
                      key: 'ratio1s_avg',
                      width: 80,
                      align: 'right',
                    },
                  ],
                },
                {
                  title: 'DIFF-5s',
                  align: 'center',
                  children: [
                    {
                      title: 'MIN',
                      dataIndex: 'diff5s_min',
                      key: 'diff5s_min',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: 'MAX',
                      dataIndex: 'diff5s_max',
                      key: 'diff5s_max',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: 'AVG',
                      dataIndex: 'diff5s_avg',
                      key: 'diff5s_avg',
                      width: 80,
                      align: 'right',
                    },
                  ],
                },
                {
                  title: 'RATIO-5s',
                  align: 'center',
                  children: [
                    {
                      title: 'MIN',
                      dataIndex: 'ratio5s_min',
                      key: 'ratio5s_min',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: 'MAX',
                      dataIndex: 'ratio5s_max',
                      key: 'ratio5s_max',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: 'AVG',
                      dataIndex: 'ratio5s_avg',
                      key: 'ratio5s_avg',
                      width: 80,
                      align: 'right',
                    },
                  ],
                },
              ]}
              dataSource={[
                {
                  key: '1D',
                  period: '1D',
                  diff1s_min: common.pricisionFormat_Precision(summaryStats['1D'].DIFF_1s.MIN, 0),
                  diff1s_max: common.pricisionFormat_Precision(summaryStats['1D'].DIFF_1s.MAX, 0),
                  diff1s_avg: common.pricisionFormat_Precision(summaryStats['1D'].DIFF_1s.AVG, 0),
                  ratio1s_min: common.pricisionFormat_Precision(summaryStats['1D'].RATIO_1s.MIN, 2),
                  ratio1s_max: common.pricisionFormat_Precision(summaryStats['1D'].RATIO_1s.MAX, 2),
                  ratio1s_avg: common.pricisionFormat_Precision(summaryStats['1D'].RATIO_1s.AVG, 2),
                  diff5s_min: common.pricisionFormat_Precision(summaryStats['1D'].DIFF_5s.MIN, 0),
                  diff5s_max: common.pricisionFormat_Precision(summaryStats['1D'].DIFF_5s.MAX, 0),
                  diff5s_avg: common.pricisionFormat_Precision(summaryStats['1D'].DIFF_5s.AVG, 0),
                  ratio5s_min: common.pricisionFormat_Precision(summaryStats['1D'].RATIO_5s.MIN, 2),
                  ratio5s_max: common.pricisionFormat_Precision(summaryStats['1D'].RATIO_5s.MAX, 2),
                  ratio5s_avg: common.pricisionFormat_Precision(summaryStats['1D'].RATIO_5s.AVG, 2),
                },
                {
                  key: '1W',
                  period: '1W',
                  diff1s_min: common.pricisionFormat_Precision(summaryStats['1W'].DIFF_1s.MIN, 0),
                  diff1s_max: common.pricisionFormat_Precision(summaryStats['1W'].DIFF_1s.MAX, 0),
                  diff1s_avg: common.pricisionFormat_Precision(summaryStats['1W'].DIFF_1s.AVG, 0),
                  ratio1s_min: common.pricisionFormat_Precision(summaryStats['1W'].RATIO_1s.MIN, 2),
                  ratio1s_max: common.pricisionFormat_Precision(summaryStats['1W'].RATIO_1s.MAX, 2),
                  ratio1s_avg: common.pricisionFormat_Precision(summaryStats['1W'].RATIO_1s.AVG, 2),
                  diff5s_min: common.pricisionFormat_Precision(summaryStats['1W'].DIFF_5s.MIN, 0),
                  diff5s_max: common.pricisionFormat_Precision(summaryStats['1W'].DIFF_5s.MAX, 0),
                  diff5s_avg: common.pricisionFormat_Precision(summaryStats['1W'].DIFF_5s.AVG, 0),
                  ratio5s_min: common.pricisionFormat_Precision(summaryStats['1W'].RATIO_5s.MIN, 2),
                  ratio5s_max: common.pricisionFormat_Precision(summaryStats['1W'].RATIO_5s.MAX, 2),
                  ratio5s_avg: common.pricisionFormat_Precision(summaryStats['1W'].RATIO_5s.AVG, 2),
                },
                {
                  key: '1M',
                  period: '1M',
                  diff1s_min: common.pricisionFormat_Precision(summaryStats['1M'].DIFF_1s.MIN, 0),
                  diff1s_max: common.pricisionFormat_Precision(summaryStats['1M'].DIFF_1s.MAX, 0),
                  diff1s_avg: common.pricisionFormat_Precision(summaryStats['1M'].DIFF_1s.AVG, 0),
                  ratio1s_min: common.pricisionFormat_Precision(summaryStats['1M'].RATIO_1s.MIN, 2),
                  ratio1s_max: common.pricisionFormat_Precision(summaryStats['1M'].RATIO_1s.MAX, 2),
                  ratio1s_avg: common.pricisionFormat_Precision(summaryStats['1M'].RATIO_1s.AVG, 2),
                  diff5s_min: common.pricisionFormat_Precision(summaryStats['1M'].DIFF_5s.MIN, 0),
                  diff5s_max: common.pricisionFormat_Precision(summaryStats['1M'].DIFF_5s.MAX, 0),
                  diff5s_avg: common.pricisionFormat_Precision(summaryStats['1M'].DIFF_5s.AVG, 0),
                  ratio5s_min: common.pricisionFormat_Precision(summaryStats['1M'].RATIO_5s.MIN, 2),
                  ratio5s_max: common.pricisionFormat_Precision(summaryStats['1M'].RATIO_5s.MAX, 2),
                  ratio5s_avg: common.pricisionFormat_Precision(summaryStats['1M'].RATIO_5s.AVG, 2),
                },
                {
                  key: '1Y',
                  period: '1Y',
                  diff1s_min: common.pricisionFormat_Precision(summaryStats['1Y'].DIFF_1s.MIN, 0),
                  diff1s_max: common.pricisionFormat_Precision(summaryStats['1Y'].DIFF_1s.MAX, 0),
                  diff1s_avg: common.pricisionFormat_Precision(summaryStats['1Y'].DIFF_1s.AVG, 0),
                  ratio1s_min: common.pricisionFormat_Precision(summaryStats['1Y'].RATIO_1s.MIN, 2),
                  ratio1s_max: common.pricisionFormat_Precision(summaryStats['1Y'].RATIO_1s.MAX, 2),
                  ratio1s_avg: common.pricisionFormat_Precision(summaryStats['1Y'].RATIO_1s.AVG, 2),
                  diff5s_min: common.pricisionFormat_Precision(summaryStats['1Y'].DIFF_5s.MIN, 0),
                  diff5s_max: common.pricisionFormat_Precision(summaryStats['1Y'].DIFF_5s.MAX, 0),
                  diff5s_avg: common.pricisionFormat_Precision(summaryStats['1Y'].DIFF_5s.AVG, 0),
                  ratio5s_min: common.pricisionFormat_Precision(summaryStats['1Y'].RATIO_5s.MIN, 2),
                  ratio5s_max: common.pricisionFormat_Precision(summaryStats['1Y'].RATIO_5s.MAX, 2),
                  ratio5s_avg: common.pricisionFormat_Precision(summaryStats['1Y'].RATIO_5s.AVG, 2),
                },
              ]}
              pagination={false}
              size="small"
              bordered
              style={{ width: '100%' }}
            />
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
        {/* <div style={{ marginTop: "10px", marginBottom: "10px", padding: "10px", backgroundColor: "#f9f9f9", border: "1px solid #d9d9d9" }}>
          <div style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "5px" }}>실시간 지수</div>
        </div> */}
        <div className="thbit-trade-table-container" data-simplebar style={{ height: "100%", marginTop: "10px" }}>

           <Table 
            columns={columns}
            dataSource={index_list.slice(0, 100)}
            rowKey={(record) => `${record.createdAt}`}
            pagination={false}
            loading={loading}
            scroll={{ y: 500, x: 'max-content' }}
            style={{ height: "100%" }}
            // summary={() => (
            //   <Table.Summary fixed="top">
            //       <Table.Summary.Row>
            //         <Table.Summary.Cell index={0} rowSpan={2} align="center">
            //           <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            //             <Tag color="blue" style={{ fontSize: "14px", marginBottom: "10px" }}>ROWCOUNT</Tag>
            //           </div>
            //           {/* <br /> */}
            //           <span style={{ fontSize: "14px", display: "flex", justifyContent: "center", alignItems: "center" }}>
            //             {index_list?.length} / {total_count}
            //           </span>
            //         </Table.Summary.Cell>
            //         <Table.Summary.Cell index={1} colSpan={7} rowSpan={2} align="center">
            //           <Tag color="processing">표기규칙</Tag>
            //           no_data(데이터없음) stale(30초간 변동없음) crossed(매수호가/매도호가 역전)
            //         </Table.Summary.Cell>
            //         <Table.Summary.Cell index={9} align="right">
            //           <Tag color="blue">MIN</Tag>
            //           <span style={{ color: min_max_info.MIN_DIFF_1 === 0 ? 'black' : min_max_info.MIN_DIFF_1 < 0 ? 'blue' : 'red' }}>
            //             {common.pricisionFormat_Precision(min_max_info.MIN_DIFF_1, 0)}
            //           </span>
            //         </Table.Summary.Cell>
            //         <Table.Summary.Cell index={10} align="right">
            //           <Tag color="blue">MIN</Tag>
            //           <span style={{ color: min_max_info.MIN_DIFF_2 === 0 ? 'black' : min_max_info.MIN_DIFF_2 < 0 ? 'blue' : 'red' }}>
            //             {common.pricisionFormat_Precision(min_max_info.MIN_DIFF_2, 0)}
            //           </span>
            //         </Table.Summary.Cell>
            //         <Table.Summary.Cell index={11} align="right">
            //           <Tag color="blue">MIN</Tag>
            //           <span style={{ color: min_max_info.MIN_DIFF_3 === 0 ? 'black' : min_max_info.MIN_DIFF_3 < 0 ? 'blue' : 'red' }}>
            //             {common.pricisionFormat_Precision(min_max_info.MIN_DIFF_3, 0)}
            //           </span>
            //         </Table.Summary.Cell>
            //         <Table.Summary.Cell index={12} align="right">
            //           <Tag color="green">AVG</Tag>
            //           <span style={{ color: min_max_info.AVG_RATIO_1 === 0 ? 'black' : min_max_info.AVG_RATIO_1 < 0 ? 'blue' : 'green' }}>
            //             {common.pricisionFormat_Precision(min_max_info.AVG_RATIO_1, 4)}
            //           </span>
            //         </Table.Summary.Cell>
            //         <Table.Summary.Cell index={13} align="right">
            //           <Tag color="green">AVG</Tag>
            //           <span style={{ color: min_max_info.AVG_RATIO_2 === 0 ? 'black' : min_max_info.AVG_RATIO_2 < 0 ? 'blue' : 'green' }}>
            //             {common.pricisionFormat_Precision(min_max_info.AVG_RATIO_2, 4)}
            //           </span>
            //         </Table.Summary.Cell>
            //         <Table.Summary.Cell index={14} align="right">
            //           <Tag color="green">AVG</Tag>
            //           <span style={{ color: min_max_info.AVG_RATIO_3 === 0 ? 'black' : min_max_info.AVG_RATIO_3 < 0 ? 'blue' : 'green' }}>
            //             {common.pricisionFormat_Precision(min_max_info.AVG_RATIO_3, 4)}
            //           </span>
            //         </Table.Summary.Cell>
            //       </Table.Summary.Row>
            //       <Table.Summary.Row>
            //         <Table.Summary.Cell index={9} align="right">
            //           <Tag color="red">MAX</Tag>
            //           <span style={{ color: min_max_info.MAX_DIFF_1 === 0 ? 'black' : min_max_info.MAX_DIFF_1 < 0 ? 'blue' : 'red' }}>
            //             {common.pricisionFormat_Precision(min_max_info.MAX_DIFF_1, 0)}
            //           </span>
            //         </Table.Summary.Cell>
            //         <Table.Summary.Cell index={10} align="right">
            //           <Tag color="red">MAX</Tag>
            //           <span style={{ color: min_max_info.MAX_DIFF_2 === 0 ? 'black' : min_max_info.MAX_DIFF_2 < 0 ? 'blue' : 'red' }}>
            //             {common.pricisionFormat_Precision(min_max_info.MAX_DIFF_2, 0)}
            //           </span>
            //         </Table.Summary.Cell>
            //         <Table.Summary.Cell index={11} align="right">
            //           <Tag color="red">MAX</Tag>
            //           <span style={{ color: min_max_info.MAX_DIFF_3 === 0 ? 'black' : min_max_info.MAX_DIFF_3 < 0 ? 'blue' : 'red' }}>
            //             {common.pricisionFormat_Precision(min_max_info.MAX_DIFF_3, 0)}
            //           </span>
            //         </Table.Summary.Cell>
            //         <Table.Summary.Cell index={12} align="right">
            //           <Tag color="red">MAX</Tag>
            //           <span style={{ color: min_max_info.MAX_RATIO_1 === 0 ? 'black' : min_max_info.MAX_RATIO_1 < 0 ? 'blue' : 'red' }}>
            //             {common.pricisionFormat_Precision(min_max_info.MAX_RATIO_1, 4)}
            //           </span>
            //         </Table.Summary.Cell>
            //         <Table.Summary.Cell index={13} align="right">
            //           <Tag color="red">MAX</Tag>
            //           <span style={{ color: min_max_info.MAX_RATIO_2 === 0 ? 'black' : min_max_info.MAX_RATIO_2 < 0 ? 'blue' : 'red' }}>
            //             {common.pricisionFormat_Precision(min_max_info.MAX_RATIO_2, 4)}
            //           </span>
            //         </Table.Summary.Cell>
            //         <Table.Summary.Cell index={14} align="right">
            //           <Tag color="red">MAX</Tag>
            //           <span style={{ color: min_max_info.MAX_RATIO_3 === 0 ? 'black' : min_max_info.MAX_RATIO_3 < 0 ? 'blue' : 'red' }}>
            //             {common.pricisionFormat_Precision(min_max_info.MAX_RATIO_3, 4)}
            //           </span>
            //         </Table.Summary.Cell>
                    
            //       </Table.Summary.Row>
            //   </Table.Summary>
            // )}
          /> 
        </div>
      </>
      )}
      {tab_idx === 1 && (
        <div className="thbit-trade-table-container" data-simplebar style={{ height: "100%" }}>
          <MultiExchangeChart data={[...index_list].reverse()} height={550} />
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
            marginTop: "100px",
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
            marginTop: "-65px",
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
