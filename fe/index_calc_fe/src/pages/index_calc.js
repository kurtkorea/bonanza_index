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

  const [data, setData] = useState({});

  const index_list = useSelector(state => state.IndexReducer.index_data);

  useEffect(() => {
    onClickSearch();
  }, []);

  const onClickSearch = async () => {
    try {
      const res = await axios.get( process.env.SERVICE + "/v1/index_calc", {
        params: {
          from_date: range[0].format('YYYY-MM-DD'),
          to_date: range[1].format('YYYY-MM-DD'),
          page: 1,
          size: 500
        }
      });
      dispatch({ type: "fkbrti/init", payload: res.data });
      // console.log("조회 결과:", res.data);
      // setData(res.data);
      // 필요시 여기서 상태 업데이트 등 추가 작업 가능
    } catch (err) {
      console.error("조회 실패:", err);
    }
  };

	return (
		<>
      <div className="thbit-trade-inlineform antd-style" style={{ height: "50px", padding: "5px" }}>
        {/* 날짜 선택기 추가 */}

        <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
          <div style={{ flex: 1, display: "flex", justifyContent: "left", alignItems: "center" }}>
            <span style={{ fontSize: "16px" }}>
              표기규칙 : no_data(데이터없음) stale(30초간 변동없음) crossed(매수호가/매도호가 역전)
            </span>
          </div>
          <RangePicker className="inp date" style={{ width: "220px", marginRight: "15px" }} defaultValue={range} inputreadOnly={true} onCalendarChange={setRange} />
          <button type="button" className="btn" onClick={onClickSearch} style={{ height: "40px", lineHeight: "40px", marginRight: "5px" }}>
            조회
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
                  // console.log(expected_status);
                  if (expected_status.reason == "ok") {
                    sum += expected_status.price;
                    count++;
                  }
                }
                // console.log(sum, count);
                new_item.ACTUAL_AVG = common.pricisionFormat_Precision(sum / count, 0);

                console.log(new_item);

                new_datalist.push(new_item);
                seq ++;
                // console.log(item);
              }
              common.exportExcel(columns_excel, new_datalist, "index_calc");

            } catch (err) {
              console.error("조회 실패:", err);
            }

            // common.exportExcel(columns, index_list.datalist, "index_calc");
            /*
            if (!index_list?.datalist || index_list.datalist.length === 0) {
              alert("엑셀로 내보낼 데이터가 없습니다.");
              return;
            }
            // 엑셀 데이터 생성
            const headers = Object.keys(index_list.datalist[0]);
            const rows = index_list.datalist.map(row =>
              headers.map(h => row[h])
            );
            let csvContent =
              "\uFEFF" +
              headers.join(",") +
              "\n" +
              rows.map(e => e.map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(",")).join("\n");

            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `index_calc_${moment().format("YYYYMMDD_HHmmss")}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            */
          }}
        >
          엑셀
        </button>


        </div>
      </div>
			<div className="thbit-trade-table-container" data-simplebar style={{ height: "100%" }}>
        <Table 
          columns={columns}
          dataSource={index_list.datalist}
          rowKey={(record) => `${record.createdAt}`}
          pagination={false}
          scroll={{ y: 1100, x: 'max-content' }}
          
        />
			</div>
		</>
	);
};


export default IndexCalcTable;
