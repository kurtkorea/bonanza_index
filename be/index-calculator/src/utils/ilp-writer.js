"use strict";

/**
 * ILP Writer 유틸리티
 * QuestDB Inline Protocol을 사용하여 데이터를 삽입합니다.
 */

const net = require('net');
const logger = require('./logger.js');

/**
 * ILP Writer 생성
 * @param {Object} opts - 옵션
 * @param {string} opts.host - QuestDB ILP 호스트
 * @param {number} opts.port - QuestDB ILP 포트
 * @param {number} opts.reconnectBaseMs - 재연결 기본 지연 시간 (ms)
 * @returns {Object} { write, end } 메서드를 가진 객체
 */
function createIlpWriter({ 
  host = process.env.QDB_ILP_HOST || "127.0.0.1", 
  port = Number(process.env.QDB_ILP_PORT || 9009), 
  reconnectBaseMs = 500 
}) {
  let sock = null;
  let connected = false;
  let connecting = false;
  let ended = false; // end() 호출 여부
  let intentionalClose = false; // 의도적인 종료 여부 (end() 호출)
  let backoff = reconnectBaseMs;
  const pending = [];   // 연결 전/버퍼풀 시 임시 보관

  function connect() {
    if (connecting || connected || ended) return;
    connecting = true;

    // 기존 소켓이 있으면 정리
    if (sock) {
      try {
        sock.removeAllListeners();
        if (!sock.destroyed) {
          sock.destroy();
        }
      } catch (e) {
        // 무시
      }
      sock = null;
    }

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
      // "write after end" 에러는 조용히 무시 (재연결 중 발생할 수 있음)
      if (e.message && e.message.includes('write after end')) {
        logger.debug({ ex: "ILP", err: e.message }, "[ILP] write after end (재연결 중 무시)");
      } else {
        logger.error({ ex: "ILP", err: e.message }, "[ILP] socket error:");
      }
      scheduleReconnect();
    });

    sock.on("close", () => {
      connected = false;
      connecting = false;
      // 의도적인 종료(end() 호출)가 아닌 경우에만 경고 로그 출력
      if (!intentionalClose) {
        logger.warn("[ILP] socket closed");
      } else {
        logger.debug("[ILP] socket closed (intentional)");
      }
      if (!ended) {
        scheduleReconnect();
      }
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
    if (!connected || !sock || ended) return;
    // 소켓이 종료되었거나 쓰기 불가능한 경우 재연결
    if (sock.destroyed || !sock.writable) {
      connected = false;
      if (!ended) {
        scheduleReconnect();
      }
      return;
    }
    
    while (pending.length) {
      const chunk = pending[0];
      try {
        const ok = sock.write(chunk);
        if (!ok) return;  // 커널 송신버퍼 가득 → drain 기다림
        pending.shift();
      } catch (e) {
        // "write after end" 에러는 pending에 다시 추가하고 재연결
        if (e.message && e.message.includes('write after end')) {
          connected = false;
          if (!ended) {
            scheduleReconnect();
          }
          return;
        }
        throw e;
      }
    }
  }

  /**
   * ILP 라인들을 전송
   * @param {string|string[]} lines - ILP 라인 (각 line 끝에 '\n' 포함)
   * @returns {boolean} 전송 성공 여부
   */
  function write(lines) {
    if (ended) {
      logger.warn("[ILP] write called after end(), ignoring");
      return false;
    }
    
    const payload = Array.isArray(lines) ? lines.join("") : String(lines);
    if (!payload) return true;
    
    // 소켓이 없거나 연결되지 않은 경우 pending에 추가
    if (!connected || !sock || sock.destroyed || !sock.writable) {
      pending.push(payload);
      if (!connecting && !ended) {
        connect();
      }
      return false;
    }
    
    try {
      const ok = sock.write(payload);
      if (!ok) {
        // backpressure 발생 → 남은 건 pending에 쌓고 drain 때 flush
        pending.push(payload);
      }
      return ok;
    } catch (e) {
      // "write after end" 에러는 pending에 추가하고 재연결
      if (e.message && e.message.includes('write after end')) {
        connected = false;
        pending.push(payload);
        if (!ended) {
          scheduleReconnect();
        }
        return false;
      }
      // 다른 에러는 다시 throw
      throw e;
    }
  }

  function end() {
    ended = true;
    intentionalClose = true; // 의도적인 종료 표시
    
    // pending 데이터가 있으면 먼저 전송 시도
    if (pending.length > 0 && connected && sock && !sock.destroyed && sock.writable) {
      try {
        flushPending();
      } catch (e) {
        logger.error({ ex: "ILP", err: String(e) }, "[ILP] flush before end error");
      }
    }
    
    try {
      if (sock && !sock.destroyed) {
        // 소켓 종료 전에 모든 데이터가 전송될 때까지 기다림
        if (sock.writable && pending.length === 0) {
          sock.end();
        } else {
          // pending이 있거나 쓰기 불가능한 경우 destroy
          sock.destroy();
        }
      }
    } catch (e) {
      logger.error({ ex: "ILP", err: String(e) }, "[ILP] end error");
    }
    sock = null;
    connected = false;
    connecting = false;
  }

  connect();
  return { write, end };
}

/**
 * 타임스탬프를 나노초로 변환
 * @param {any} anyTs - 타임스탬프 (Date, number, string, BigInt)
 * @param {number} fallbackMs - 폴백 밀리초
 * @returns {BigInt} 나노초 타임스탬프
 */
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

/**
 * 타임스탬프를 마이크로초 형식으로 변환 (ILP 필드용)
 * @param {any} v - 타임스탬프 (Date | number(ms|s) | string(ISO))
 * @returns {string} 마이크로초 타임스탬프 문자열 (예: "1234567890000t")
 */
function tsFieldMicros(v) {
  let ms;
  if (v instanceof Date) ms = v.getTime();
  else if (typeof v === "number" && Number.isFinite(v)) ms = v < 1e12 ? v * 1000 : v; // s→ms
  else ms = Date.parse(String(v));
  if (!Number.isFinite(ms)) ms = Date.now();
  const micros = Math.trunc(ms * 1000);
  return `${micros}t`;
}

/**
 * 정수 필드 포맷
 * @param {any} v - 값
 * @returns {string} ILP 정수 필드 문자열 (예: "123i")
 */
function intField(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? `${Math.trunc(n)}i` : `0i`;
}

/**
 * 실수 필드 포맷
 * @param {any} v - 값
 * @returns {string} ILP 실수 필드 문자열
 */
function floatField(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? String(n) : `0`;
}

/**
 * 불린 필드 포맷
 * @param {any} v - 값
 * @returns {string} ILP 불린 필드 문자열 (예: "true", "false")
 */
function boolField(v) {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes") return "true";
    if (lower === "false" || lower === "0" || lower === "no") return "false";
  }
  return Number(v) ? "true" : "false";
}

/**
 * 태그 값 이스케이프 (태그에는 , = 공백 이스케이프)
 * @param {string} s - 문자열
 * @returns {string} 이스케이프된 문자열
 */
function escTag(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/=/g, "\\=").replace(/ /g, "\\ ");
}

/**
 * 필드 값 이스케이프 (문자열 필드에는 따옴표와 백슬래시 이스케이프)
 * @param {string} s - 문자열
 * @returns {string} 이스케이프된 문자열
 */
function escField(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")  // 백슬래시 먼저 이스케이프
    .replace(/"/g, '\\"');   // 따옴표 이스케이프
}

/**
 * tb_fkbrti_1sec 테이블용 ILP 라인 생성
 * @param {Object} data - 데이터 객체
 * @param {string} data.symbol - 심볼
 * @param {number} data.vwap_buy - 매수 VWAP
 * @param {number} data.vwap_sell - 매도 VWAP
 * @param {number} data.index_mid - 인덱스 중간값
 * @param {string|Object} data.expected_status - 예상 상태 (JSON 문자열 또는 객체)
 * @param {boolean} data.no_data - 데이터 없음 여부
 * @param {boolean} data.provisional - 잠정치 여부
 * @param {boolean} data.no_publish - 발행 안 함 여부
 * @param {number} data.diff - 차이
 * @param {number} data.ratio - 비율
 * @param {number} data.actual_avg - 실제 평균
 * @param {Date|string|number} data.createdAt - 생성 시간
 * @param {string} tableName - 테이블 이름 (기본값: "tb_fkbrti_1sec")
 * @returns {string} ILP 라인 (끝에 \n 포함)
 */
function toILP_Fkbrti1sec(data, tableName = "tb_fkbrti_1sec") {
  const tags = `symbol=${escTag(data.symbol)}`;
  
  const fields = [];
  if (data.vwap_buy != null) fields.push(`vwap_buy=${floatField(data.vwap_buy)}`);
  if (data.vwap_sell != null) fields.push(`vwap_sell=${floatField(data.vwap_sell)}`);
  if (data.index_mid != null) fields.push(`index_mid=${floatField(data.index_mid)}`);
  if (data.expected_status != null) {
    const expectedStatusStr = typeof data.expected_status === "string" 
      ? data.expected_status 
      : JSON.stringify(data.expected_status);
    // JSON 문자열을 필드 값 이스케이프하여 포함 (따옴표와 백슬래시 이스케이프)
    fields.push(`expected_status="${escField(expectedStatusStr)}"`);
  }
  if (data.no_data != null) fields.push(`no_data=${boolField(data.no_data)}`);
  if (data.provisional != null) fields.push(`provisional=${boolField(data.provisional)}`);
  if (data.no_publish != null) fields.push(`no_publish=${boolField(data.no_publish)}`);
  if (data.diff != null) fields.push(`diff=${floatField(data.diff)}`);
  if (data.ratio != null) fields.push(`ratio=${floatField(data.ratio)}`);
  if (data.actual_avg != null) fields.push(`actual_avg=${floatField(data.actual_avg)}`);
  if (data.createdAt != null) fields.push(`createdAt=${tsFieldMicros(data.createdAt)}`);

  // designated timestamp (나노초)
  const ns = toNs(data.createdAt || Date.now());
  
  return `${tableName},${tags} ${fields.join(",")} ${ns.toString()}\n`;
}

module.exports = {
  createIlpWriter,
  toILP_Fkbrti1sec,
  toNs,
  tsFieldMicros,
  intField,
  floatField,
  boolField,
  escTag,
  escField
};

