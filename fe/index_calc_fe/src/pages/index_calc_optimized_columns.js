import React from "react";
import common from "../common";

// 재사용 가능한 render 함수들
const renderPrice = (text) => common.pricisionFormat_Precision(text, 0);
const renderDate = (text) => common.convertDateKST(text);

const renderDiff = (text, record, dataIndex) => {
  const value = record[dataIndex];
  const color = value === 0 ? 'black' : value < 0 ? 'blue' : 'red';
  return (
    <span style={{ color }}>
      {common.pricisionFormat_Precision(value, 0)}
    </span>
  );
};

const renderRatio = (text) => common.pricisionFormat_Precision(text, 4);

// 최적화된 컬럼 정의 (함수 밖에서 한 번만 생성)
export const optimizedColumns = [
  {
    title: 'TIME',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 180,
    align: 'center',
    fixed: 'left',
    render: renderDate,
  },
  {
    title: 'fkbrti-1s',
    dataIndex: 'fkbrti_1s',
    key: 'fkbrti_1s',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: renderPrice,
  },
  {
    title: 'fkbrti-5s',
    dataIndex: 'fkbrti_5s',
    key: 'fkbrti_5s',
    width: 100,
    align: 'center',
    fixed: 'left',
    render: renderPrice,
  },
  {
    title: 'fkbrti-10s',
    dataIndex: 'fkbrti_10s',
    key: 'fkbrti_10s',
    width: 100,
    align: 'center',
    fixed: 'left',
    render: renderPrice,
  },
  {
    title: 'BITTHUMB',
    dataIndex: 'BITTHUMB',
    key: 'BITTHUMB',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: renderPrice,
  },
  {
    title: 'COINONE',
    dataIndex: 'COINONE',
    key: 'COINONE',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: renderPrice,
  },
  {
    title: 'KORBIT',
    dataIndex: 'KORBIT',
    key: 'KORBIT',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: renderPrice,
  },
  {
    title: 'UPBIT',
    dataIndex: 'UPBIT',
    key: 'UPBIT',
    width: 100,
    align: 'center',
    fixed: 'left',
    render: renderPrice,
  },
  {
    title: 'ACTUAL-AVG',
    dataIndex: 'ACTUAL_AVG',  // 미리 계산된 값 사용
    key: 'ACTUAL_AVG',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: renderPrice,
  },
  {
    title: 'DIFF-1s',
    dataIndex: 'DIFF_1',
    key: 'DIFF_1',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => renderDiff(text, record, 'DIFF_1'),
  },
  {
    title: 'DIFF-5s',
    dataIndex: 'DIFF_2',
    key: 'DIFF_2',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => renderDiff(text, record, 'DIFF_2'),
  },
  {
    title: 'DIFF-10s',
    dataIndex: 'DIFF_3',
    key: 'DIFF_3',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: (text, record) => renderDiff(text, record, 'DIFF_3'),
  },
  {
    title: 'RATIO-1s',
    dataIndex: 'RATIO_1',
    key: 'RATIO_1',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: renderRatio,
  },
  {
    title: 'RATIO-5s',
    dataIndex: 'RATIO_2',
    key: 'RATIO_2',
    width: 100,
    align: 'right',
    fixed: 'left',
    render: renderRatio,
  },
  {
    title: 'RATIO-10s',
    dataIndex: 'RATIO_3',
    key: 'RATIO_3',
    width: 100,
    align: 'right',
    fixed: 'right',
    render: renderRatio,
  },
  // {
  //   title: '',
  //   // dataIndex: 'SCROLL',
  //   key: 'SCROLL',
  //   width: 1,
  //   align: 'right',
  //   fixed: 'left',
  //   render: renderRatio,
  // },
];

