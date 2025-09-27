// receiver-pull-queue.js
const path = require("path");
const dotenv = require("dotenv");

// 환경 변수 로드
if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "../../env/prod.env") });
} else {
	dotenv.config({ path: path.join(__dirname, "../../env/dev.env") });
}

const zmq = require("zeromq");
const net = require("net");
const { sequelize, QueryTypes } = require("../db/db.js");                  // (옵션) raw SQL fallback 시 사용

/** =========================
 *  ILP Writer (TCP 9009)
 *  - 자동 재연결, backpressure 처리, 대기버퍼
 *  ========================= */
function createIlpWriter({ host = process.env.QDB_ILP_HOST || "127.0.0.1", port = Number(process.env.QDB_ILP_PORT || 9009), reconnectBaseMs = 500 }) {
  let sock = null;
  let connected = false;
  let connecting = false;
  let backoff = reconnectBaseMs;
  const pending = [];   // 연결 전/버퍼풀 시 임시 보관

  function connect() {
    if (connecting || connected) return;
    connecting = true;

    sock = net.createConnection({ host, port }, () => {
      connected = true;
      connecting = false;
      backoff = reconnectBaseMs;
      flushPending();
      console.log(`[ILP] connected ${host}:${port}`);
    });

    sock.on("error", (e) => {
      connected = false;
      connecting = false;
      console.error("[ILP] socket error:", e.message);
      scheduleReconnect();
    });

    sock.on("close", () => {
      connected = false;
      connecting = false;
      console.warn("[ILP] socket closed");
      scheduleReconnect();
    });

    sock.on("drain", () => {
      flushPending();
    });
  }

  function scheduleReconnect() {
    if (connecting || connected) return;
    setTimeout(() => {
      backoff = Math.min(backoff * 2, 10_000); // 최대 10초
      connect();
    }, backoff);
  }

  function flushPending() {
    if (!connected || !sock) return;
    while (pending.length) {
      const chunk = pending[0];
      const ok = sock.write(chunk);
      if (!ok) return;  // 커널 송신버퍼 가득 → drain 기다림
      pending.shift();
    }
  }

  /** lines: string 또는 string[] (각 line 끝에 '\n' 포함) */
  function write(lines) {

    const payload = Array.isArray(lines) ? lines.join("") : String(lines);
    if (!payload) return true;
    if (!connected || !sock) {
      pending.push(payload);
      connect();
      return false;
    }
    const ok = sock.write(payload);
    if (!ok) {
      // backpressure 발생 → 남은 건 pending에 쌓고 drain 때 flush
      pending.push("");
    }
    return ok;
  }

  function end() {
    try { sock?.end(); } catch {}
  }

  connect();
  return { write, end };
}

/** =========================
 *  ILP 라인 포맷터 (tb_ticker)
 *  ========================= */

// 안전 ns 변환기: 문자열/숫자/Date/BigInt 모두 처리, 실패 시 폴백 사용
function toNs(anyTs, fallbackMs = Date.now()) {
    // 이미 BigInt(ns)면 그대로
    if (typeof anyTs === "bigint") return anyTs;
  
    // 숫자면: 초/밀리초 추정
    if (typeof anyTs === "number" && Number.isFinite(anyTs)) {
      const ms = anyTs < 1e12 ? Math.floor(anyTs * 1000) : Math.floor(anyTs);
      return BigInt(ms) * 1_000_000n;
    }
  
    // Date
    if (anyTs instanceof Date && !isNaN(anyTs.getTime())) {
      return BigInt(anyTs.getTime()) * 1_000_000n;
    }
  
    // 문자열(ISO 등)
    if (typeof anyTs === "string" && anyTs.length) {
      const ms = Date.parse(anyTs);
      if (!isNaN(ms)) return BigInt(ms) * 1_000_000n;
    }
  
    // 폴백
    const fb = Math.floor(Number(fallbackMs) || Date.now());
    return BigInt(fb) * 1_000_000n;
  }

  const num = (v) => (typeof v === "number" ? v : Number(v));

  // μs 변환 + 't'
  function tsFieldMicros(v) {
    // v: Date | number(ms|s) | string(ISO)
    let ms;
    if (v instanceof Date) ms = v.getTime();
    else if (typeof v === "number" && Number.isFinite(v)) ms = v < 1e12 ? v * 1000 : v; // s→ms
    else ms = Date.parse(String(v));
    if (!Number.isFinite(ms)) ms = Date.now();
    const micros = Math.trunc(ms * 1000);
    return `${micros}t`;
  }
  
  // 정수/실수 필드
  function intField(v)  { const n = num(v); return Number.isFinite(n) ? `${Math.trunc(n)}i` : `0i`; }
  function floatField(v){ const n = num(v); return Number.isFinite(n) ? String(n) : `0`; }
  
   // ns 변환(디자인네이티드용) - 중복 제거
  
  function escTag(s){ return String(s ?? "").replace(/[,= ]/g, "\\$&"); }
/**
 * @param {string} topic  (로깅용)
 * @param {any} eventTs   marketAt(권장) 또는 수신 ts(문자/숫자/Date/BigInt)
 * @param {object} data   { symbol, exchange_no, exchange_name, seq, side, price, size, marketAt, collectorAt, dbAt, diff_ms, diff_ms_db }
 * @returns string  ILP 라인 (끝에 \n)
 */

 function toILP_Ticker(data) {
     const tags = `symbol=${escTag(data.symbol)},exchange_name=${escTag(data.exchange_name)}`;
     const fields = [];
     if (data.exchange_no != null) fields.push(`exchange_no=${intField(data.exchange_no)}`); // INT → i
     if (data.seq != null)         fields.push(`seq=${intField(data.seq)}`);                 // LONG → i
     if (data.open != null)        fields.push(`open=${floatField(data.open)}`);
     if (data.high != null)        fields.push(`high=${floatField(data.high)}`);
     if (data.low != null)         fields.push(`low=${floatField(data.low)}`);
     if (data.close != null)       fields.push(`close=${floatField(data.close)}`);
     if (data.volume != null)      fields.push(`volume=${floatField(data.volume)}`);
     if (data.marketAt)              fields.push(`marketAt=${tsFieldMicros(data.marketAt)}`); // ★ TIMESTAMP → μs + t
     if (data.collectorAt)           fields.push(`collectorAt=${tsFieldMicros(data.collectorAt)}`); // ★ TIMESTAMP → μs + t
     if (data.dbAt)           fields.push(`dbAt=${tsFieldMicros(data.dbAt)}`); // ★ TIMESTAMP → μs + t
     if (data.diff_ms != null && data.diff_ms !== undefined) fields.push(`diff_ms=${floatField(data.diff_ms)}`);
     if (data.diff_ms_db != null && data.diff_ms_db !== undefined) fields.push(`diff_ms_db=${floatField(data.diff_ms_db)}`);
     if (!fields.length) fields.push("dummy=1");
     return `tb_ticker,${tags} ${fields.join(",")}\n`;
 }

 function toILP_Trade(data) {
  const tags = `symbol=${escTag(data.symbol)},exchange_name=${escTag(data.exchange_name)}`;
  const fields = [];
  if (data.exchange_no != null) fields.push(`exchange_no=${intField(data.exchange_no)}`); // INT → i
  if (data.price != null)        fields.push(`price=${floatField(data.price)}`);
  if (data.volume != null)      fields.push(`volume=${floatField(data.volume)}`);
  if (data.side != null)        fields.push(`side="${escTag(data.side)}"`); // 문자열 필드는 반드시 쌍따옴표
  if (data.marketAt)              fields.push(`marketAt=${tsFieldMicros(data.marketAt)}`); // ★ TIMESTAMP → μs + t
  if (data.collectorAt)           fields.push(`collectorAt=${tsFieldMicros(data.collectorAt)}`); // ★ TIMESTAMP → μs + t
  if (data.dbAt)           fields.push(`dbAt=${tsFieldMicros(data.dbAt)}`); // ★ TIMESTAMP → μs + t
  if (data.diff_ms != null && data.diff_ms !== undefined) fields.push(`diff_ms=${floatField(data.diff_ms)}`);
  if (data.diff_ms_db != null && data.diff_ms_db !== undefined) fields.push(`diff_ms_db=${floatField(data.diff_ms_db)}`);
  if (!fields.length) fields.push("dummy=1");
  return `tb_trade,${tags} ${fields.join(",")}\n`;
}


/** =========================
 *  비동기 작업 큐 (동시 처리 제한)
 *  ========================= */
class AsyncWorkQueue {
  constructor({ concurrency = 4, maxQueue = 10000, onDrop = null } = {}) {
    this.concurrency = concurrency;
    this.maxQueue = maxQueue;
    this.onDrop = onDrop || ((job) => console.warn("[QUEUE] dropped job"));
    this.q = [];
    this.active = 0;
    this.closed = false;
  }
  size() { return this.q.length; }
  async push(jobFn) {
    if (this.closed) throw new Error("Queue closed");
    if (this.q.length >= this.maxQueue) { this.onDrop(jobFn); return false; }
    this.q.push(jobFn);
    this.#pump();
    return true;
  }
  async #pump() {
    while (this.active < this.concurrency && this.q.length > 0) {
      const fn = this.q.shift();
      this.active++;
      setImmediate(async () => {
        try { await fn(); }
        catch (err) { console.error("[QUEUE] job error:", err); }
        finally {
          this.active--;
          if (!this.closed && this.q.length > 0) this.#pump();
        }
      });
    }
  }
  async drain() {
    while (this.q.length > 0 || this.active > 0) { await new Promise((r) => setTimeout(r, 50)); }
  }
  close() { this.closed = true; }
}

/** =========================
 *  배치 처리기
 *  ========================= */
class BatchProcessor {
  constructor({ flushIntervalMs = 20, maxBatchSize = 2000, onFlush }) {
    this.buf = [];
    this.flushIntervalMs = flushIntervalMs;
    this.maxBatchSize = maxBatchSize;
    this.onFlush = onFlush;
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
  }
  push(item) {
    this.buf.push(item);
    if (this.buf.length >= this.maxBatchSize) this.flush();
  }
  async flush() {
    if (this.buf.length === 0) return;
    const batch = this.buf.splice(0, this.buf.length);
    try { await this.onFlush(batch); }
    catch (e) { console.error("[BATCH] flush error:", e); }
  }
  async close() {
    clearInterval(this.timer);
    await this.flush();
  }
}

/** =========================
 *  (참고) 개별 메시지 처리 → 지금은 배치 경로 사용
 *  ========================= */
async function handleMessage(topicBuf, tsBuf, payloadBuf) {
  const topic = topicBuf.toString();
  const ts = Number(tsBuf.toString());
  let data;
  try { data = JSON.parse(payloadBuf.toString()); }
  catch { data = { raw: payloadBuf.toString() }; }

  // 필요시 개별 로직…
  console.log(`[WORK] ${topic} @ ${ts}`, data);
}

async function processMessage(topicBuf, tsBuf, payloadBuf) {
    const topic = topicBuf.toString();
    const ts = Number(tsBuf.toString());
    let data;
    try { data = JSON.parse(payloadBuf.toString()); }
    catch { data = { raw: payloadBuf.toString() }; }
  
    let d = data;
    if (typeof d === "string") {
      try { d = JSON.parse(d); } catch { d = { raw: d }; }
    }

    // console.log("data", data);


    // 필요시 개별 로직…
    // console.log(`[WORK] ${topicBuf} @ ${ts}`, data);
    // console.log(`[WORK] ${topicBuf} @ ${ts}`, `total_count: ${total_count}, bid_count: ${bid_count}, ask_count: ${ask_count}`);
  }

/** =========================
 *  메인 루프
 *  ========================= */
async function startPullQueue() {
  // 0) ILP writer 준비
  
  const ilp = createIlpWriter({}); // env: QDB_ILP_HOST / QDB_ILP_PORT

  // 1) ZMQ PULL
  const pull = new zmq.Pull();
  pull.connect( process.env.ZMQ_PUSH_HOST );
  console.log("[PULL] connected ", process.env.ZMQ_PUSH_HOST);

  // 2) 작업 큐 (개별 처리 경로 쓸 때)
  const workQueue = new AsyncWorkQueue({
    concurrency: 8,
    maxQueue: 50000,
    onDrop: () => console.warn("[QUEUE] drop: incoming overload"),
  });

  // 3) 배치 처리기 – ILP로 20ms마다 flush
  const batcher = new BatchProcessor({
    flushIntervalMs: 20,
    maxBatchSize: 2000,
    onFlush: async (batch) => {
      // 데이터 정규화 → ILP 라인 생성
      const ticker_lines = [];
      const trade_lines = [];
      for (const item of batch) {
        const { topic, data } = item;

        let d = data;
        if (typeof d === "string") {
          try { d = JSON.parse(d); } catch { d = { raw: d }; }
        }

        const dbAt = new Date().toISOString();
        // diff_ms_db 계산 로직 수정: 밀리초 단위로 계산 (초 단위 아님)
        const diff_ms_db = ( new Date().getTime() - new Date(d.marketAt).getTime() ) / 1000 > 0 ? ( new Date().getTime() - new Date(d.marketAt).getTime() ) / 1000 : 0;

        // console.log("d", d);
        // console.log("topic", topic);

        // console.log("d", d);
        console.log("topic", topic, d);

         if (typeof topic === "string" && topic.includes("ticker")) {
            const ticker_row = {
              symbol: d.symbol,
              exchange_no: d.exchange_no,
              exchange_name: d.exchange_name,
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
              volume: d.volume,
              marketAt: d.marketAt,
              collectorAt: d.collectorAt,
              dbAt: dbAt,
              diff_ms: d.diff_ms,
              diff_ms_db: diff_ms_db,
            };
            // console.log("ticker_row", ticker_row);
            ticker_lines.push(toILP_Ticker(ticker_row));
         } else if (typeof topic === "string" && topic.includes("trade")) {
          //  console.log(`[LOG] trade topic 감지: topic=${topic}, data=`, d);
            const trade_row = {
              symbol: d.symbol,
              exchange_no: d.exchange_no,
              exchange_name: d.exchange_name,
              price: d.price,
              volume: d.volume,
              side: d.side,
              marketAt: d.marketAt,
              collectorAt: d.collectorAt,
              dbAt: dbAt,
              diff_ms: d.diff_ms,
              diff_ms_db: diff_ms_db,
            };
            trade_lines.push(toILP_Trade(trade_row));
         } else {
          //  console.log(`[LOG] 기타 topic 감지: topic=${topic}, data=`, d);
         }
      }
      if (ticker_lines.length) {
        if (process.env.IS_SAVE_DB === "true") {
          ilp.write(ticker_lines); // backpressure/재연결은 내부에서 처리
        }
      }
      if (trade_lines.length) {
        if (process.env.IS_SAVE_DB === "true") {
          ilp.write(trade_lines); // backpressure/재연결은 내부에서 처리
        }
      }
    },
  });

  // 4) 수신 루프: 배치 경로 사용
  (async () => {
    for await (const msg of pull) {
      if (msg.length === 3) {
        const [topicBuf, tsBuf, payloadBuf] = msg;
        let parsed;
        try { parsed = JSON.parse(payloadBuf); }
        catch { parsed = String(payloadBuf); }

        const item = {
          topic: topicBuf.toString(),
          ts: Number(tsBuf.toString()),
          data: parsed
        };
        if (process.env.IS_BATCH === "true") {
          batcher.push(item);
        } else {
          workQueue.push(() => processMessage(topicBuf, Buffer.from(Date.now().toString()), payloadBuf));
        }
      } else {
        // 형식이 다르면 개별 처리로 우회
        if (process.env.IS_BATCH === "true") {
            workQueue.push(() => handleMessage(Buffer.from("unknown"), Buffer.from(Date.now().toString()), msg[0]));
        }
      }
      if (workQueue.size() % 10000 === 0 && workQueue.size() > 0) {
        console.log(`[PULL] queued: ${workQueue.size()}`);
      }
    }
  })().catch((e) => console.error("[PULL] loop error:", e));

  // 5) 종료 시그널
  async function shutdown() {
    console.log("\n[SHUTDOWN] draining...");
    try {
      await batcher.close();      // 남은 배치 flush
      workQueue.close();
      await workQueue.drain();
      pull.close();
      ilp.end();
    } catch (e) {
      console.error("[SHUTDOWN] error:", e);
    } finally {
      console.log("[SHUTDOWN] done");
      process.exit(0);
    }
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = { startPullQueue };
