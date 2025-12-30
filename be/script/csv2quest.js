#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const net = require('net');
const os = require('os');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const WorkerThreads = require('worker_threads');

const Worker = WorkerThreads.Worker;
const isMainThread = WorkerThreads.isMainThread;
const parentPort = WorkerThreads.parentPort;

// =============== 공통 설정 ===============
const QDB_ILP_HOST = process.env.QDB_ILP_HOST || '127.0.0.1';
const QDB_ILP_PORT = parseInt(process.env.QDB_ILP_PORT || '30099', 10);
const QDB_HTTP_HOST = process.env.QDB_HTTP_HOST || process.env.QDB_HOST || '127.0.0.1';
const QDB_HTTP_PORT = parseInt(process.env.QDB_HTTP_PORT || process.env.QDB_PORT || '30091', 10);
const TABLE_NAME = process.env.TABLE_NAME || 'tb_order_book_units_temp';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50000', 10);
const CSV_INPUT = process.argv[2] || process.env.CSV_FILE || './csv';
// 시간 차이 (KST -> UTC 변환 시 빼야 할 시간, 기본값: 9시간)
// 우선순위: 명령줄 인수 > 환경 변수 > 기본값
const TIME_OFFSET_HOURS = parseInt(
    process.argv[3] || process.env.TIME_OFFSET_HOURS || '0',
    10
);

// 마이크로초 카운터는 processCsvFile 함수 내에서 파일별로 관리됩니다


// Node 구버전 호환: optional chaining 제거
const cpuInfo = os.cpus();
const maxCpus = (cpuInfo && cpuInfo.length) ? cpuInfo.length : 2;

// 병렬 worker 수
let concurrency = parseInt(process.env.CONCURRENCY || "2", 10);
if (!concurrency || concurrency < 1) concurrency = 2;
if (concurrency > maxCpus) concurrency = maxCpus;

// =============== 유틸 함수 ===============

function log(prefix, msg) {
    const ts = new Date().toISOString().replace("T", " ").replace(/\..+/, "");
    console.log("[" + ts + "] [" + prefix + "] " + msg);
}

function escTag(v) {
    v = String(v);
    v = v.replace(/\\/g, "\\\\");
    v = v.replace(/,/g, "\\,");
    v = v.replace(/=/g, "\\=");
    v = v.replace(/ /g, "\\ ");
    return v;
}

function intField(v) {
    const n = parseInt(v, 10);
    return (isNaN(n) ? "0i" : n + "i");
}

function floatField(v) {
    if (!v) return "0";
    const s = String(v).trim();
    if (!s) return "0";
    const n = Number(s);
    return isNaN(n) ? "0" : s;
}

// makeMarketAtString 함수를 클로저로 감싸서 카운터를 관리
function createMakeMarketAtString() {
    // 같은 초에 여러 행이 있을 때 각 행마다 고유한 마이크로초 부여
    // 타임스탬프 키(초 단위) -> 마이크로초 카운터 맵
    const timestampMicroMap = new Map();
    
    return function makeMarketAtString(tranDate, tranTime, rowNumber) {
        if (!tranDate || !tranTime || tranDate.length < 8 || tranTime.length < 6) {
            const d = new Date();
            const p = (n, len = 2) => ("" + n).padStart(len, '0');
            return (
                d.getFullYear() + "-" +
                p(d.getMonth() + 1) + "-" +
                p(d.getDate()) + "T" +
                p(d.getHours()) + ":" +
                p(d.getMinutes()) + ":" +
                p(d.getSeconds()) + "." +
                p(d.getMilliseconds(), 6) + "Z"
            );
        }
        
        // 같은 날짜/시간(초 단위)에 대해 순차적으로 증가하는 마이크로초 부여
        const timestampKey = tranDate.slice(0, 8) + tranTime.slice(0, 6);
        
        let micro;
        if (!timestampMicroMap.has(timestampKey)) {
            // 새로운 초면 마이크로초를 0부터 시작
            timestampMicroMap.set(timestampKey, 0);
            micro = 0;
        } else {
            // 같은 초 내에서 마이크로초를 증가
            const currentMicro = timestampMicroMap.get(timestampKey) + 1;
            timestampMicroMap.set(timestampKey, currentMicro);
            micro = currentMicro;
        }
        
        // 마이크로초는 0~999999 범위 (6자리)
        // 1초 내에 100만 개 이상의 행이 있으면 순환 (거의 불가능하지만 안전장치)
        if (micro > 999999) {
            micro = micro % 1000000;
        }
        
        const pad6 = n => String(n).padStart(6, '0');
        const microStr = pad6(micro);
        
        return (
            tranDate.slice(0, 4) + "-" +
            tranDate.slice(4, 6) + "-" +
            tranDate.slice(6, 8) + "T" +
            tranTime.slice(0, 2) + ":" +
            tranTime.slice(2, 4) + ":" +
            tranTime.slice(4, 6) + "." + microStr + "Z"
        );
    };
}

// 기본 makeMarketAtString 함수 (카운터 없이 사용하는 경우를 위해)
let makeMarketAtString = createMakeMarketAtString();

// TIMESTAMP 필드를 마이크로초 타임스탬프로 변환 (QuestDB ILP 형식: 1234567890000t)
function tsFieldMicros(v) {
    // v: Date | number(ms|s) | string(ISO)
    let ms;
    if (v instanceof Date) {
        ms = v.getTime();
    } else if (typeof v === "number" && Number.isFinite(v)) {
        // 초 단위인지 밀리초 단위인지 판단 (1e12 = 2001-09-09 기준)
        ms = v < 1e12 ? v * 1000 : v; // s→ms
    } else {
        ms = Date.parse(String(v));
    }
    if (!Number.isFinite(ms)) {
        ms = Date.now();
    }
    const micros = Math.trunc(ms * 1000);
    
    return `${micros}t`;
}

// ISO 8601 문자열을 나노초 타임스탬프로 변환 (QuestDB designated timestamp용)
// 각 행마다 순차적으로 증가하는 나노초 값을 보장하기 위해 카운터를 사용
function createToNs() {
    // 같은 밀리초에 여러 행이 있을 때 순차적으로 증가하는 나노초 카운터
    let lastNs = null;
    let counter = 0;
    
    return function toNs(isoString) {
        if (!isoString) {
            const now = Date.now();
            return BigInt(now) * 1_000_000n;
        }
        
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) {
                const now = Date.now();
                return BigInt(now) * 1_000_000n;
            }
            
            // 밀리초를 나노초로 변환 (기본값)
            const baseNs = BigInt(date.getTime()) * 1_000_000n;
            
            // 같은 타임스탬프에 대해 순차적으로 증가
            if (lastNs !== null && baseNs === lastNs) {
                counter++;
                // 나노초 단위로 1씩 증가 (같은 밀리초 내에서 순차적)
                return baseNs + BigInt(counter);
            } else {
                // 새로운 타임스탬프면 카운터 리셋
                lastNs = baseNs;
                counter = 0;
                return baseNs;
            }
        } catch (e) {
            const now = Date.now();
            return BigInt(now) * 1_000_000n;
        }
    };
}

function csvRowToILP(line, timeOffsetHours, makeMarketAtStringFn, rowNumber, toNsFn) {
    if (!line || !line.trim()) return null;

    const parts = line.replace(/\r?\n$/, '').split(',');
    if (parts.length < 8) return null;
    
    // timeOffsetHours가 전달되지 않으면 전역 상수 사용
    const offsetHours = timeOffsetHours !== undefined ? timeOffsetHours : TIME_OFFSET_HOURS;

    let [
        tranDate,
        tranTime,
        exchangeCd,
        priceId,
        productId,
        orderTp,
        price,
        size,
    ] = parts;

    tranDate = (tranDate || "").trim();
    tranTime = (tranTime || "").trim();
    exchangeCd = (exchangeCd || "").trim();

    if (/tran_date/i.test(tranDate)) return null;
    if (!tranDate || !tranTime || !exchangeCd) return null;

    const ot = (orderTp || "").trim().split(/\s+/)[0];
    const orderTpClean = ot || (orderTp || "").trim();

    // tranTime는 090000 형태로 들어옴. TIME_OFFSET_HOURS만큼 시간을 뺀 값으로 변환
    // TIME_OFFSET_HOURS는 명령줄 인수 또는 환경 변수로 설정 가능 (기본값: 9, KST -> UTC 변환)
    let tranTimeAdjusted = "";
    if (tranTime && tranTime.length >= 6) {
        let hour = parseInt(tranTime.slice(0, 2), 10);
        let min = parseInt(tranTime.slice(2, 4), 10);
        let sec = parseInt(tranTime.slice(4, 6), 10);

        if (!isNaN(hour)) {
            let newHour = hour - offsetHours;
            if (newHour < 0) newHour += 24;
            // 0 미만이면 하루 뺀 로직은 필요없다고 가정 (tranDate 변경X)
            let pad = (n) => String(n).padStart(2, "0");
            tranTimeAdjusted = pad(newHour) + pad(min) + pad(sec);
        } else {
            tranTimeAdjusted = "000000";
        }
    } else {
        tranTimeAdjusted = "000000";
    }
    tranTime = tranTimeAdjusted;

    // makeMarketAtStringFn이 전달되면 사용, 없으면 전역 함수 사용
    const makeMarketAt = makeMarketAtStringFn || makeMarketAtString;
    // rowNumber가 전달되면 사용 (각 행마다 고유한 마이크로초 보장)
    const marketAt = makeMarketAt(tranDate, tranTime, rowNumber);

    const tags =
        "exchange_cd=" + escTag(exchangeCd) +
        ",order_tp=" + escTag(orderTpClean);

    const fields = [
        'tran_date="' + tranDate + '"',
        'tran_time="' + tranTime + '"',
        "price_id=" + intField(priceId),
        "product_id=" + intField(productId),
        "price=" + floatField(price),
        "size=" + floatField(size),
        "marketAt=" + tsFieldMicros(marketAt),      // TIMESTAMP 형식 (마이크로초)
        "collectorAt=" + tsFieldMicros(marketAt),   // TIMESTAMP 형식 (마이크로초)
        "dbAt=" + tsFieldMicros(marketAt),          // TIMESTAMP 형식 (마이크로초)
        "diff_ms=0.0",
        "diff_ms_db=0.0",
    ].join(",");

    // designated timestamp를 위한 나노초 타임스탬프
    // marketAt 필드의 마이크로초 값을 나노초로 변환하여 사용 (동일한 값 보장)
    // toNsFn이 전달되면 사용 (각 행마다 순차적으로 증가하는 나노초 보장)
    const toNs = toNsFn || createToNs();
    
    // marketAt ISO 문자열에서 나노초 타임스탬프 계산
    // 이 값은 marketAt 필드의 마이크로초 값을 나노초로 변환한 것과 동일합니다
    const ns = toNs(marketAt);

    // ILP 라인 끝에 designated timestamp 추가 (나노초 단위)
    // QuestDB는 이 timestamp를 테이블의 designated timestamp로 사용하며,
    // 테이블 스키마가 TIMESTAMP(marketAt)로 지정되어 있으므로,
    // 별도의 timestamp 컬럼이 생성되지 않고, marketAt 컬럼이 designated timestamp로 사용됩니다.
    // designated timestamp 값은 marketAt 필드 값과 동일한 나노초 값이어야 합니다.
    return TABLE_NAME + "," + tags + " " + fields + " " + ns.toString();
}

// =============== 테이블 생성 함수 ===============
async function ensureTableExists() {
    const CREATE_TABLE_SQL = `
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
            tran_date       SYMBOL,
            tran_time       SYMBOL,
            exchange_cd     SYMBOL CAPACITY 1024,
            price_id        LONG,
            product_id      LONG,
            order_tp        SYMBOL CAPACITY 4,
            price           DOUBLE,
            size            DOUBLE,
            marketAt        TIMESTAMP,
            collectorAt     TIMESTAMP,
            dbAt            TIMESTAMP,
            diff_ms         DOUBLE,
            diff_ms_db      DOUBLE
        ) TIMESTAMP(marketAt)
            PARTITION BY DAY
            WAL;`;

    // SQL을 한 줄로 변환하고 공백 정리 (주석 제거)
    let query = CREATE_TABLE_SQL.replace(/--.*$/gm, ''); // 주석 제거
    query = query.replace(/\s+/g, ' ').trim(); // 공백 정리
    
    // URL 인코딩
    const encodedQuery = encodeURIComponent(query);
    const url = `http://${QDB_HTTP_HOST}:${QDB_HTTP_PORT}/exec?query=${encodedQuery}`;
    
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            timeout: 10000
        };
        
        const req = client.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    log("MAIN", `WARNING: HTTP ${res.statusCode} - ${data}`);
                    resolve(false);
                    return;
                }
                
                // 응답에 에러가 있는지 확인
                if (data && (data.toLowerCase().includes('error') || data.toLowerCase().includes('exception'))) {
                    log("MAIN", `WARNING: Table creation response contains error: ${data}`);
                    log("MAIN", "Continuing anyway (table may already exist)...");
                    resolve(false);
                } else {
                    log("MAIN", `Table ${TABLE_NAME} ensured (created or already exists)`);
                    resolve(true);
                }
            });
        });
        
        req.on('error', (err) => {
            log("MAIN", `ERROR: Failed to connect to QuestDB HTTP API: ${err.message}`);
            log("MAIN", "Continuing anyway (table may be created on first insert)...");
            resolve(false);
        });
        
        req.on('timeout', () => {
            req.destroy();
            log("MAIN", "ERROR: Request timeout while creating table");
            log("MAIN", "Continuing anyway (table may be created on first insert)...");
            resolve(false);
        });
        
        req.end();
    });
}

// =============== 한 파일 처리 (워커 & 메인 공통) ===============
async function processCsvFile(info) {
    const filePath = info.filePath;
    const prefix = info.workerId ? ("W" + info.workerId) : "MAIN";
    // 워커 스레드에서 전달받은 timeOffsetHours 사용 (없으면 전역 상수 사용)
    const timeOffsetHours = info.timeOffsetHours !== undefined ? info.timeOffsetHours : TIME_OFFSET_HOURS;
    
    // 파일별로 독립적인 makeMarketAtString 함수 생성 (카운터 관리)
    const makeMarketAtStringForFile = createMakeMarketAtString();
    // 파일별로 독립적인 toNs 함수 생성 (나노초 순차 증가 보장)
    const toNsForFile = createToNs();

    log(prefix, "Start " + filePath);

    const isGz = filePath.endsWith(".gz");

    const socket = new net.Socket();
    await new Promise((res, rej) => {
        socket.connect(QDB_ILP_PORT, QDB_ILP_HOST, res);
        socket.on("error", rej);
    });

    log(prefix, "Connected ILP");

    let lineCount = 0;
    let skip = 0;
    let batch = [];
    let rowNumber = 0; // 각 행마다 순차적으로 증가하는 번호

    const stream = fs.createReadStream(filePath);
    const input = isGz ? stream.pipe(zlib.createGunzip()) : stream;

    const rl = readline.createInterface({ input, crlfDelay: Infinity });

    for await (let line of rl) {
        rowNumber++; // 각 행마다 순차적으로 증가
        const ilp = csvRowToILP(line, timeOffsetHours, makeMarketAtStringForFile, rowNumber, toNsForFile);
        if (!ilp) {
            skip++;
            continue;
        }
        batch.push(ilp);
        lineCount++;

        if (batch.length >= BATCH_SIZE) {
            const payload = batch.join("\n") + "\n";
            if (!socket.write(payload)) {
                await new Promise((r) => socket.once("drain", r));
            }
            batch = [];
        }
    }

    if (batch.length) {
        const payload = batch.join("\n") + "\n";
        if (!socket.write(payload)) {
            await new Promise((r) => socket.once("drain", r));
        }
    }

    socket.end();
    await new Promise((res) => socket.on("close", res));

    log(prefix, "Done " + filePath + " lines=" + lineCount + " skipped=" + skip);
}

// =============== 워커 로직 ===============
if (!isMainThread) {
    parentPort.on("message", async (msg) => {
        if (msg.type === "process") {
            try {
                await processCsvFile(msg);
                parentPort.postMessage({ type: "done", workerId: msg.workerId });
            } catch (err) {
                parentPort.postMessage({ type: "error", workerId: msg.workerId, error: String(err) });
            }
        } else if (msg.type === "exit") {
            process.exit(0);
        }
    });
}

// =============== 메인 스레드 ===============
if (isMainThread) {
    (async () => {
        log("MAIN", "Parallel CSV → QuestDB loader");
        log("MAIN", "Concurrency=" + concurrency + ", BATCH=" + BATCH_SIZE);

        async function listFiles(p) {
            const st = await fsp.stat(p);
            if (st.isFile()) return [p];

            const items = await fsp.readdir(p, { withFileTypes: true });
            return items
                .filter((e) => e.isFile())
                .map((e) => path.join(p, e.name))
                .filter((f) => f.endsWith(".csv") || f.endsWith(".csv.gz"));
        }

        const files = await listFiles(CSV_INPUT);
        if (!files.length) {
            log("MAIN", "No CSV files");
            process.exit(1);
        }

        log("MAIN", "Found " + files.length + " files");

        // QuestDB 테이블 생성 확인 (메인 스레드에서만 실행)
        log("MAIN", "Ensuring table " + TABLE_NAME + " exists...");
        await ensureTableExists();

        // 파일 1개 → 단일 스레드 처리
        if (files.length === 1 || concurrency === 1) {
            await processCsvFile({ filePath: files[0], workerId: null, timeOffsetHours: TIME_OFFSET_HOURS });
            log("MAIN", "All done.");
            process.exit(0);
        }

        // 병렬 처리 (Worker Threads)
        let idx = 0;
        let done = 0;
        const total = files.length;
        const workerCount = Math.min(concurrency, total);

        log("MAIN", "Starting " + workerCount + " workers...");

        await new Promise((resolve, reject) => {
            const workers = [];

            function assignNext(worker, workerId) {
                if (idx >= total) {
                    worker.postMessage({ type: "exit" });
                    return;
                }
                const fp = files[idx++];
                worker.postMessage({ type: "process", filePath: fp, workerId, timeOffsetHours: TIME_OFFSET_HOURS });
            }

            for (let i = 0; i < workerCount; i++) {
                const workerId = i + 1;
                const w = new Worker(__filename);

                w.on("message", (msg) => {
                    if (msg.type === "done") {
                        done++;
                        if (done >= total) {
                            resolve();
                        } else {
                            assignNext(w, workerId);
                        }
                    } else if (msg.type === "error") {
                        reject(new Error("Worker " + msg.workerId + ": " + msg.error));
                    }
                });

                w.on("error", reject);
                w.on("exit", () => {});

                workers.push(w);
                assignNext(w, workerId);
            }
        });

        log("MAIN", "========================================");
        log("MAIN", "All files processed!");
        log("MAIN", "========================================");
        process.exit(0);
    })();
}
