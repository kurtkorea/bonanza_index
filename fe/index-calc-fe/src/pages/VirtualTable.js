import React, { useState, useRef, useMemo, useCallback, memo } from "react";
import { Table, Tag } from "antd";
import { useSelector } from "react-redux";
import { List } from "react-window";
import ResizeObserver from "rc-resize-observer";
import "./VirtualTable.css";
import common from "../common";

// 개별 행 컴포넌트 - React.memo로 최적화
const Row = memo(({ index, style, columns, dataSource }) => {
  const record = dataSource[index];
  
  if (!record) return null;

  return (
    <div
      className="virtual-table-row"
      style={{
        ...style,
        display: "flex",
        borderBottom: "1px solid #f0f0f0",
        alignItems: "center",
        minHeight: "40px",
      }}
    >
      {columns.map((column, colIndex) => {
        const text = record[column.dataIndex];
        const content = column.render 
          ? column.render(text, record, index)
          : text ?? "";

        return (
          <div
            key={column.key || colIndex}
            style={{
              width: column.width || 100,
              minWidth: column.width || 100,
              maxWidth: column.width || 100,
              padding: "6px 8px",
              boxSizing: "border-box",
              textAlign: column.align || "left",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              textOverflow: "ellipsis",
              wordBreak: "break-word",
              lineHeight: "1.5",
              flex: column.width ? `0 0 ${column.width}px` : "1",
            }}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
});

Row.displayName = 'VirtualTableRow';

const VirtualTable = ({
  columns = [],
  scroll = { y: 600, x: 1200 },
  dataSource = [],
  rowKey,
  loading,
  summary,
}) => {
  const [tableWidth, setTableWidth] = useState(0);
  const listRef = useRef();

  const min_max_info = useSelector(state => state.IndexReducer.MIN_MAX_INFO);

  const mergedColumns = useMemo(() => {
    if (!Array.isArray(columns)) return [];
    const noWidthCols = columns.filter((col) => !col.width).length || 1;
    return columns.map((col) =>
      col.width
        ? col
        : { ...col, width: Math.floor(tableWidth / noWidthCols) }
    );
  }, [columns, tableWidth]);

  const renderVirtualList = useCallback((
    rawData = [],
    { scrollbarSize = 0, ref = { current: null }, onScroll = () => {} } = {}
  ) => {
    // 실제 dataSource를 사용 (rawData가 빈 배열일 경우 대비)
    const actualData = Array.isArray(dataSource) && dataSource.length > 0 ? dataSource : rawData;
    const safeData = Array.isArray(actualData) ? actualData : [];

    // Ant Design Table의 scrollLeft 참조를 안전하게 처리
    // ref가 없거나 current가 null인 경우를 대비
    if (!ref) {
      ref = { current: null };
    }
    
    // ref.current가 null이면 빈 객체로 초기화 (Ant Design Table이 사용할 수 있도록)
    if (!ref.current) {
      ref.current = {};
    }
    
    // scrollLeft getter/setter를 안전하게 설정
    // Ant Design Table이 ref.current.scrollLeft를 읽을 때 에러가 발생하지 않도록
    if (ref.current && typeof ref.current === 'object') {
      try {
        // 이미 정의되어 있으면 재정의하지 않음
        if (!('scrollLeft' in ref.current)) {
          Object.defineProperty(ref.current, 'scrollLeft', {
            get: () => {
              // react-window의 List는 scrollLeft를 직접 제공하지 않으므로 0 반환
              // Ant Design Table이 scrollLeft를 읽을 때 null이 아닌 값을 반환해야 함
              if (listRef.current?._outerRef) {
                return listRef.current._outerRef.scrollLeft || 0;
              }
              return 0;
            },
            set: (scrollLeft) => {
              if (listRef.current && typeof scrollLeft === 'number' && scrollLeft >= 0) {
                try {
                  // react-window List의 외부 컨테이너를 스크롤
                  const container = listRef.current?._outerRef;
                  if (container) {
                    container.scrollLeft = scrollLeft;
                  }
                } catch (e) {
                  console.warn('VirtualTable scrollTo error:', e);
                }
              }
            },
            enumerable: true,
            configurable: true,
          });
        }
      } catch (e) {
        // Object.defineProperty가 실패하면 일반 속성으로 설정
        if (ref.current) {
          ref.current.scrollLeft = 0;
        }
      }
    }

    // tableWidth가 0이면 기본값 사용 (초기 렌더링 시)
    const listWidth = tableWidth > 0 ? tableWidth : (scroll?.x || 1200);
    
    if (!safeData || safeData.length === 0) {
      return null;
    }

    return (
      <List
        listRef={listRef}
        defaultHeight={scroll?.y || 600}
        rowCount={safeData.length}
        rowHeight={60}
        width={listWidth}
        overscanCount={5}
        rowComponent={(props) => {
          const { index, style, ariaAttributes, ...restProps } = props || {};
          
          // props가 유효하지 않으면 null 반환
          if (typeof index !== 'number' || index < 0 || index >= safeData.length) {
            return null;
          }
          
          return (
            <Row
              index={index}
              style={style || {}}
              columns={mergedColumns}
              dataSource={safeData}
              ariaAttributes={ariaAttributes}
              {...restProps}
            />
          );
        }}
        rowProps={{}}
      />
    );
  }, [mergedColumns, scroll, dataSource, tableWidth]);

  return (
    <ResizeObserver onResize={({ width }) => setTableWidth(width)}>
      <div className="virtual-table-container">
        {/* {summary && (
          <div style={{ 
            borderTop: '2px solid #f0f0f0',
            background: '#fafafa',
            padding: '8px 16px',
            display: 'flex',
            gap: '20px',
          }}>
            {summary()}
          </div>
        )}         */}
        <Table
          rowKey={rowKey}
          columns={mergedColumns}
          dataSource={[]}
          pagination={false}
          loading={loading}
          components={{ body: renderVirtualList }}
          scroll={scroll}
          summary={() => {
            // 컬럼 너비 계산 (colSpan 포함)
            const getCellWidth = (startIdx, colSpan = 1) => {
              let width = 0;
              for (let i = startIdx; i < startIdx + colSpan && i < mergedColumns.length; i++) {
                width += mergedColumns[i]?.width || 100;
              }
              return width;
            };

            return (
              <Table.Summary fixed="top">
                <Table.Summary.Row>
                  <Table.Summary.Cell 
                    index={0} 
                    rowSpan={2} 
                    align="center"
                    style={{ width: getCellWidth(0, 1), minWidth: getCellWidth(0, 1) }}
                  >
                    ROWS : {dataSource?.length}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell 
                    index={1} 
                    colSpan={7} 
                    rowSpan={2} 
                    align="center"
                    style={{ width: getCellWidth(1, 7), minWidth: getCellWidth(1, 7) }}
                  >
                    <Tag color="processing">표기규칙</Tag>
                    no_data(데이터없음) stale(30초간 변동없음) crossed(매수호가/매도호가 역전)
                  </Table.Summary.Cell>
                  <Table.Summary.Cell 
                    index={9} 
                    align="right"
                    style={{ width: getCellWidth(9, 1), minWidth: getCellWidth(9, 1) }}
                  >
                    <Tag color="blue">MIN</Tag>
                    <span style={{ color: min_max_info.MIN_DIFF_1 === 0 ? 'black' : min_max_info.MIN_DIFF_1 < 0 ? 'blue' : 'red' }}>
                      {common.pricisionFormat_Precision(min_max_info.MIN_DIFF_1, 0)}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell 
                    index={10} 
                    align="right"
                    style={{ width: getCellWidth(10, 1), minWidth: getCellWidth(10, 1) }}
                  >
                    <Tag color="blue">MIN</Tag>
                    <span style={{ color: min_max_info.MIN_DIFF_2 === 0 ? 'black' : min_max_info.MIN_DIFF_2 < 0 ? 'blue' : 'red' }}>
                      {common.pricisionFormat_Precision(min_max_info.MIN_DIFF_2, 0)}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell 
                    index={11} 
                    align="right"
                    style={{ width: getCellWidth(11, 1), minWidth: getCellWidth(11, 1) }}
                  >
                    <Tag color="blue">MIN</Tag>
                    <span style={{ color: min_max_info.MIN_DIFF_3 === 0 ? 'black' : min_max_info.MIN_DIFF_3 < 0 ? 'blue' : 'red' }}>
                      {common.pricisionFormat_Precision(min_max_info.MIN_DIFF_3, 0)}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell 
                    index={12} 
                    align="right"
                    style={{ width: getCellWidth(12, 1), minWidth: getCellWidth(12, 1) }}
                  >
                    <Tag color="green">AVG</Tag>
                    <span style={{ color: min_max_info.AVG_RATIO_1 === 0 ? 'black' : min_max_info.AVG_RATIO_1 < 0 ? 'blue' : 'green' }}>
                      {common.pricisionFormat_Precision(min_max_info.AVG_RATIO_1, 4)}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell 
                    index={13} 
                    align="right"
                    style={{ width: getCellWidth(13, 1), minWidth: getCellWidth(13, 1) }}
                  >
                    <Tag color="green">AVG</Tag>
                    <span style={{ color: min_max_info.AVG_RATIO_2 === 0 ? 'black' : min_max_info.AVG_RATIO_2 < 0 ? 'blue' : 'green' }}>
                      {common.pricisionFormat_Precision(min_max_info.AVG_RATIO_2, 4)}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell 
                    index={14} 
                    align="right"
                    style={{ width: getCellWidth(14, 1), minWidth: getCellWidth(14, 1) }}
                  >
                    <Tag color="green">AVG</Tag>
                    <span style={{ color: min_max_info.AVG_RATIO_3 === 0 ? 'black' : min_max_info.AVG_RATIO_3 < 0 ? 'blue' : 'green' }}>
                      {common.pricisionFormat_Precision(min_max_info.AVG_RATIO_3, 4)}
                    </span>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
                <Table.Summary.Row>
                  <Table.Summary.Cell 
                    index={9} 
                    align="right"
                    style={{ width: getCellWidth(9, 1), minWidth: getCellWidth(9, 1) }}
                  >
                    <Tag color="red">MAX</Tag>
                    <span style={{ color: min_max_info.MAX_DIFF_1 === 0 ? 'black' : min_max_info.MAX_DIFF_1 < 0 ? 'blue' : 'red' }}>
                      {common.pricisionFormat_Precision(min_max_info.MAX_DIFF_1, 0)}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell 
                    index={10} 
                    align="right"
                    style={{ width: getCellWidth(10, 1), minWidth: getCellWidth(10, 1) }}
                  >
                    <Tag color="red">MAX</Tag>
                    <span style={{ color: min_max_info.MAX_DIFF_2 === 0 ? 'black' : min_max_info.MAX_DIFF_2 < 0 ? 'blue' : 'red' }}>
                      {common.pricisionFormat_Precision(min_max_info.MAX_DIFF_2, 0)}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell 
                    index={11} 
                    align="right"
                    style={{ width: getCellWidth(11, 1), minWidth: getCellWidth(11, 1) }}
                  >
                    <Tag color="red">MAX</Tag>
                    <span style={{ color: min_max_info.MAX_DIFF_3 === 0 ? 'black' : min_max_info.MAX_DIFF_3 < 0 ? 'blue' : 'red' }}>
                      {common.pricisionFormat_Precision(min_max_info.MAX_DIFF_3, 0)}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell 
                    index={12} 
                    align="right"
                    style={{ width: getCellWidth(12, 1), minWidth: getCellWidth(12, 1) }}
                  >
                    <Tag color="red">MAX</Tag>
                    <span style={{ color: min_max_info.MAX_RATIO_1 === 0 ? 'black' : min_max_info.MAX_RATIO_1 < 0 ? 'blue' : 'red' }}>
                      {common.pricisionFormat_Precision(min_max_info.MAX_RATIO_1, 4)}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell 
                    index={13} 
                    align="right"
                    style={{ width: getCellWidth(13, 1), minWidth: getCellWidth(13, 1) }}
                  >
                    <Tag color="red">MAX</Tag>
                    <span style={{ color: min_max_info.MAX_RATIO_2 === 0 ? 'black' : min_max_info.MAX_RATIO_2 < 0 ? 'blue' : 'red' }}>
                      {common.pricisionFormat_Precision(min_max_info.MAX_RATIO_2, 4)}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell 
                    index={14} 
                    align="right"
                    style={{ width: getCellWidth(14, 1), minWidth: getCellWidth(14, 1) }}
                  >
                    <Tag color="red">MAX</Tag>
                    <span style={{ color: min_max_info.MAX_RATIO_3 === 0 ? 'black' : min_max_info.MAX_RATIO_3 < 0 ? 'blue' : 'red' }}>
                      {common.pricisionFormat_Precision(min_max_info.MAX_RATIO_3, 4)}
                    </span>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </div>
    </ResizeObserver>
  );
};

// VirtualTable 전체를 memo로 감싸서 props 변경 시에만 리렌더링
export default memo(VirtualTable, (prevProps, nextProps) => {
  return (
    prevProps.dataSource === nextProps.dataSource &&
    prevProps.columns === nextProps.columns &&
    prevProps.loading === nextProps.loading &&
    prevProps.scroll === nextProps.scroll
  );
});
