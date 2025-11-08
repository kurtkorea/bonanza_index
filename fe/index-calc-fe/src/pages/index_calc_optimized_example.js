/**
 * 최적화된 Index Calc 컴포넌트 예시
 * 
 * 최적화 포인트:
 * 1. 컬럼 정의를 컴포넌트 밖으로 이동 (재생성 방지)
 * 2. 데이터 변환을 미리 수행 (렌더링 시 재계산 방지)
 * 3. useMemo, useCallback으로 메모이제이션
 * 4. VirtualTable 사용으로 대량 데이터 처리
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button, Tag, Table } from "antd";
import axios from "axios";
import moment from "moment";
import classNames from "classnames";
import { useDispatch, useSelector } from "react-redux";
import common from "../common";
import VirtualTable from "./VirtualTable";
import MultiExchangeChart from "./index_chart";
import CorrelationTable from "./index_correlation";
import VolatilityTable from "./index_volatility";
import { optimizedColumns } from "./index_calc_optimized_columns";
import { transformIndexCalcData, calculateStats } from "./index_calc_data_transformer";

const IndexCalcTableOptimized = () => {
  const dispatch = useDispatch();
  const min_max_info = useSelector((s) => s.IndexReducer.MIN_MAX_INFO);
  const [tabIdx, setTabIdx] = useState(0);
  const [rawData, setRawData] = useState([]); // 원본 데이터
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, size: 1000, hasNext: false });

  // 데이터 변환 (useMemo로 캐싱)
  const transformedData = useMemo(() => {
    return transformIndexCalcData(rawData);
  }, [rawData]);

  // 통계 계산 (useMemo로 캐싱)
  const stats = useMemo(() => {
    return calculateStats(transformedData);
  }, [transformedData]);

  // 통계를 Redux에 업데이트
  useEffect(() => {
    if (transformedData.length > 0) {
      dispatch({ type: "fkbrti/update_min_max_info", payload: stats });
    }
  }, [stats, dispatch, transformedData.length]);

  // 데이터 조회 (useCallback으로 메모이제이션)
  const fetchData = useCallback(async (page = 1, size = 1000) => {
    setLoading(true);
    try {
      const { data: res } = await axios.get(process.env.SERVICE + "/v1/index_calc", {
        params: {
          from_date: "2025-10-01",
          to_date: moment().format("YYYY-MM-DD"),
          page,
          size,
        },
      });

      if (!res.datalist || !Array.isArray(res.datalist)) {
        console.warn("데이터가 없거나 형식이 올바르지 않습니다.");
        setRawData([]);
        setPagination({ page: 1, size: 1000, hasNext: false });
        return;
      }

      // 원본 데이터 저장 (변환은 useMemo에서 자동으로 처리)
      setRawData((prev) => (page === 1 ? res.datalist : [...prev, ...res.datalist]));
      setPagination(res.pagination || { page, hasNext: false });
    } catch (err) {
      console.error("조회 실패:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 초기 데이터 로드
  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  // Summary 컴포넌트 (useMemo로 메모이제이션)
  const summaryComponent = useMemo(() => {
    return () => (
      <>
        <div>
          <Tag color="blue">MIN</Tag>
          <span style={{ marginLeft: '8px', fontWeight: 'bold' }}>
            {common.pricisionFormat_Precision(min_max_info.MIN_DIFF_1, 0)}
          </span>
        </div>
        <div>
          <Tag color="red">MAX</Tag>
          <span style={{ marginLeft: '8px', fontWeight: 'bold' }}>
            {common.pricisionFormat_Precision(min_max_info.MAX_DIFF_1, 0)}
          </span>
        </div>
        <div>
          <Tag color="green">AVG</Tag>
          <span style={{ marginLeft: '8px', fontWeight: 'bold' }}>
            {common.pricisionFormat_Precision(min_max_info.AVG_RATIO_1, 4)}%
          </span>
        </div>
      </>
    );
  }, [min_max_info]);

  return (
    <>
      {/* 상단 버튼 */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "5px" }}>
        <Button onClick={() => fetchData(1)} type="primary" style={{ marginRight: 8 }}>
          조회
        </Button>
        <Button
          onClick={() => pagination.hasNext && fetchData(pagination.page + 1)}
          disabled={!pagination.hasNext}
        >
          다음 페이지
        </Button>
      </div>

      {/* 탭 */}
      <div className="thbit-index-tab">
        {["HISTORY", "CHART", "CORRELATION", "VOLATILITY"].map((t, i) => (
          <a
            key={i}
            className={classNames("tab", { on: tabIdx === i })}
            onClick={() => setTabIdx(i)}
          >
            {t}
          </a>
        ))}
      </div>

      {/* 테이블 - VirtualTable 사용 */}
      {tabIdx === 0 && (
        <VirtualTable
          columns={optimizedColumns}
          dataSource={transformedData}
          rowKey="createdAt"
          loading={loading}
          scroll={{ y: 740, x: "max-content" }}
          summary={summaryComponent}
        />
      )}

      {/* 차트 */}
      {tabIdx === 1 && (
        <div style={{ height: "5px" }}>
          <MultiExchangeChart data={[...transformedData].reverse()} height={740} />
        </div>
      )}

      {/* 상관관계 */}
      {tabIdx === 2 && (
        <CorrelationTable
          data={transformedData}
          columns={[
            { key: "fkbrti_1s" },
            { key: "fkbrti_5s" },
            { key: "fkbrti_10s" },
            { key: "BITTHUMB" },
            { key: "UPBIT" },
            { key: "ACTUAL_AVG" },
          ]}
        />
      )}

      {/* 변동성 */}
      {tabIdx === 3 && (
        <VolatilityTable
          rows={transformedData}
          columns={[
            { key: "fkbrti_1s" },
            { key: "BITTHUMB" },
            { key: "UPBIT" },
          ]}
          stepSec={1}
          decimals={2}
        />
      )}
    </>
  );
};

export default IndexCalcTableOptimized;

