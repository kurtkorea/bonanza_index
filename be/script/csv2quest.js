#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const net = require('net');
const os = require('os');
const WorkerThreads = require('worker_threads');

const Worker = WorkerThreads.Worker;
const isMainThread = WorkerThreads.isMainThread;
const parentPort = WorkerThreads.parentPort;

// =============== 공통 설정 ===============
const QDB_ILP_HOST = process.env.QDB_ILP_HOST || '127.0.0.1';
const QDB_ILP_PORT = parseInt(process.env.QDB_ILP_PORT || '30099', 10);
const TABLE_NAME = process.env.TABLE_NAME || 'tb_order_book_temp';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50000', 10);
const CSV_INPUT = process.argv[2] || process.env.CSV_FILE || './csv';
// 시간 차이 (KST -> UTC 변환 시 빼야 할 시간, 기본값: 9시간)
// 우선순위: 명령줄 인수 > 환경 변수 > 기본값
const TIME_OFFSET_HOURS = parseInt(
    process.argv[3] || process.env.TIME_OFFSET_HOURS || '0',
    10
);


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

function makeMarketAtString(tranDate, tranTime) {
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
    return (
        tranDate.slice(0, 4) + "-" +
        tranDate.slice(4, 6) + "-" +
        tranDate.slice(6, 8) + "T" +
        tranTime.slice(0, 2) + ":" +
        tranTime.slice(2, 4) + ":" +
        tranTime.slice(4, 6) + ".000000Z"
    );
}

function csvRowToILP(line, timeOffsetHours) {
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

    const marketAt = makeMarketAtString(tranDate, tranTime);

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
        'marketAt="' + marketAt + '"',
        'collectorAt="' + marketAt + '"',
        'dbAt="' + marketAt + '"',
        "diff_ms=0.0",
        "diff_ms_db=0.0",
    ].join(",");

    return TABLE_NAME + "," + tags + " " + fields;
}

// =============== 한 파일 처리 (워커 & 메인 공통) ===============
async function processCsvFile(info) {
    const filePath = info.filePath;
    const prefix = info.workerId ? ("W" + info.workerId) : "MAIN";
    // 워커 스레드에서 전달받은 timeOffsetHours 사용 (없으면 전역 상수 사용)
    const timeOffsetHours = info.timeOffsetHours !== undefined ? info.timeOffsetHours : TIME_OFFSET_HOURS;

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

    const stream = fs.createReadStream(filePath);
    const input = isGz ? stream.pipe(zlib.createGunzip()) : stream;

    const rl = readline.createInterface({ input, crlfDelay: Infinity });

    for await (let line of rl) {
        const ilp = csvRowToILP(line, timeOffsetHours);
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
