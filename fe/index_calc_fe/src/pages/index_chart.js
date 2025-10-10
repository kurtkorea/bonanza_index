import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
  ReferenceLine,
} from "recharts";

/**
 * MultiExchangeChart (Plain React JS)
 * ------------------------------------------------------------
 * Drop‑in component for a multi‑series realtime line chart.
 * Uses Recharts + WebSocket (optional) to append data points.
 *
 * Props
 * -----
 * data: initial array of rows
 * wsUrl: optional WebSocket endpoint for streaming rows
 * parse: function(payload) => row  (optional, defaults to defaultParse)
 * maxPoints: sliding window size (default 3000)
 * throttleMs: batch append interval (default 120ms)
 * height: chart height (default 420)
 * xTickCount: number of x ticks (default 12)
 * showBrush: show bottom brush (default true)
 * className: wrapper className (Tailwind ready)
 */

// NOTE: "BITHUMB" 과 "BITTHUMB" 오타 일치 문제 있음.
const SERIES = [
  { key: "fkbrti_1s", name: "fkbrti-1s" },
  { key: "fkbrti_5s", name: "fkbrti-5s" },
  { key: "fkbrti_10s", name: "fkbrti-10s" },
  { key: "BITTHUMB", name: "BITTHUMB" },
  { key: "COINONE", name: "COINONE" },
  { key: "KORBIT", name: "KORBIT" },
  { key: "UPBIT", name: "UPBIT" },
  { key: "ACTUAL_AVG", name: "ACTUAL-AVG" },
];

const STROKES = {
  fkbrti_1s: "#3B82F6",
  fkbrti_5s: "#EA580C",
  fkbrti_10s: "#9CA3AF",
  BITTHUMB: "#F59E0B",
  COINONE: "#1D4ED8",
  KORBIT: "#10B981",
  UPBIT: "#93C5FD",
  ACTUAL_AVG: "#FCA5A5",
};

const humanNumber = (v) => {
  if (v == null) return "";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString();
};

function sanitizeData(raw) {
  if (!raw) return [];
  // "BITTHUMB" vs "BITHUMB" 오타 변환, seq 자동 부여
  let seq = 1;
  return raw.map((row) => {
    // row.seq가 없으면 자동 부여
    let newRow = {...row};
    if (!("seq" in newRow)) newRow.seq = seq++;
    // 오타 일치: "BITHUMB" → "BITTHUMB"
    if ('BITHUMB' in newRow && !('BITTHUMB' in newRow)) {
      newRow['BITTHUMB'] = newRow['BITHUMB'];
    }
    if ('BITTHUMB' in newRow && !('BITHUMB' in newRow)) {
      newRow['BITHUMB'] = newRow['BITTHUMB'];
    }
    return newRow;
  });
}

export default function MultiExchangeChart({
  data,
  wsUrl,
  parse = defaultParse,
  maxPoints = 3000,
  throttleMs = 120,
  height = 420,
  xTickCount = 12,
  showBrush = true,
  className = "",
}) {
  // 차트가 나오지 않는 현상 방지용: seq와 BITTHUMB 키 확인 및 오타 수정
  const [activeKeys, setActiveKeys] = useState(new Set(SERIES.map((s) => s.key)));
  const [seriesData, setSeriesData] = useState(sanitizeData(data));

  const bufferRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    setSeriesData(sanitizeData(data));
  }, [data]);

  const seriesToRender = useMemo(
    () => SERIES.filter((s) => activeKeys.has(s.key)),
    [activeKeys]
  );

  const onLegendClick = (o) => {
    // const k = o?.dataKey;
    // setActiveKeys((prev) => {
    //   const next = new Set(prev);
    //   next.has(k) ? next.delete(k) : next.add(k);
    //   return next;
    // });
  };

  // 차트 없음 방지: 데이터 없으면 안내 메시지
  if (!seriesData || !Array.isArray(seriesData) || seriesData.length === 0) {
    return (
      <div className={`w-full rounded-2xl bg-white p-4 shadow ${className}`}>
        <div className="text-center py-16 text-xl text-gray-400">차트에 표시할 데이터가 없습니다.</div>
      </div>
    );
  }

  return (
    <div className={`w-full rounded-2xl bg-white p-4 shadow ${className}`}>
      <div className="mb-3 flex items-end justify-between gap-4">
        {/* <h2 className="text-2xl font-bold tracking-tight">CHART</h2> */}
        {/* <div className="text-sm text-gray-500">Legend click = toggle series</div> */}
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={seriesData} margin={{ top: 80, right: 24, left: 24, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis
              dataKey="seq"
              tickMargin={8}
              minTickGap={18}
              interval="preserveStartEnd"
              ticks={smartTicks(seriesData, xTickCount)}
              tick={{ fontSize: 12 }}
            />

            <YAxis
              tickFormatter={humanNumber}
              tick={{ fontSize: 12 }}
              width={86}
              domain={["auto", "auto"]}
            />

            <Tooltip
              formatter={(value, name) => [humanNumber(value), legendName(name)]}
              labelFormatter={(l) => `Seq ${l}`}
              wrapperStyle={{ borderRadius: 12 }}
            />

            <Legend onClick={onLegendClick} wrapperStyle={{ paddingTop: 8 }} />

            <ReferenceLine y={avgY(seriesData)} stroke="#D1D5DB" strokeDasharray="3 3" ifOverflow="extendDomain" />

            {seriesToRender.map((s) => (
              <Line
                key={s.key}
                isAnimationActive={false}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={STROKES[s.key]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}

            {showBrush && (
              <Brush dataKey="seq" height={24} stroke="#9CA3AF" travellerWidth={8} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// --- Helpers ---------------------------------------------------------------
function legendName(raw) {
  const found = SERIES.find((s) => s.key === raw);
  return found ? found.name : raw;
}

function smartTicks(data, count) {
  if (!data || !data.length) return undefined;
  const n = data.length;
  if (n <= count) return data.map((d) => d.seq);
  const step = Math.max(1, Math.floor(n / count));
  const ticks = [];
  for (let i = 0; i < n; i += step) ticks.push(data[i].seq);
  if (ticks[ticks.length - 1] !== data[n - 1].seq) ticks.push(data[n - 1].seq);
  return ticks;
}

function avgY(data) {
  if (!data || !data.length) return undefined;
  let sum = 0, cnt = 0;
  for (const row of data) {
    const v = row["ACTUAL_AVG"];
    if (Number.isFinite(v)) { sum += v; cnt += 1; }
  }
  return cnt ? sum / cnt : undefined;
}

// Default parser for incoming WS payload
function defaultParse(msg) {
  // 오타 일관성 대응
  if (msg && typeof msg === "object" && !Array.isArray(msg)) {
    let newMsg = { ...msg };
    if ("BITHUMB" in newMsg && !("BITTHUMB" in newMsg)) newMsg.BITTHUMB = newMsg.BITHUMB;
    if ("BITTHUMB" in newMsg && !("BITHUMB" in newMsg)) newMsg.BITHUMB = newMsg.BITTHUMB;
    return newMsg;
  }
  if (Array.isArray(msg)) {
    // [seq, fk1, fk5, fk10, bt, co, kb, up, avg]
    const [seq, fk1, fk5, fk10, bt, co, kb, up, avg] = msg;
    return { seq, fkbrti_1s: fk1, fkbrti_5s: fk5, fkbrti_10s: fk10, BITTHUMB: bt, COINONE: co, KORBIT: kb, UPBIT: up, ACTUAL_AVG: avg };
  }
  // If plain string CSV: seq,fk1,fk5,fk10,bt,co,kb,up,avg
  if (typeof msg === "string" && msg.includes(",")) {
    const [seq, fk1, fk5, fk10, bt, co, kb, up, avg] = msg.split(",");
    return { seq, fkbrti_1s: +fk1, fkbrti_5s: +fk5, fkbrti_10s: +fk10, BITTHUMB: +bt, COINONE: +co, KORBIT: +kb, UPBIT: +up, ACTUAL_AVG: +avg };
  }
  return null;
}
