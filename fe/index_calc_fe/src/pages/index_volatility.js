import React, { useMemo } from "react";

/**
 * VolatilityTable (React JS)
 * ------------------------------------------------------------
 * Renders a volatility summary table like the screenshot.
 * You can either pass `perStepSigma` (stdev of per‑step returns per column)
 * or raw `rows` of prices so the component will compute per‑step log returns
 * and their sample stdev internally.
 *
 * Props
 * -----
 * rows?: Array<Record<string, number>>          // each row = one step (uniform spacing)
 * columns: Array<{ key: string, name?: string }>
 * stepSec: number                                // seconds between rows (e.g., 1, 5, 10)
 * perStepSigma?: Record<string, number>          // optional override (e.g., { fkbrti_1s: 0.0002 })
 * decimals?: number                              // percentage decimals, default 2
 * className?: string
 *
 * Method
 * ------
 * \sigma(horizon) = \sigma_step * sqrt(horizon_seconds / stepSec)
 * Values are reported as percentages.
 */

export default function VolatilityTable({
  rows = [],
  columns = [],
  stepSec,
  perStepSigma,
  decimals = 2,
  className = "",
}) {
  const keys = columns.map((c) => c.key);

  const sigmaStep = useMemo(() => {
    if (perStepSigma) return perStepSigma;
    return computePerStepSigma(rows, keys);
  }, [rows, keys.join("|"), JSON.stringify(perStepSigma)]);

  const horizons = useMemo(() => buildHorizons(stepSec), [stepSec]);

  return (
    <div className={`w-full overflow-auto rounded-2xl border border-gray-200 bg-white ${className}`}>
      {/* <div className="p-3 pb-0 text-base font-semibold">Volatility</div> */}
      <div style={{ border: "2px solid #4B5563", borderRadius: "5px", padding: "8px", margin: "5px" }}>
        <table className="mb-2 mt-1 min-w-max border-collapse w-full">
          <thead style={{ borderBottom: "1.5px solid #D1D5DB", height: "60px" }}>
            <tr>
              <Th sticky>horizon</Th>
              {columns.map((c) => (
                <Th key={c.key}>{c.name || c.key}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {horizons.map((h) => (
              <tr key={h.id} style={{ borderBottom: "1.5px solid #D1D5DB" }}>
                <Th sticky align="left">{h.label}</Th>
                {columns.map((c, idx) => {
                  const val = sigmaToHorizon(sigmaStep[c.key] ?? 0, h.seconds, stepSec);
                  return (
                    <td
                      key={c.key}
                      className="px-3 py-2 text-right tabular-nums"
                      style={{
                        width: "150px",
                        height: "60px",
                        borderRight: "1.5px solid #D1D5DB",
                        borderBottom: "1.5px solid #D1D5DB",
                        textAlign: "center",
                        padding: "0 10px"
                      }}
                    >
                      {pct(val, decimals)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, sticky = false, align = "center" }) {
  return (
    <th
      className={`bg-gray-50 text-gray-700 px-3 py-2 text-sm font-medium border border-gray-200 border-r ${
        sticky ? "sticky left-0 z-10 bg-gray-100" : ""
      } ${align === "left" ? "text-left" : "text-center"}`}
      style={{ width: "150px", height: "60px", borderRight: "1.5px solid #D1D5DB" }}
    >
      {children}
    </th>
  );
}

// --------------------- Math helpers ---------------------------------------
function computePerStepSigma(rows, keys) {
  const sigma = {};
  for (const k of keys) {
    const prices = rows.map((r) => toNum(r[k])).filter((v) => Number.isFinite(v));
    // log returns r_t = ln(P_t / P_{t-1})
    const rets = [];
    for (let i = 1; i < prices.length; i++) {
      const a = prices[i - 1], b = prices[i];
      if (a > 0 && b > 0) rets.push(Math.log(b / a));
    }
    sigma[k] = sampleStd(rets);
  }
  return sigma;
}

function sampleStd(arr) {
  if (!arr || arr.length <= 1) return 0;
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  let s = 0; for (let i = 0; i < arr.length; i++) { const d = arr[i] - m; s += d * d; }
  return Math.sqrt(s / (arr.length - 1));
}

function sigmaToHorizon(sigmaStep, horizonSec, stepSec) {
  if (!stepSec || stepSec <= 0) return 0;
  const k = horizonSec / stepSec;
  return sigmaStep * Math.sqrt(Math.max(k, 0));
}

function buildHorizons(stepSec) {
  return [
    { id: "per_minute", label: "per minute", seconds: 60 },
    { id: "daily", label: "daily", seconds: 86400 },
    { id: "weekly", label: "weekly", seconds: 7 * 86400 },
    { id: "monthly", label: "monthly", seconds: 30 * 86400 },
    { id: "annually", label: "annually", seconds: 365 * 86400 },
  ];
}

function pct(x, d = 2) { return (x * 100).toFixed(d) + "%"; }
function fmt(x) { return Number(x).toLocaleString(); }
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }
