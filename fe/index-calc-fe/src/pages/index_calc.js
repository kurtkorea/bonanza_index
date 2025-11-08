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
    dataIndex: 'diff_1',
    key: 'diff_1',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
      let color = record.diff_1 === 0 ? 'black' : record.diff_1 < 0 ? 'blue' : 'red';
      return (
        <span style={{ color }}>
          {common.pricisionFormat_Precision(record.diff_1, 0)}
        </span>
      );
    },
  },
  {
    title: 'DIFF-5s',
    dataIndex: 'diff_5',
    key: 'diff_5',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
      let color = record.DIFF_1 === 0 ? 'black' : record.DIFF_1 < 0 ? 'blue' : 'red';
      return (
        <span style={{ color }}>
          {common.pricisionFormat_Precision(record.diff_5, 0)}
        </span>
      );
    },
  },
  {
    title: 'DIFF-10s',
    dataIndex: 'diff_10',
    key: 'diff_10',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
      let color = record.diff_10 === 0 ? 'black' : record.diff_10 < 0 ? 'blue' : 'red';
      return (
        <span style={{ color }}>
          {common.pricisionFormat_Precision(record.diff_10, 0)}
        </span>
      );
    },
  },
  {
    title: 'RATIO-1s',
    dataIndex: 'ratio_1',
    key: 'ratio_1',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
      let color = record.ratio_1 === 0 ? 'black' : record.ratio_1 < 0 ? 'blue' : 'red';
      return (
        <span style={{ color }}>
          {common.pricisionFormat_Precision(record.ratio_1, 2)}%
        </span>
      );
    },
  },
  {
    title: 'RATIO-5s',
    dataIndex: 'ratio_5',
    key: 'ratio_5',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
          let color = record.ratio_5 === 0 ? 'black' : record.ratio_5 < 0 ? 'blue' : 'red';
      return (
        <span style={{ color }}>
          {common.pricisionFormat_Precision(record.ratio_5, 2)}%
        </span>
      );
    },
  },
  {
    title: 'RATIO-10s',
    dataIndex: 'ratio_10',
    key: 'ratio_10',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => {
      let color = record.ratio_10 === 0 ? 'black' : record.ratio_10 < 0 ? 'blue' : 'red';
      return (
        <span style={{ color }}>
          {common.pricisionFormat_Precision(record.ratio_10, 2)}%
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

const IndexCalcTable = () => {
  const queryClient = useQueryClient();
  const defaultRange = [moment().subtract(3, 'months'), moment()];
  
  const [range, setRange] = useState(defaultRange);
  const dispatch = useDispatch();

  const [tab_idx, setTabIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const index_list = useSelector(state => state.IndexReducer.index_data);
  const minMaxInfo = useSelector((state) => state.IndexReducer.MIN_MAX_INFO);
  const summaryStats = useSelector((state) => state.IndexReducer.summaryStats);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(500);
  const [totalCount, setTotalCount] = useState(0);
  const [pagination, setPagination] = useState({hasNext: false, hasPrev: false, page: 1, size: 500, totalCount: 0, totalPages: 0});

  // Fetch data with paging
  const fetchData = async (page = currentPage, size = pageSize) => 
  {
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
          diff_1: item.diff_1,
          diff_5: item.diff_5,
          diff_10: item.diff_10,
          ratio_1: item.ratio_1,
          ratio_5: item.ratio_5,
          ratio_10: item.ratio_10,
          actual_avg: item.actual_avg,
        };

        let sum = 0;
        let count = 0;
        for (const expected_status of item.expected_status) {
          if (expected_status.reason == "ok") {
            sum += expected_status.price;
            count++;
          }
        }

        new_datalist.push(new_item);
      }

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

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      // 데이터 가공하여 Redux의 summaryStats 구조에 맞는 statsMap 생성
      const periodMap = {
        "1d": "1D",
        "1w": "1W",
        "1m": "1M",
        "1y": "1Y"
      };

      // API로 부터 통계 데이터 요청
      let statsRes;
      try {
        statsRes = await axios.get(process.env.SERVICE + "/v1/index_calc/stats");
      } catch (err) {
        console.error("통계 데이터 요청 실패:", err);
        setStatsLoading(false);
        return;
      }
      console.log("통계 API 응답:", statsRes.data);

      // 변환: { "interval": "1d", "second": "1s", ... } -> statsMap[period] = { DIFF_1s, RATIO_1s, DIFF_5s, ... }
      if (statsRes.data.result && Array.isArray(statsRes.data.stats)) {
        // Redux 구조에 맞는 statsMap 만들기
        const statsMap = {};

        // 이중 루프 없이 한번의 순회로 완성
        statsRes.data.stats.forEach(stat => {
          const period = periodMap[String(stat.interval).toLowerCase()] || stat.interval;
          if (!statsMap[period]) {
            statsMap[period] = {
              DIFF_1s: { MIN: 0, MAX: 0, AVG: 0 },
              RATIO_1s: { MIN: 0, MAX: 0, AVG: 0 },
              DIFF_5s: { MIN: 0, MAX: 0, AVG: 0 },
              RATIO_5s: { MIN: 0, MAX: 0, AVG: 0 },
              DIFF_10s: { MIN: 0, MAX: 0, AVG: 0 },
              RATIO_10s: { MIN: 0, MAX: 0, AVG: 0 },
            };
          }

          if (stat.second === "1s") {
            statsMap[period].DIFF_1s = {
              MIN: stat.diff_min ?? 0,
              MAX: stat.diff_max ?? 0,
              AVG: stat.diff_avg ?? 0,
            };
            statsMap[period].RATIO_1s = {
              MIN: stat.ratio_min ?? 0,
              MAX: stat.ratio_max ?? 0,
              AVG: stat.ratio_avg ?? 0,
            };
          } else if (stat.second === "5s") {
            statsMap[period].DIFF_5s = {
              MIN: stat.diff_min ?? 0,
              MAX: stat.diff_max ?? 0,
              AVG: stat.diff_avg ?? 0,
            };
            statsMap[period].RATIO_5s = {
              MIN: stat.ratio_min ?? 0,
              MAX: stat.ratio_max ?? 0,
              AVG: stat.ratio_avg ?? 0,
            };
          } else if (stat.second === "10s") {
            statsMap[period].DIFF_10s = {
              MIN: stat.diff_min ?? 0,
              MAX: stat.diff_max ?? 0,
              AVG: stat.diff_avg ?? 0,
            };
            statsMap[period].RATIO_10s = {
              MIN: stat.ratio_min ?? 0,
              MAX: stat.ratio_max ?? 0,
              AVG: stat.ratio_avg ?? 0,
            };
          }
        });

        console.log ( "statsMap", statsMap );

        console.log("변환된 통계 데이터(statsMap):", statsMap);
        dispatch({ type: "fkbrti/set_stats", payload: statsMap });
      } else {
        console.warn("통계 데이터 형식이 올바르지 않습니다:", res.data);
      }

    } catch (error) {
      console.error("통계 조회 실패:", error);
    } finally {
      setStatsLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    fetchData(1, pageSize);
    fetchStats();
    setCurrentPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, pageSize, fetchStats]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchStats();
    }, 60_000);

    return () => clearInterval(intervalId);
  }, [fetchStats]);

  useEffect(() => {
    const stats1D = {
      DIFF_1s: { MIN: minMaxInfo.MIN_DIFF_1 || 0, MAX: minMaxInfo.MAX_DIFF_1 || 0, AVG: minMaxInfo.AVG_DIFF_1 || 0 },
      RATIO_1s: { MIN: minMaxInfo.MIN_RATIO_1 || 0, MAX: minMaxInfo.MAX_RATIO_1 || 0, AVG: minMaxInfo.AVG_RATIO_1 || 0 },
      DIFF_5s: { MIN: minMaxInfo.MIN_DIFF_2 || 0, MAX: minMaxInfo.MAX_DIFF_2 || 0, AVG: minMaxInfo.AVG_DIFF_2 || 0 },
      RATIO_5s: { MIN: minMaxInfo.MIN_RATIO_2 || 0, MAX: minMaxInfo.MAX_RATIO_2 || 0, AVG: minMaxInfo.AVG_RATIO_2 || 0 },
    };
    dispatch({ type: 'fkbrti/set_stats', payload: { '1D': stats1D } });
  }, [dispatch, minMaxInfo]);

  // 조회 버튼 클릭시 (항상 1페이지부터)
  const onClickSearch = async ( page = 1, size = pageSize ) => {
    setCurrentPage(page);
    fetchData(page, size);
    fetchStats();
  };

  const onClickTab = ({ currentTarget }) => {
    setTabIdx(parseInt(currentTarget.getAttribute("data")));
  };

	const handleFileDownload = useCallback(() => {
		if (!range?.[0] || !range?.[1]) {
			console.warn('[download] range not selected');
			return;
		}

		const params = new URLSearchParams({
			from_date: range[0].format('YYYY-MM-DD'),
			to_date: range[1].format('YYYY-MM-DD'),
		});

		const url = `${process.env.SERVICE}/v1/file_download?${params.toString()}`;
		const filename = `fkbrti_export_${range[0].format('YYYY-MM-DD')}_${range[1].format('YYYY-MM-DD')}.csv`;

		setDownloadLoading(true);

		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.style.display = 'none';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		setTimeout(() => {
			setDownloadLoading(false);
		}, 4000);
	}, [range]);

  return (
    <div style={{ width: "100%" }}>
      <div className="thbit-trade-list" style={{ width: "100%" }}>
        {/* 상단 조회 및 통계 섹션 */}
        <div style={{ 
          border: "1px solid #d9d9d9", 
          padding: "15px", 
          marginBottom: "10px",
          backgroundColor: "#fafafa",
          width: "100%",
          boxSizing: "border-box"
        }}>
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            marginBottom: "15px",
            width: "100%",
            boxSizing: "border-box",
            justifyContent: "flex-end"
          }}>
            <Button
              type="primary"
              onClick={async () => {
                onClickSearch(1, pageSize);
              }}
            >
              조회
            </Button>
            {/* <Button
              onClick={async () => {
                if ( pagination?.hasNext ) {
                  onClickSearch(currentPage + 1, pageSize);
                }
              }}
              disabled={!pagination?.hasNext}
            >
              다음
            </Button> */}

            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "10px", marginRight: "10px" }}>
              <span style={{ fontSize: "12px", color: "#666", whiteSpace: "nowrap" }}>다운로드 기간 (최대 3개월)</span>
              <RangePicker
                className="inp date"
                style={{ width: "220px" }}
                value={range}
                inputReadOnly={true}
                onChange={setRange}
                format="YYYY-MM-DD"
              />
            </div>

            <Button
              onClick={handleFileDownload}
              loading={downloadLoading}
              disabled={downloadLoading}
            >
              파일다운로드
            </Button>
          </div>

          {/* 통계 테이블 */}
          <div style={{ marginTop: "15px" }}>
            <Table
              loading={statsLoading}
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
                  title: <Tag color="green">DIFF-1s</Tag>,
                  align: 'center',
                  children: [
                    {
                      title: <Tag color="blue">MIN</Tag>,
                      dataIndex: 'diff1s_min',
                      key: 'diff1s_min',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: <Tag color="red">MAX</Tag>,
                      dataIndex: 'diff1s_max',
                      key: 'diff1s_max',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: <Tag color="orange">AVG</Tag>,
                      dataIndex: 'diff1s_avg',
                      key: 'diff1s_avg',
                      width: 80,
                      align: 'right',
                    },
                  ],
                },
                {
                  title: <Tag color="green">RATIO-1s</Tag>,
                  align: 'center',
                  children: [
                    {
                      title: <Tag color="blue">MIN</Tag>,
                      dataIndex: 'ratio1s_min',
                      key: 'ratio1s_min',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: <Tag color="red">MAX</Tag>,
                      dataIndex: 'ratio1s_max',
                      key: 'ratio1s_max',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: <Tag color="orange">AVG</Tag>,
                      dataIndex: 'ratio1s_avg',
                      key: 'ratio1s_avg',
                      width: 80,
                      align: 'right',
                    },
                  ],
                },
                {
                  title: <Tag color="green">DIFF-5s</Tag>,
                  align: 'center',
                  children: [
                    {
                      title: <Tag color="blue">MIN</Tag>,
                      dataIndex: 'diff5s_min',
                      key: 'diff5s_min',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: <Tag color="red">MAX</Tag>,
                      dataIndex: 'diff5s_max',
                      key: 'diff5s_max',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: <Tag color="orange">AVG</Tag>,
                      dataIndex: 'diff5s_avg',
                      key: 'diff5s_avg',
                      width: 80,
                      align: 'right',
                    },
                  ],
                },
                {
                  title: <Tag color="green">RATIO-5s</Tag>,
                  align: 'center',
                  children: [
                    {
                      title: <Tag color="blue">MIN</Tag>,
                      dataIndex: 'ratio5s_min',
                      key: 'ratio5s_min',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: <Tag color="red">MAX</Tag>,
                      dataIndex: 'ratio5s_max',
                      key: 'ratio5s_max',
                      width: 80,
                      align: 'right',
                    },
                    {
                      title: <Tag color="orange">AVG</Tag>,
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
                  diff1s_min: common.pricisionFormat_Precision(summaryStats['1D']?.DIFF_1s?.MIN || 0, 0),
                  diff1s_max: common.pricisionFormat_Precision(summaryStats['1D']?.DIFF_1s?.MAX || 0, 0),
                  diff1s_avg: common.pricisionFormat_Precision(summaryStats['1D']?.DIFF_1s?.AVG || 0, 0),
                  ratio1s_min: common.pricisionFormat_Precision(summaryStats['1D']?.RATIO_1s?.MIN || 0, 2),
                  ratio1s_max: common.pricisionFormat_Precision(summaryStats['1D']?.RATIO_1s?.MAX || 0, 2),
                  ratio1s_avg: common.pricisionFormat_Precision(summaryStats['1D']?.RATIO_1s?.AVG || 0, 2),
                  diff5s_min: common.pricisionFormat_Precision(summaryStats['1D']?.DIFF_5s?.MIN || 0, 0),
                  diff5s_max: common.pricisionFormat_Precision(summaryStats['1D']?.DIFF_5s?.MAX || 0, 0),
                  diff5s_avg: common.pricisionFormat_Precision(summaryStats['1D']?.DIFF_5s?.AVG || 0, 0),
                  ratio5s_min: common.pricisionFormat_Precision(summaryStats['1D']?.RATIO_5s?.MIN || 0, 2),
                  ratio5s_max: common.pricisionFormat_Precision(summaryStats['1D']?.RATIO_5s?.MAX || 0, 2),
                  ratio5s_avg: common.pricisionFormat_Precision(summaryStats['1D']?.RATIO_5s?.AVG || 0, 2),
                },
                {
                  key: '1W',
                  period: '1W',
                  diff1s_min: common.pricisionFormat_Precision(summaryStats['1W']?.DIFF_1s?.MIN || 0, 0),
                  diff1s_max: common.pricisionFormat_Precision(summaryStats['1W']?.DIFF_1s?.MAX || 0, 0),
                  diff1s_avg: common.pricisionFormat_Precision(summaryStats['1W']?.DIFF_1s?.AVG || 0, 0),
                  ratio1s_min: common.pricisionFormat_Precision(summaryStats['1W']?.RATIO_1s?.MIN || 0, 2),
                  ratio1s_max: common.pricisionFormat_Precision(summaryStats['1W']?.RATIO_1s?.MAX || 0, 2),
                  ratio1s_avg: common.pricisionFormat_Precision(summaryStats['1W']?.RATIO_1s?.AVG || 0, 2),
                  diff5s_min: common.pricisionFormat_Precision(summaryStats['1W']?.DIFF_5s?.MIN || 0, 0),
                  diff5s_max: common.pricisionFormat_Precision(summaryStats['1W']?.DIFF_5s?.MAX || 0, 0),
                  diff5s_avg: common.pricisionFormat_Precision(summaryStats['1W']?.DIFF_5s?.AVG || 0, 0),
                  ratio5s_min: common.pricisionFormat_Precision(summaryStats['1W']?.RATIO_5s?.MIN || 0, 2),
                  ratio5s_max: common.pricisionFormat_Precision(summaryStats['1W']?.RATIO_5s?.MAX || 0, 2),
                  ratio5s_avg: common.pricisionFormat_Precision(summaryStats['1W']?.RATIO_5s?.AVG || 0, 2),
                },
                {
                  key: '1M',
                  period: '1M',
                  diff1s_min: common.pricisionFormat_Precision(summaryStats['1M']?.DIFF_1s?.MIN || 0, 0),
                  diff1s_max: common.pricisionFormat_Precision(summaryStats['1M']?.DIFF_1s?.MAX || 0, 0),
                  diff1s_avg: common.pricisionFormat_Precision(summaryStats['1M']?.DIFF_1s?.AVG || 0, 0),
                  ratio1s_min: common.pricisionFormat_Precision(summaryStats['1M']?.RATIO_1s?.MIN || 0, 2),
                  ratio1s_max: common.pricisionFormat_Precision(summaryStats['1M']?.RATIO_1s?.MAX || 0, 2),
                  ratio1s_avg: common.pricisionFormat_Precision(summaryStats['1M']?.RATIO_1s?.AVG || 0, 2),
                  diff5s_min: common.pricisionFormat_Precision(summaryStats['1M']?.DIFF_5s?.MIN || 0, 0),
                  diff5s_max: common.pricisionFormat_Precision(summaryStats['1M']?.DIFF_5s?.MAX || 0, 0),
                  diff5s_avg: common.pricisionFormat_Precision(summaryStats['1M']?.DIFF_5s?.AVG || 0, 0),
                  ratio5s_min: common.pricisionFormat_Precision(summaryStats['1M']?.RATIO_5s?.MIN || 0, 2),
                  ratio5s_max: common.pricisionFormat_Precision(summaryStats['1M']?.RATIO_5s?.MAX || 0, 2),
                  ratio5s_avg: common.pricisionFormat_Precision(summaryStats['1M']?.RATIO_5s?.AVG || 0, 2),
                },
                {
                  key: '1Y',
                  period: '1Y',
                  diff1s_min: common.pricisionFormat_Precision(summaryStats['1Y']?.DIFF_1s?.MIN || 0, 0),
                  diff1s_max: common.pricisionFormat_Precision(summaryStats['1Y']?.DIFF_1s?.MAX || 0, 0),
                  diff1s_avg: common.pricisionFormat_Precision(summaryStats['1Y']?.DIFF_1s?.AVG || 0, 0),
                  ratio1s_min: common.pricisionFormat_Precision(summaryStats['1Y']?.RATIO_1s?.MIN || 0, 2),
                  ratio1s_max: common.pricisionFormat_Precision(summaryStats['1Y']?.RATIO_1s?.MAX || 0, 2),
                  ratio1s_avg: common.pricisionFormat_Precision(summaryStats['1Y']?.RATIO_1s?.AVG || 0, 2),
                  diff5s_min: common.pricisionFormat_Precision(summaryStats['1Y']?.DIFF_5s?.MIN || 0, 0),
                  diff5s_max: common.pricisionFormat_Precision(summaryStats['1Y']?.DIFF_5s?.MAX || 0, 0),
                  diff5s_avg: common.pricisionFormat_Precision(summaryStats['1Y']?.DIFF_5s?.AVG || 0, 0),
                  ratio5s_min: common.pricisionFormat_Precision(summaryStats['1Y']?.RATIO_5s?.MIN || 0, 2),
                  ratio5s_max: common.pricisionFormat_Precision(summaryStats['1Y']?.RATIO_5s?.MAX || 0, 2),
                  ratio5s_avg: common.pricisionFormat_Precision(summaryStats['1Y']?.RATIO_5s?.AVG || 0, 2),
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
        <div className="thbit-trade-table-container" data-simplebar style={{ height: "100%", marginTop: "10px" }}>          
          <Table 
            columns={columns}
            dataSource={index_list.slice(0, 100)}
            rowKey={(record) => `${record.createdAt}`}
            pagination={false}
            loading={loading}
            scroll={{ y: 500, x: 'max-content' }}
            style={{ height: "100%" }}
          /> 
        </div>
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
            marginTop: "10px",
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
              height={500}
            />
          </div>
        </div>
      )}
      {tab_idx === 3 && (
        <div
          className="thbit-trade-table-container flex justify-center"
          style={{
            minHeight: "400px",
            height: "100%",
            alignItems: "center",
            overflowY: "hidden",
            marginTop: "10px",
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
              stepSec={1}
              decimals={2}
              height={500}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default IndexCalcTable;
