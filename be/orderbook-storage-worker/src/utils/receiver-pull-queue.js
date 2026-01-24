// receiver-pull-queue.js
const zmq = require("zeromq");
const net = require("net");
const logger = require('./logger.js');
const { send_publisher } = require("./zmq-sender-pub.js");
const { DataDeduplicator } = require("./deduplicator.js");
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
      logger.info(`[ILP] connected ${host}:${port}`);
    });

    sock.on("error", (e) => {
      connected = false;
      connecting = false;
      logger.error({ ex: "ILP", err: e.message }, "[ILP] socket error:");
      scheduleReconnect();
    });

    sock.on("close", () => {
      connected = false;
      connecting = false;
      logger.warn("[ILP] socket closed");
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
 *  ILP 라인 포맷터 (tb_order_book_units)
 *  ========================= */

// KST 오프셋 (9시간 = 9 * 60 * 60 * 1000 밀리초)
const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // 32400000

// 안전 ns 변환기: 문자열/숫자/Date/BigInt 모두 처리, 실패 시 폴백 사용 (UTC → KST 변환)
function toNs(anyTs, fallbackMs = Date.now()) {
    // 이미 BigInt(ns)면 그대로 (KST 오프셋 적용)
    if (typeof anyTs === "bigint") {
      const ms = Number(anyTs / 1_000_000n) + KST_OFFSET_MS;
      return BigInt(ms) * 1_000_000n;
    }
  
    // 숫자면: 초/밀리초 추정 (KST 오프셋 추가)
    if (typeof anyTs === "number" && Number.isFinite(anyTs)) {
      const ms = (anyTs < 1e12 ? Math.floor(anyTs * 1000) : Math.floor(anyTs)) + KST_OFFSET_MS;
      return BigInt(ms) * 1_000_000n;
    }
  
    // Date (KST 오프셋 추가)
    if (anyTs instanceof Date && !isNaN(anyTs.getTime())) {
      return BigInt(anyTs.getTime() + KST_OFFSET_MS) * 1_000_000n;
    }
  
    // 문자열(ISO 등) (KST 오프셋 추가)
    if (typeof anyTs === "string" && anyTs.length) {
      const ms = Date.parse(anyTs);
      if (!isNaN(ms)) return BigInt(ms + KST_OFFSET_MS) * 1_000_000n;
    }
  
    // 폴백 (KST 오프셋 추가)
    const fb = Math.floor(Number(fallbackMs) || Date.now()) + KST_OFFSET_MS;
    return BigInt(fb) * 1_000_000n;
  }

  const num = (v) => (typeof v === "number" ? v : Number(v));

  // μs 변환 + 't' (UTC → KST 변환)
  function tsFieldMicros(v) {
    // v: Date | number(ms|s) | string(ISO)
    let ms;
    if (v instanceof Date) ms = v.getTime();
    else if (typeof v === "number" && Number.isFinite(v)) ms = v < 1e12 ? v * 1000 : v; // s→ms
    else ms = Date.parse(String(v));
    if (!Number.isFinite(ms)) ms = Date.now();
    // KST 오프셋 추가 (9시간)
    ms = ms + KST_OFFSET_MS;
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
 * @param {any} eventTs   수신 ts(문자/숫자/Date/BigInt)
 * @param {object} data   { symbol, exchange_no, exchange_name, seq, side, price, size, createdAt, diff_ms }
 * @returns string  ILP 라인 (끝에 \n)
 */
 function toILP(topic, eventTs, data) {
     const tags = `exchange_cd=${escTag(data.exchange_cd)},order_tp=${escTag(data.order_tp)}`
     const fields = [];
     if (data.ts != null)               fields.push(`ts=${tsFieldMicros(data.ts)}`);
     if (data.price_id != null)         fields.push(`price_id=${intField(data.price_id)}`);
     if (data.product_id != null)       fields.push(`product_id=${intField(data.product_id)}`);
     if (data.price != null)            fields.push(`price=${floatField(data.price)}`);
     if (data.size != null)             fields.push(`size=${floatField(data.size)}`);
     const ns = toNs(eventTs, data.ts);
     const line = `tb_order_book_units,${tags} ${fields.join(",")} ${ns}\n`;
     return line;
 }

/** =========================
 *  비동기 작업 큐 (동시 처리 제한)
 *  ========================= */
class AsyncWorkQueue {
  constructor({ concurrency = 4, maxQueue = 10000, onDrop = null } = {}) {
    this.concurrency = concurrency;
    this.maxQueue = maxQueue;
    this.onDrop = onDrop || ((job) => logger.warn("[QUEUE] dropped job"));
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
        catch (err) { logger.error({ ex: "QUEUE", err: err }, "[QUEUE] job error:"); }
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
    catch (e) { logger.error({ ex: "BATCH", err: e }, "[BATCH] flush error:"); }
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
  logger.info({ ex: "WORK", topic: topic, ts: ts, data: data }, "[WORK]");
}

/** =========================
 *  메인 루프
 *  ========================= */
async function startPullQueue() {
  // 0) ILP writer 준비
  
  const ilp = createIlpWriter({}); // env: QDB_ILP_HOST / QDB_ILP_PORT

  // 중복 제거기 초기화 (환경 변수로 윈도우 시간 설정 가능, 기본 1초)
  const DEDUP_WINDOW_MS = Number(process.env.DEDUP_WINDOW_MS || 1000);
  const deduplicator = new DataDeduplicator(DEDUP_WINDOW_MS);
  let duplicateCount = 0;
  let totalProcessedCount = 0;

  // 프로세스 시작 시간 기록 (재기동 시 첫 데이터 스킵용)
  const processStartTime = Date.now();
  let isFirstData = true;

  // 1) ZMQ PULL
  const pull = new zmq.Pull();
  await pull.bind(process.env.ZMQ_PULL_HOST);
  // bind 완료 후 소켓이 완전히 준비될 때까지 짧은 지연 (100ms)
  await new Promise(resolve => setTimeout(resolve, 100));
  logger.info({ ex: "PULL", host: process.env.ZMQ_PULL_HOST }, "[PULL] BIND");

  // 2) 작업 큐 (개별 처리 경로 쓸 때)
  const workQueue = new AsyncWorkQueue({
    concurrency: 8,
    maxQueue: 50000,
    onDrop: () => logger.warn("[QUEUE] drop: incoming overload"),
  });

  // 3) 1초 단위 호가 버퍼 (IS_SECOND === "true"일 때 사용)
  if (!global.__orderbookBuffer) {
    global.__orderbookBuffer = new Map(); // key: "exchange_cd:product_id:tsSecond" (ts 기준 초 단위), value: { bid: Map<price, size>, ask: Map<price, size>, ... }
  }
  
  // flush된 버퍼 추적 (중복 flush 방지)
  if (!global.__flushedBuffers) {
    global.__flushedBuffers = new Set(); // flush된 bufferKey를 추적
  }

  // 거래소별 마지막 flush된 버퍼 저장 (데이터가 안들어온 경우 이전 데이터 유지용)
  if (!global.__lastFlushedBuffer) {
    global.__lastFlushedBuffer = new Map(); // key: "exchange_cd:product_id", value: { bid: Map, ask: Map, ... }
  }

  // ts 기준으로 1초가 지난 버퍼를 flush하는 함수
  function flushReadyBuffers() {
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000);
    const targetSecond = currentSecond - 1; // 1초 전 초를 flush 대상으로
    
    // ts 기준으로 1초 이상 지난 버퍼 항목들을 flush
    const keysToFlush = [];
    
    for (const [key, buffer] of global.__orderbookBuffer.entries()) {
      // ts 기준으로 1초(1000ms) 이상 지난 항목만 flush
      // 이미 flush된 버퍼는 제외
      if (buffer.ts && (now - buffer.ts >= 1000) && !global.__flushedBuffers.has(key)) {
        keysToFlush.push(key);
      }
    }

    // 데이터가 안들어온 거래소:상품 조합에 대해 이전 데이터 사용
    // 모든 거래소:상품 조합을 확인하여 데이터가 없는 경우 이전 버퍼 사용
    for (const [exchangeProductKey, lastBuffer] of global.__lastFlushedBuffer.entries()) {
      const [exchange_cd, product_id] = exchangeProductKey.split(':');
      const targetBufferKey = `${exchange_cd}:${product_id}:${targetSecond}`;
      
      // 해당 초의 버퍼가 없고, 아직 flush되지 않았다면 이전 버퍼 사용
      if (!global.__orderbookBuffer.has(targetBufferKey) && !global.__flushedBuffers.has(targetBufferKey)) {
        // 이전 버퍼를 복사하여 새 버퍼 생성
        const clonedBuffer = {
          symbol: lastBuffer.symbol,
          subscribe_symbol: lastBuffer.subscribe_symbol,
          exchange_nm: lastBuffer.exchange_nm,
          topic: lastBuffer.topic,
          exchange_cd: lastBuffer.exchange_cd,
          price_id: lastBuffer.price_id,
          product_id: lastBuffer.product_id,
          ts: targetSecond * 1000,
          diff_ms: lastBuffer.diff_ms,
          bid: new Map(lastBuffer.bid), // Map 복사
          ask: new Map(lastBuffer.ask), // Map 복사
        };

        global.__orderbookBuffer.set(targetBufferKey, clonedBuffer);
        keysToFlush.push(targetBufferKey);
      }
    }

    // 버퍼 flush 처리
    for (const key of keysToFlush) {
      const buffer = global.__orderbookBuffer.get(key);
      if (!buffer) continue;
      
      // 이미 flush된 버퍼인지 다시 확인 (동시성 문제 방지)
      if (global.__flushedBuffers.has(key)) {
        continue;
      }
      
      // flush 표시 (flush 전에 표시하여 중복 방지)
      global.__flushedBuffers.add(key);

      const lines = [];

      // bid 상위 15개 선택 (가격 내림차순)
      const sortedBids = Array.from(buffer.bid.entries())
        .sort((a, b) => b[0] - a[0]) // 가격 내림차순
        .slice(0, 15);
      
      // ask 상위 15개 선택 (가격 오름차순)
      const sortedAsks = Array.from(buffer.ask.entries())
        .sort((a, b) => a[0] - b[0]) // 가격 오름차순
        .slice(0, 15);

      // bid 저장
      for (const [price, size] of sortedBids) {
        const row = {
          ts: buffer.ts,
          exchange_cd: buffer.exchange_cd,
          price_id: buffer.price_id,
          product_id: buffer.product_id,
          order_tp: "B",
          price,
          size,
        };
        lines.push(toILP(buffer.topic, buffer.ts, row));
      }

      // ask 저장
      for (const [price, size] of sortedAsks) {
        const row = {
          ts: buffer.ts,
          exchange_cd: buffer.exchange_cd,
          price_id: buffer.price_id,
          product_id: buffer.product_id,
          order_tp: "A",
          price,
          size,
        };
        lines.push(toILP(buffer.topic, buffer.ts, row));
      }

      if (lines.length > 0 && process.env.IS_SAVE_DB === "true") {
        // logger.info({ 
        //   ex: "FLUSH", 
        //   bufferKey: key, 
        //   linesCount: lines.length, 
        //   bidCount: sortedBids.length, 
        //   askCount: sortedAsks.length,
        //   exchange_cd: buffer.exchange_cd,
        //   product_id: buffer.product_id
        // }, "[FLUSH] Writing to ILP");
        ilp.write(lines);
      } else {
        // logger.warn({ 
        //   ex: "FLUSH", 
        //   bufferKey: key, 
        //   linesCount: lines.length,
        //   bidCount: sortedBids.length,
        //   askCount: sortedAsks.length,
        //   isSaveDb: process.env.IS_SAVE_DB
        // }, "[FLUSH] Skipping write (lines empty or IS_SAVE_DB not true)");
      }

      ///////////////
      const build_data = {
        exchange_cd: buffer.exchange_cd,
        exchange_nm: buffer.exchange_nm,
        symbol: buffer.symbol,
        subscribe_symbol: buffer.subscribe_symbol,
        price_id: buffer.price_id,
        product_id: buffer.product_id,
        ts: buffer.ts,
        bid: sortedBids,
        ask: sortedAsks
      }

      send_publisher(build_data.exchange_cd, build_data).catch(err => {
        logger.error({ ex: "PUB", err: String(err) }, "[PUB] send error:");
      });

      // 마지막 flush된 버퍼로 저장 (다음 초에 데이터가 없을 때 사용)
      const exchangeProductKey = `${buffer.exchange_cd}:${buffer.product_id}`;
      global.__lastFlushedBuffer.set(exchangeProductKey, {
        symbol: buffer.symbol,
        subscribe_symbol: buffer.subscribe_symbol,
        exchange_nm: buffer.exchange_nm,
        topic: buffer.topic,
        exchange_cd: buffer.exchange_cd,
        price_id: buffer.price_id,
        product_id: buffer.product_id,
        ts: buffer.ts,
        bid: new Map(buffer.bid), // Map 복사
        ask: new Map(buffer.ask), // Map 복사
      });
      

      // 버퍼 삭제
      global.__orderbookBuffer.delete(key);
      
      // 오래된 flush 기록 정리 (1분 이상 지난 기록 삭제)
      if (global.__flushedBuffers.size > 1000) {
        // 간단한 정리: flush 기록이 너무 많아지면 초기화
        // (실제로는 타임스탬프를 저장해서 오래된 것만 삭제하는 것이 좋지만, 간단하게 처리)
        global.__flushedBuffers.clear();
      }
    }
  }

  // ts 기준으로 1초가 지난 버퍼를 flush하는 타이머
  let flushTimer = null;
  if (process.env.IS_SECOND === "true") {
    // 즉시 한 번 실행하여 오래된 데이터 처리
    flushReadyBuffers();
    
    // 이후 1초마다 실행
    flushTimer = setInterval(() => {
      flushReadyBuffers();
    }, 1000);
  }

  // 4) 배치 처리기 – ILP로 20ms마다 flush (IS_SECOND !== "true"일 때 사용)
  const batcher = new BatchProcessor({
    flushIntervalMs: 20,
    maxBatchSize: 2000,
    onFlush: async (batch) => {
      // 데이터 정규화 → ILP 라인 생성

      const lines = [];
      for (const item of batch) {
        const { topic, ts, data } = item;

        let total_count = 0;
        let bid_count = 0;
        let ask_count = 0;

        let d = data;
        if (typeof d === "string") {
          try { d = JSON.parse(d); } catch { d = { raw: d }; }
        }

        // 중복 데이터 체크 및 스킵
        if (d.ts) {
          totalProcessedCount++;
          if (deduplicator.isDuplicate(d, d.ts)) {
            duplicateCount++;
            // 중복 데이터는 스킵
            if (duplicateCount % 100 === 0) {
              logger.debug({ 
                ex: "DEDUP", 
                duplicateCount, 
                totalProcessedCount,
                duplicateRate: ((duplicateCount / totalProcessedCount) * 100).toFixed(2) + '%'
              }, "[DEDUP] Duplicate data skipped");
            }
            continue;
          }
        }

        let seq = 0;
        if (Array.isArray(d.bid)) {
          for (const [price, size] of d.bid) {
            const row = {
              ts: d.ts,
              exchange_cd: d.exchange_cd, 
              price_id: d.price_id,
              product_id: d.product_id,
              order_tp: "B",
              price,
              size,
            };
            lines.push(toILP(topic, d.ts ?? ts, row));
            seq++;
            bid_count++;
            total_count++;
          }
          seq = 0;
          for (const [price, size] of d.ask) {
            const row = {
              ts: d.ts,
              exchange_cd: d.exchange_cd,
              price_id: d.price_id,
              product_id: d.product_id,
              order_tp: "A",
              price,
              size,
            };
            lines.push(toILP(topic, d.ts ?? ts, row));
            seq++;
            ask_count++;
            total_count++;
          }
        }   
      }
      
      if (lines.length) {
        if (process.env.IS_SAVE_DB === "true") {
          logger.debug({ 
            ex: "BATCH", 
            linesCount: lines.length,
            batchSize: batch.length
          }, "[BATCH] Writing to ILP");
          ilp.write(lines); // backpressure/재연결은 내부에서 처리
        } else {
          logger.warn({ ex: "BATCH", linesCount: lines.length, isSaveDb: process.env.IS_SAVE_DB }, "[BATCH] Skipping write (IS_SAVE_DB not true)");
        }
      }
    },
  });

  // 4) 수신 루프: 배치 경로 사용
  (async () => {
    let messageCount = 0;
    for await (const msg of pull) {

      messageCount++;

      if (messageCount % 100 === 0) {
        logger.info({ ex: "PULL", messageCount }, "[PULL] Received messages");
      }
      if (msg.length === 3) {
        const [topicBuf, tsBuf, payloadBuf] = msg;
        
        // 기존 처리 로직
        let parsed;
        try { parsed = JSON.parse(payloadBuf); }
        catch { parsed = String(payloadBuf); }

        const item = {
          topic: topicBuf.toString(),
          ts: Number(tsBuf.toString()),
          data: parsed
        };

        if (process.env.IS_SECOND === "true") {
          // ts 기준 1초 단위로 호가를 버퍼에 merge
          const d = item.data;
          
          if (!d.ts) {
            logger.debug({ ex: "PULL", topic: item.topic }, "[PULL] Skipping message without ts");
            continue;
          }
          
          if (!d.exchange_cd || !d.product_id) {
            logger.warn({ ex: "PULL", topic: item.topic, data: d }, "[PULL] Skipping message without exchange_cd or product_id");
            continue;
          }
          
          // 재기동 시 첫 번째 데이터 스킵 (오래된 데이터 방지)
          if (isFirstData) {
            // 첫 번째 데이터의 ts이 프로세스 시작 시간보다 오래된 경우 스킵
              if (d.ts < processStartTime) {
              logger.info({ 
                ex: "PULL", 
                ts: d.ts, 
                processStartTime: processStartTime,
                diff: processStartTime - d.ts 
              }, "[PULL] Skipping first old data after restart");
              isFirstData = false;
              continue;
            }
            isFirstData = false;
          }

          // 중복 데이터 체크 및 스킵 (IS_SECOND 경로에서도 적용)
          totalProcessedCount++;
          if (deduplicator.isDuplicate(d, d.ts)) {
            duplicateCount++;
            // 중복 데이터는 스킵
            if (duplicateCount % 100 === 0) {
              logger.debug({ 
                ex: "DEDUP", 
                duplicateCount, 
                totalProcessedCount,
                duplicateRate: ((duplicateCount / totalProcessedCount) * 100).toFixed(2) + '%'
              }, "[DEDUP] Duplicate data skipped (IS_SECOND mode)");
            }
            continue;
          }
          
          // ts를 초 단위로 변환 (밀리초를 초로 변환)
          const tsSecond = Math.floor(d.ts / 1000);
          
          // 버퍼 키: exchange_cd:product_id:tsSecond (ts 기준 초 단위)
          const bufferKey = `${d.exchange_cd}:${d.product_id}:${tsSecond}`;
          
          // 이미 flush된 버퍼면 스킵 (중복 방지)
          if (global.__flushedBuffers.has(bufferKey)) {
            continue;
          }
          
          if (!global.__orderbookBuffer.has(bufferKey)) {
            global.__orderbookBuffer.set(bufferKey, {
              topic: item.topic,
              exchange_cd: d.exchange_cd,
              price_id: d.price_id,
              product_id: d.product_id,
              subscribe_symbol: d.subscribe_symbol,
              exchange_nm: d.exchange_nm,
              symbol: d.symbol,
              ts: d.ts,
              bid: new Map(),
              ask: new Map(),
            });
          }
          
          const buffer = global.__orderbookBuffer.get(bufferKey);
          
          // bid merge (같은 가격이면 수량 합산)
          if (Array.isArray(d.bid)) {
            for (const [price, size] of d.bid) {
              const numPrice = Number(price);
              const numSize = Number(size);
              if (buffer.bid.has(numPrice)) {
                buffer.bid.set(numPrice, buffer.bid.get(numPrice) + numSize);
              } else {
                buffer.bid.set(numPrice, numSize);
              }
              buffer.bid.set(numPrice, numSize);
            }
          }
          
          // ask merge (같은 가격이면 수량 합산)
          if (Array.isArray(d.ask)) {
            for (const [price, size] of d.ask) {
              const numPrice = Number(price);
              const numSize = Number(size);
              if (buffer.ask.has(numPrice)) {
                buffer.ask.set(numPrice, buffer.ask.get(numPrice) + numSize);
              } else {
                buffer.ask.set(numPrice, numSize);
              }
              buffer.ask.set(numPrice, numSize);
            }
          }
          
          if (d.ts && (!buffer.ts || d.ts > buffer.ts)) {
            buffer.ts = d.ts;
          }
          
          // ts 업데이트 (최신 값으로)
          if (d.ts && (!buffer.ts || d.ts > buffer.ts)) {
            buffer.ts = d.ts;
          }

          // const sortedBids = Array.from(buffer.bid.entries())
          // .sort((a, b) => b[0] - a[0]) // 가격 내림차순
          // .slice(0, 15);
        
          // // ask 상위 15개 선택 (가격 오름차순)
          // const sortedAsks = Array.from(buffer.ask.entries())
          //   .sort((a, b) => a[0] - b[0]) // 가격 오름차순
          //   .slice(0, 15);

          // const build_data = {
          //   exchange_cd: buffer.exchange_cd,
          //   exchange_nm: buffer.exchange_nm,
          //   symbol: buffer.symbol,
          //   subscribe_symbol: buffer.subscribe_symbol,
          //   price_id: buffer.price_id,
          //   product_id: buffer.product_id,
          //   ts: buffer.ts,
          //   bid: sortedBids,
          //   ask: sortedAsks
          // }

          // // ts를 초단위로 변환하여 출력
          // console.log("buffer.ts (sec)", buffer.exchange_cd, buffer.ts ? Math.floor(buffer.ts / 1000) : buffer.ts);
    
          // send_publisher(build_data.exchange_cd, build_data).catch(err => {
          //   logger.error({ ex: "PUB", err: String(err) }, "[PUB] send error:");
          // });
          
          // 데이터 추가 후 즉시 flush 조건 확인 (프로세스 시작 시 오래된 데이터 즉시 처리)
          const now = Date.now();
          if (buffer.ts && (now - buffer.ts >= 1000) && !global.__flushedBuffers.has(bufferKey)) {
            // 즉시 flush (비동기로 실행하여 메인 루프 블로킹 방지)
            setImmediate(() => {
              flushReadyBuffers();
            });
          }
        } else {
          if (process.env.IS_SAVE_DB === "true") {
            batcher.push(item);
          }
        }

      } else {
        // 형식이 다르면 개별 처리로 우회
        if (process.env.IS_SAVE_DB === "true") {
            workQueue.push(() => handleMessage(Buffer.from("unknown"), Buffer.from(Date.now().toString()), msg[0]));
        }
      }
      if (workQueue.size() % 10000 === 0 && workQueue.size() > 0) {
        logger.info({ ex: "PULL", size: workQueue.size() }, "[PULL] queued");
      }
    }
  })().catch((e) => logger.error({ ex: "PULL", err: String(e), stack: e.stack }, "[PULL] loop error:"));

  // 중복 제거 통계 로깅 (주기적)
  const statsInterval = setInterval(() => {
    if (totalProcessedCount > 0) {
      const duplicateRate = ((duplicateCount / totalProcessedCount) * 100).toFixed(2);
      logger.info({ 
        ex: "DEDUP", 
        duplicateCount, 
        totalProcessedCount,
        duplicateRate: duplicateRate + '%'
      }, "[DEDUP] Statistics");
    }
  }, 60000); // 1분마다 통계 로깅

  // 5) 종료 시그널
  async function shutdown() {
    logger.info({ ex: "SHUTDOWN" }, "[SHUTDOWN] draining...");
    try {
      // 통계 인터벌 정리
      if (statsInterval) {
        clearInterval(statsInterval);
      }

      // 중복 제거기 정리
      deduplicator.destroy();

      // 최종 통계 로깅
      if (totalProcessedCount > 0) {
        const duplicateRate = ((duplicateCount / totalProcessedCount) * 100).toFixed(2);
        logger.info({ 
          ex: "DEDUP", 
          duplicateCount, 
          totalProcessedCount,
          duplicateRate: duplicateRate + '%'
        }, "[DEDUP] Final statistics");
      }

      // flushTimer 정리
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
      
      // 남은 버퍼 flush
      if (global.__orderbookBuffer && global.__orderbookBuffer.size > 0) {
        const lines = [];
        for (const [key, buffer] of global.__orderbookBuffer.entries()) {
          // bid 상위 15개 선택
          const sortedBids = Array.from(buffer.bid.entries())
            .sort((a, b) => b[0] - a[0])
            .slice(0, 15);
          
          // ask 상위 15개 선택
          const sortedAsks = Array.from(buffer.ask.entries())
            .sort((a, b) => a[0] - b[0])
            .slice(0, 15);

          for (const [price, size] of sortedBids) {
            const row = {
              ts: buffer.ts,
              exchange_cd: buffer.exchange_cd,
              price_id: buffer.price_id,
              product_id: buffer.product_id,
              order_tp: "B",
              price,
              size,
            };  
            lines.push(toILP(buffer.topic, buffer.ts, row));
          }

          for (const [price, size] of sortedAsks) {
            const row = {
              ts: buffer.ts,
              exchange_cd: buffer.exchange_cd,
              price_id: buffer.price_id,
              product_id: buffer.product_id,
              order_tp: "A",
              price,
              size,
            };
            lines.push(toILP(buffer.topic, buffer.ts, row));
          }
        }
        
        if (lines.length > 0 && process.env.IS_SAVE_DB === "true") {
          ilp.write(lines);
        }
        
        global.__orderbookBuffer.clear();
      }
      
      await batcher.close();      // 남은 배치 flush
      workQueue.close();
      await workQueue.drain();
      pull.close();
      ilp.end();
    } catch (e) {
      logger.error({ ex: "SHUTDOWN", err: e }, "[SHUTDOWN] error:");
    } finally {
      logger.info({ ex: "SHUTDOWN" }, "[SHUTDOWN] done");
      process.exit(0);
    }
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = { startPullQueue };
