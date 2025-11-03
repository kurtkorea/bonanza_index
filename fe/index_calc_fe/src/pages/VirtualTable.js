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
    { scrollbarSize = 0, ref = { current: {} }, onScroll = () => {} } = {}
  ) => {
    // 실제 dataSource를 사용 (rawData가 빈 배열일 경우 대비)
    const actualData = Array.isArray(dataSource) && dataSource.length > 0 ? dataSource : rawData;
    const safeData = Array.isArray(actualData) ? actualData : [];

    ref.current = {
      scrollLeft: {
        get: () => null,
        set: (scrollLeft) => {
          if (listRef.current) {
            listRef.current.scrollTo(scrollLeft);
          }
        },
      },
    };

    return (
      <List
        listRef={listRef}
        defaultHeight={scroll?.y || 600}
        rowCount={safeData.length}
        rowHeight={60}
        rowComponent={Row}
        rowProps={{
          columns: mergedColumns,
          dataSource: safeData,
        }}
        overscanCount={5}
        style={{ overflowX: 'auto' }}
      />
    );
  }, [mergedColumns, scroll, dataSource]);

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
