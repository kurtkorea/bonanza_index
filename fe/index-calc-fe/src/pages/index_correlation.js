import React, { useMemo } from "react";

/**
 * CorrelationTable (React JS)
 * ------------------------------------------------------------
 * Renders a correlation matrix table with heat‑map colors like Excel.
 *
 * Props
 * -----
 * data: Array<Record<string, number>>   // rows of numeric data
 * columns: Array<{ key: string, name?: string }>
 * decimals?: number  // default 6
 * className?: string // optional wrapper class
 *
 * Example
 * -------
 * <CorrelationTable
 *   data={rows}
 *   columns={[
 *     { key: 'fkbrti_1s', name: 'fkbrti_1s' },
 *     { key: 'fkbrti_5s', name: 'fkbrti_5s' },
 *     { key: 'fkbrti_10s', name: 'fkbrti_10s' },
 *     { key: 'bithumb', name: 'bithumb' },
 *     { key: 'coinone', name: 'coinone' },
 *     { key: 'korbit', name: 'korbit' },
 *     { key: 'upbit', name: 'upbit' },
 *     { key: 'actual_avg', name: 'actual_avg' },
 *   ]}
 * />
 */

export default function CorrelationTable({ data = [], columns = [], decimals = 6, className = "" }) {
  const keys = columns.map((c) => c.key);

  const corr = useMemo(() => computeCorrelationMatrix(data, keys), [data, keys.join("|")]);

  return (
    <div className={`w-full overflow-auto rounded-2xl border border-gray-200 bg-white ${className}`} 
            style={{ height: "100%" }}>
      <table className="min-w-max border-collapse" style={{ border: "2px solid #4B5563", borderRadius: "5px", padding: "8px", margin: "5px" }}>
        <thead>
          <tr style={{ borderBottom: "1.5px solid #D1D5DB", height: "60px" }}>
            <Th sticky align="center" style={{ borderRight: "1.5px solid #D1D5DB", borderBottom: "1.5px solid #D1D5DB" }}></Th>
            {columns.map((c) => (
              <Th key={c.key} align="center" style={{ borderRight: "1.5px solid #D1D5DB", borderBottom: "1.5px solid #D1D5DB" }}>{c.name || c.key}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((rowCol, rIdx) => (
            <tr key={rowCol.key}>
              <Th sticky align="center">{rowCol.name || rowCol.key}</Th>
              {columns.map((col, cIdx) => {
                const r = corr?.[rIdx]?.[cIdx] ?? 0;
                const bg = colorFor(r);
                const text = rIdx === cIdx ? "font-semibold" : "";
                return (
                  <td
                    key={col.key}
                    title={`corr(${rowCol.key}, ${col.key}) = ${r.toFixed(decimals)}`}
                    style={{ 
                      background: bg, 
                      border: "1px solid #e5e7eb", 
                      height: "50px", 
                      width: "120px", 
                      textAlign: "center", 
                      padding: "0 10px" 
                    }}
                    className={`px-3 py-2 text-center tabular-nums ${text}`}
                  >
                    {r.toFixed(decimals)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2 text-xs text-gray-500" style={{ textAlign: "center" }}>-1 (red) → 0 (yellow) → 1 (green)</div>
    </div>
  );
}

function Th({ children, sticky = false, align = "center" }) {
  return (
    <th
      className={`bg-gray-50 text-gray-700 px-3 py-2 text-sm font-medium border border-gray-200 ${
        sticky ? "sticky left-0 z-10 bg-gray-100" : ""
      } ${align === "left" ? "text-left" : "text-center"}`}
      style={{ width: "150px", height: "60px", borderRight: "1.5px solid #D1D5DB", borderBottom: "1.5px solid #D1D5DB" }}
    >
      {children}
    </th>
  );
}

// -------------------- Math utils ------------------------------------------
function computeCorrelationMatrix(data, keys) {
  const n = keys.length;
  const cols = keys.map((k) => data.map((row) => asNum(row[k])).filter((v) => Number.isFinite(v)));
  const means = cols.map((arr) => mean(arr));
  const stds = cols.map((arr, i) => stddev(arr, means[i]));

  const m = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) { m[i][j] = 1; continue; }

      // 상관계수 계산시 각 pair의 항목에서 둘 다 0인 것은 제외한 배열 생성
      const arrA = cols[i];
      const arrB = cols[j];
      const pairArrA = [];
      const pairArrB = [];

      // 두 배열에서 한 쌍씩, 둘 다 0이 아닐 때만 추가
      const minLen = Math.min(arrA.length, arrB.length);
      for (let k = 0; k < minLen; k++) {
        // 둘 중 하나라도 0이 아니면 포함
        if (!(arrA[k] === 0 && arrB[k] === 0)) {
          pairArrA.push(arrA[k]);
          pairArrB.push(arrB[k]);
        }
      }

      const meanA = mean(pairArrA);
      const meanB = mean(pairArrB);
      const stdA = stddev(pairArrA, meanA);
      const stdB = stddev(pairArrB, meanB);

      m[i][j] = pearson(pairArrA, pairArrB, meanA, meanB, stdA, stdB);
    }
  }
  return m;
}

function pearson(a, b, meanA, meanB, stdA, stdB) {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += (a[i] - meanA) * (b[i] - meanB);
  const cov = sum / (len - 1);
  if (stdA === 0 || stdB === 0) return 0;
  return clamp(cov / (stdA * stdB), -1, 1);
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr, m) {
  if (arr.length <= 1) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m; s += d * d;
  }
  return Math.sqrt(s / (arr.length - 1));
}

function asNum(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

// -------------------- Color scale -----------------------------------------
// -1 → #ef4444 (red-500), 0 → #facc15 (yellow-400), 1 → #22c55e (green-500)
function colorFor(t) {
  const x = clamp(t, -1, 1);
  if (x < 0) return mix("#ef4444", "#facc15", x + 1); // [-1,0]
  return mix("#facc15", "#22c55e", x);                 // [0,1]
}

function mix(c1, c2, p) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  const r = Math.round(a.r + (b.r - a.r) * p);
  const g = Math.round(a.g + (b.g - a.g) * p);
  const b2 = Math.round(a.b + (b.b - a.b) * p);
  return `rgb(${r}, ${g}, ${b2})`;
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
}
