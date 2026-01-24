"use strict";

/**
 * FKBRTI (Mid VWAP) — single symbol
 * - Buy VWAP  : asks (low→high)
 * - Sell VWAP : bids (high→low)
 * - Index     : (Buy VWAP + Sell VWAP)/2
 * - Exclusions:
 *    * Stale books (ts older than STALE_MS)
 *    * Crossed books (bestBid > bestAsk)
 * - If ALL EXPECTED_EXCHANGES are unavailable → provisional(last).
 *   If this persists > PROV_MAX_MS → no_publish.
 */

const { latestTickerByExchange } = require('../utils/common');

const { quest_db, sequelize } = require('../db/quest_db.js');
const logger = require('../utils/logger.js');

const { send_publisher } = require('../utils/zmq-sender-pub.js');
const common = require('../utils/common');
const { createIlpWriter, toILP_Fkbrti1sec } = require('../utils/ilp-writer.js');

const DEPTH        = num("DEPTH", 15);
const TICK_MS      = num("TICK_MS", 1000);
const DECIMALS     = num("DECIMALS", 8);
const STALE_MS     = num("STALE_MS", 30_000);
const PROV_MAX_MS  = num("PROV_MAX_MS", 60_000);
const EXPECTED_EXCHANGES = (process.env.SUB_TOPICS || "E0010001,E0020001,E0030001,E0050001").split(",").map(s => s.trim()).filter(Boolean);

function num(k, d) {
  const v = process.env[k];
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
}
const toNum  = (x) => {
  if (x === null || x === undefined) return 0;
  if (typeof x === "string") {
    const num = Number(x);
    return isNaN(num) ? 0 : num;
  }
  if (typeof x === "number") {
    return isNaN(x) ? 0 : x;
  }
  return 0;
};
const roundN = (x, n = 2) => { const k = 10 ** n; return Math.round(x * k) / k; };

function normalize(snapshot) {
  try {
    // console.log("snapshot", JSON.stringify(snapshot, null, 2));
    const bids = (snapshot.bid || [])
      .filter(item => Array.isArray(item) && item.length >= 2)
      .map(([p, q]) => ({ price: toNum(p), qty: toNum(q) }))
      .filter(({ price, qty }) => price > 0 && qty > 0)  // price > 0, qty > 0 필터링
      .sort((a, b) => b.price - a.price)
      .slice(0, DEPTH);

    const asks = (snapshot.ask || [])
      .filter(item => Array.isArray(item) && item.length >= 2)
      .map(([p, q]) => ({ price: toNum(p), qty: toNum(q) }))
      .filter(({ price, qty }) => price > 0 && qty > 0)  // price > 0, qty > 0 필터링
      .sort((a, b) => a.price - b.price)
      .slice(0, DEPTH);

    return { bids, asks };
  } catch (error) {
    logger.error({ ex: "FKBRTI", err: String(error), snapshot }, 'normalize 함수 에러');
    return { bids: [], asks: [] };
  }
}

function isCrossed(book) {
  if (!book?.bids?.length || !book?.asks?.length) return true; // 결측도 제외
  return book.bids[0].price > book.asks[0].price; // bestBid > bestAsk
}

// VWAP = Σ(P*Q)/ΣQ
// VWAP 공식에서 price가 0이거나 qty가 0인 경우는 무시되어야 한다.
// 즉, price > 0 && qty > 0 인 레벨만 대상으로 함
// 반환값: {vwap, price_sum, qty_sum}
function vwap(levels, targetSecond) {
  let pq = 0, q = 0;
  for (const { price, qty } of levels) {
    if (price > 0 && qty > 0) {
      pq += price * qty;
      q += qty;
    }
  }
  return {
    vwap: q > 0 ? pq / q : 0,
    price_sum: pq,
    qty_sum: q,
    targetSecond: targetSecond ? new Date(targetSecond * 1000).toISOString() : null,
  };
}

class FkbrtiEngine {
  /**
   * opts?: { symbol?, depth?, tickMs?, decimals?, staleMs?, provMaxMs?, expectedExchanges? }
   * - 프로세스당 1개 심볼만 처리
   */
  constructor(opts = {}) {
    this.symbol    = opts.symbol || null; // 없으면 첫 스냅샷에서 채움
    this.depth     = Number(opts.depth     || DEPTH);
    this.tickMs    = Number(opts.tickMs    || TICK_MS);
    this.decimals  = Number(opts.decimals  || DECIMALS);
    this.staleMs   = Number(opts.staleMs   || STALE_MS);
    this.provMaxMs = Number(opts.provMaxMs || PROV_MAX_MS);
    this.expected  = (opts.expectedExchanges || EXPECTED_EXCHANGES).slice();
    this.table_name = opts.table_name;
    this.booksByEx = Object.create(null);
    this.last = null;
    this._timer = null;
    this.lastProcessedSecond = null; // 마지막으로 처리한 marketAt의 초 단위
    this.is_batch_mode = opts.is_batch_mode || false; // 배치 모드 플래그
    
    // 배치 모드일 때 ILP writer 초기화
    // 외부에서 전달된 ilpWriter가 있으면 사용하고, 없으면 새로 생성
    this.ilpWriter = opts.ilpWriter || null;
    if (this.is_batch_mode && !this.ilpWriter) {
      this.ilpWriter = createIlpWriter({});
    }
  }

  start() {
    if (this._timer) return;
    // timer는 최대 지연 시간 체크용으로만 사용 (2초마다 체크)
    // 실제 집계는 ts 기준으로 수행
    this._timer = setInterval(() => {
      // const now = Date.now();
      // const currentSecond = Math.floor(now / 1000);
      
      // // 마지막 처리한 초가 2초 이상 지났으면 강제로 처리
      // if (this.lastProcessedSecond !== null && currentSecond > this.lastProcessedSecond + 1) {
      //   // 지연된 초들을 처리
      //   for (let sec = this.lastProcessedSecond + 1; sec < currentSecond; sec++) {
      //     this._tick(sec * 1000);
      //   }
      //   this.lastProcessedSecond = currentSecond - 1;
      // }
    }, 2000); // 2초마다 체크
  }
  stop() { if (this._timer) clearInterval(this._timer); this._timer = null; }

  // 실시간 스냅샷 주입
  onSnapshotOrderBook(snap) {
    try {
      if (!this.symbol) this.symbol = String(snap.symbol || "").trim() || "(UNKNOWN)";
      const ex = String(snap.exchange_cd || "UNKNOWN");
      const { bids, asks } = normalize(snap);
      
      // 타임스탬프 처리 개선
      let ts = Date.now(); // 기본값
      if (snap.ts) {
        if (typeof snap.ts === 'string') {
          ts = new Date(snap.ts).getTime();
        } else if (snap.ts instanceof Date) {
          ts = snap.ts.getTime();
        } else if (typeof snap.ts === 'number') {
          ts = snap.ts;
        }
      }

      const currentSecond = Math.floor(ts / 1000);

      // 배치 모드가 아닐 때만 자동 _tick 호출
      if (!this.is_batch_mode) {
        // marketAt의 초 단위 확인
        // 새로운 초가 시작되면 이전 초의 데이터를 집계
        if (this.lastProcessedSecond !== null && currentSecond > this.lastProcessedSecond) {
          // 이전 초의 데이터를 집계하여 저장
          this._tick(this.lastProcessedSecond * 1000);
          this.lastProcessedSecond = currentSecond;
        } else if (this.lastProcessedSecond === null) {
          // 첫 번째 데이터
          this.lastProcessedSecond = currentSecond;
        }
      }

      const key = `${ex}_${currentSecond}`;
      this.booksByEx[key] = { bids, asks, ts, second: currentSecond };


    } catch (error) {
      logger.error({ ex: "FKBRTI", err: String(error), snap }, 'FkbrtiEngine.onSnapshot 에러');
    }
  }

  _tick(targetTime = null) {
    const now = targetTime || Date.now();
    // 배치 모드에서는 stale 체크를 비활성화 (과거 데이터 처리)
    const cutoff = this.is_batch_mode ? 0 : (now - this.staleMs);
    // 병합: 스테일 & 역전 제외 => 예외상황 제외
    const bids = [], asks = [];

    if ( this.booksByEx == null || this.booksByEx == undefined || this.booksByEx.length == 0 ) {
      return;
    }

    const targetSecond = Math.floor(targetTime / 1000);
    const lastSecond = targetSecond + 1;
    
    for (const ex of Object.keys(this.booksByEx)) {
      const rec = this.booksByEx[ex];
      if (!rec) continue;    
      if ( rec.second !== targetSecond ) 
      {
        continue;
      }

      // 배치 모드가 아닐 때만 stale 체크
      if (!this.is_batch_mode && rec.ts < cutoff) continue;                  // 30s 이상 지연 제외

      // 역전 제외
      const book = { bids: rec.bids, asks: rec.asks, second: rec.second };
      if (isCrossed(book))
      {
        continue;
      }          
      if (rec.bids?.length) bids.push(...rec.bids);
      if (rec.asks?.length) asks.push(...rec.asks);
    }
  

    //VWAP은 전체 거래소의 호가를 대상으로 계산하니까 정렬은 필요없고 호가 제한도 필요없다.
    const buyVWAPResult = vwap(asks, targetSecond);
    const sellVWAPResult = vwap(bids, targetSecond);
    
    const buyVWAP = buyVWAPResult.vwap;
    const sellVWAP = sellVWAPResult.vwap;

    let indexMid = (buyVWAP + sellVWAP) / 2;

    // 기대 거래소 상태 평가(스테일/역전/결측을 모두 무효 처리)
    const expected_status = this.expected.map(ex => {

      const key = `${ex}_${targetSecond}`;
      const rec = this.booksByEx[key];

      // rec가 없으면 no_data 반환
      if (!rec) {
        return { exchange: ex, reason: "no_data", price: 0 };
      }

      const ticker_key = `${ex}_${this.symbol}`;
      const ticker = latestTickerByExchange.get(ticker_key);

      let ticker_price = toNum(ticker?.close);

      if ( ticker == undefined ) {
        // ticker 가 없다면 매수1호가, 매도1호가 의 평균값으로 계산
        let price = 0;
        if (rec && ((rec.bids?.length ?? 0) > 0) && ((rec.asks?.length ?? 0) > 0)) {
          // bid1, ask1의 평균값
          price = (rec.bids[0].price + rec.asks[0].price) / 2;
          ticker_price = toNum(price);
        }
      }

      if (!ticker_price) return { exchange: ex, reason: "no_data", price: 0 };
      // 배치 모드가 아닐 때만 stale 체크
      if (!this.is_batch_mode && rec.ts < cutoff) return { exchange: ex, reason: "stale", price: 0 };

      const book = { bids: rec.bids, asks: rec.asks };
      if (isCrossed(book)) return { exchange: ex, reason: "crossed", price: 0 };

      const ok = (rec.bids?.length || 0) > 0 || (rec.asks?.length || 0) > 0;
      return { 
        exchange: ex, 
        reason: ok ? "ok" : "empty_book", 
        price: ok ? ticker_price : 0,
      };
    });

    // expected_status 배열 안에 reason이 "ok"인 요소가 하나라도 있는지 확인.
    const anyExpectedOk = expected_status.some(s => s.reason === "ok");
    let shouldProvisional = !anyExpectedOk;

    let actual_avg = 0;
    let diff = 0;
    let ratio = 0;

    let sum = 0;
    let count = 0;
    for (const expected_status_item of expected_status) {
      if (expected_status_item.reason == "ok") {
        sum += expected_status_item.price;
        if ( expected_status_item.price > 0 ) {
          count++;
        }
      } else {
        expected_status_item.price = 0;
      }
    }
    actual_avg = common.isEmpty( sum / count ) ? 0 : sum / count;

    let E0010001 = expected_status.find(item => item.exchange == "E0010001")?.price;
    let E0020001 = expected_status.find(item => item.exchange == "E0020001")?.price;
    let E0030001 = expected_status.find(item => item.exchange == "E0030001")?.price;
    let E0050001 = expected_status.find(item => item.exchange == "E0050001")?.price;

    let E0010001_reason = expected_status.find(item => item.exchange == "E0010001")?.reason;
    let E0020001_reason = expected_status.find(item => item.exchange == "E0020001")?.reason;
    let E0030001_reason = expected_status.find(item => item.exchange == "E0030001")?.reason;
    let E0050001_reason = expected_status.find(item => item.exchange == "E0050001")?.reason;

    let no_data = false;

    if ( E0010001_reason == "no_data" && E0020001_reason == "no_data" 
      && E0030001_reason == "no_data" && E0050001_reason == "no_data" ) {
      no_data = true;
    }

    if ( E0010001 != 0 )
    {
      diff = E0010001 - indexMid;
    } else if ( E0020001 != 0 ) {
      diff = E0020001 - indexMid;
    } else if ( E0030001 != 0 ) {
      diff = E0030001 - indexMid;
    } else if ( E0050001 != 0 ) {
      diff = E0050001 - indexMid;
    }

    ratio = Math.abs(diff / indexMid) * 100;

    if ( no_data ) {
      diff = 0;
      ratio = 0;
    }

    if ( E0010001 == 0 && E0020001 == 0 && E0030001 == 0 && E0050001 == 0 ) {
      diff = 0;
      ratio = 0;
    }

    if ( common.isEmpty(indexMid) ) {
      return;
    }

    if (!shouldProvisional && Number.isFinite(indexMid)) {
      const out = {
        type: "fkbrti",
        t: (() => {
          try {
            return new Date(now + 9 * 60 * 60 * 1000).toISOString();
          } catch (e) {
            return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
          }
        })(),
        symbol: this.symbol || "(UNKNOWN)",
        depth: this.depth,
        stale_ms: this.staleMs,
        vwap_buy:  roundN(buyVWAP,  this.decimals),
        vwap_sell: roundN(sellVWAP, this.decimals),
        index_mid: roundN(indexMid, this.decimals),
        no_data: no_data,
        expected_status,
        // provisional: 산출값이 잠정치(이전값을 임시사용)인지 여부. false면 이번 계산값이 정상 산출된 것임.
        provisional: false,
        // no_publish: 결과 산출은 했지만 외부 전파(저장, 브로드캐스트 등)는 하지 않을 때 true로 설정합니다.
        no_publish: false,
        diff: diff,
        ratio: ratio,
        actual_avg: actual_avg
      };

      this.insertFkbrti1sec(out);

      this.last = {
        ts: now,
        buy: out.vwap_buy, sell: out.vwap_sell, mid: out.index_mid,
        provisionalSince: undefined
      };
    } else {
      // 잠정치 또는 미산출
      if (this.last) {
        if (!this.last.provisionalSince) this.last.provisionalSince = now;
        const elapsed = now - this.last.provisionalSince;
        const out = {
          type: "fkbrti",
          t: (() => {
            try {
              return new Date(now + 9 * 60 * 60 * 1000).toISOString();
            } catch (e) {
              return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
            }
          })(),
          symbol: this.symbol || "(UNKNOWN)",
          depth: this.depth,
          stale_ms: this.staleMs,
          vwap_buy:  this.last.buy,
          vwap_sell: this.last.sell,
          index_mid: this.last.mid,
          no_data: no_data,
          expected_status,
          provisional: elapsed <= this.provMaxMs,
          no_publish: elapsed > this.provMaxMs,
          reason: "all_expected_exchanges_unavailable_or_invalid",
          diff: diff,
          ratio: ratio,
          actual_avg: actual_avg,
        };

        this.insertFkbrti1sec(out);

      } else {
        // 직전값도 없음 → 미산출
        const out = {
          type: "fkbrti",
          t: (() => {
            try {
              return new Date(now + 9 * 60 * 60 * 1000).toISOString();
            } catch (e) {
              return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
            }
          })(),
          symbol: this.symbol || "(UNKNOWN)",
          depth: this.depth,
          stale_ms: this.staleMs,
          vwap_buy:  null,
          vwap_sell: null,
          index_mid: null,
          no_data: no_data,
          expected_status,
          provisional: false,
          no_publish: true,
          reason: "no_history_and_all_expected_unavailable_or_invalid",
          diff: diff,
          ratio: ratio,
          actual_avg: actual_avg,
        };

        this.insertFkbrti1sec(out);
      }
    }

    //전체 처리후 처리된 데이터 삭제
    for (const ex of Object.keys(this.booksByEx)) {
      const rec = this.booksByEx[ex];
      if ( rec.second < lastSecond ) 
      {
        delete this.booksByEx[ex];
      }
    }
  }

  insertFkbrti1sec(item) {
    // 배치 모드일 때는 ILP로 insert
    if (this.is_batch_mode && this.ilpWriter) {
      try {
        const ilpLine = toILP_Fkbrti1sec({
          symbol: item.symbol,
          vwap_buy: item.vwap_buy,
          vwap_sell: item.vwap_sell,
          index_mid: item.index_mid,
          expected_status: item.expected_status,
          no_data: item.no_data,
          provisional: item.provisional,
          no_publish: item.no_publish,
          diff: item.diff,
          ratio: item.ratio,
          actual_avg: item.actual_avg,
          createdAt: new Date(item.t).toISOString(),
        }, this.table_name);
        
        this.ilpWriter.write(ilpLine);
        
      } catch (err) {
        logger.error({ ex: "FKBRTI", err: String(err), stack: err.stack }, "[ILP] tb_fkbrti_1sec insert 실패");
      }
    } else {
      // 실시간 모드일 때는 SQL로 insert
      quest_db.sequelize.query(
        `
        INSERT INTO :table_name (
            symbol,
            vwap_buy,
            vwap_sell,
            index_mid,
            expected_status,
            no_data,
            provisional,
            no_publish,
            diff,
            ratio,
            actual_avg,
            createdAt
          ) VALUES (
            :symbol,
            :vwap_buy,
            :vwap_sell,
            :index_mid,
            :expected_status,
            :no_data,
            :provisional,
            :no_publish,
            :diff,
            :ratio,
            :actual_avg,
            :createdAt
          )
          `,
          {
            replacements: {
              table_name: this.table_name,
              symbol: item.symbol,
              vwap_buy: item.vwap_buy,
              vwap_sell: item.vwap_sell,
              index_mid: item.index_mid,
              expected_status: JSON.stringify(item.expected_status),
              no_data: item.no_data,
              provisional: item.provisional,
              no_publish: item.no_publish,
              diff: item.diff,
              ratio: item.ratio,
              actual_avg: item.actual_avg,
              createdAt: new Date(item.t).toISOString(),
            }
          }
        )
        .then(() => {
          // console.log("insertFkbrti1sec", item);
          send_publisher("fkbrti", item);
        })
        .catch((err) => {
          logger.error({ ex: "FKBRTI", err: String(err) }, "[DB] tb_fkbrti_1sec insert 실패");
        });
    }
  }

  /**
   * ILP writer 종료 (배치 모드 종료 시 호출)
   */
  endIlpWriter() {
    if (this.ilpWriter) {
      this.ilpWriter.end();
      this.ilpWriter = null;
    }
  }
}

module.exports = { FkbrtiEngine };

