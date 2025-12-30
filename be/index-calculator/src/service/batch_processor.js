"use strict";

/**
 * 배치 처리 서비스
 * order_book_units 테이블에서 데이터를 읽어서 FKBRTI 인덱스를 계산합니다.
 */

const { quest_db } = require('../db/quest_db.js');
const logger = require('../utils/logger.js');
const { FkbrtiEngine } = require('./fkbrti_engine.js');
const { createIlpWriter } = require('../utils/ilp-writer.js');

class BatchProcessor {
  constructor(opts = {}) {
    this.symbol = opts.symbol || 'KRW-BTC';
    this.depth = opts.depth || 15;
    this.staleMs = opts.staleMs || 30000;
    this.expectedExchanges = opts.expectedExchanges || ['E0010001', 'E0020001', 'E0030001', 'E0050001'];
    this.tableName = opts.tableName || 'tb_fkbrti_1sec';
    this.db_mysql = opts.db_mysql || null; // MySQL 연결 (선택적)
    // GC 관리를 위한 옵션
    this.chunkSizeHours = opts.chunkSizeHours || 1; // 청크 크기 (시간 단위, 기본 1시간)
    this.gcInterval = opts.gcInterval || 10000; // GC 유도 간격 (처리된 초 단위, 기본 10000초)
    this.enableGc = opts.enableGc !== false; // GC 유도 활성화 여부 (기본 true)
  }

  /**
   * 특정 시간 범위의 order_book_units 데이터를 읽어서 FKBRTI 인덱스를 계산합니다.
   * 한 달 이상의 기간은 1일 단위로 나누어서 처리합니다.
   * @param {Date|string} startTime - 시작 시간
   * @param {Date|string} endTime - 종료 시간
   * @param {Function} progressCallback - 진행 상황 콜백 (processed, total, currentDay, totalDays)
   * @returns {Promise<Object>} 처리 결과
   */
  async processBatch(startTime, endTime, progressCallback = null) {
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      
      logger.info({
        symbol: this.symbol,
        startTime: start.toISOString(),
        endTime: end.toISOString()
      }, '[BatchProcessor] 배치 처리 시작');

      // 1일 단위로 나누어서 처리
      const dayRanges = this.splitIntoDays(start, end);
      const totalDays = dayRanges.length;

      logger.info({
        totalDays,
        dayRanges: dayRanges.map(r => ({
          start: r.start.toISOString(),
          end: r.end.toISOString()
        }))
      }, '[BatchProcessor] 일 단위로 분할 완료');

      // 1. MySQL에서 symbol에 해당하는 product_id 조회 (선택적)
      let productIds = null;
      if (this.db_mysql) {
        try {
          // symbol을 price_id_cd와 product_id_cd로 분리 (예: "KRW-BTC" -> price_id_cd="KRW", product_id_cd="BTC")
          const [priceIdCd, productIdCd] = this.symbol.split('-');
          
          const productQuery = `
            SELECT DISTINCT A.product_id
            FROM tb_coin_exchange AS A
            INNER JOIN tb_coin_code AS C ON A.price_id = C.id
            INNER JOIN tb_coin_code AS D ON A.product_id = D.id
            WHERE A.use_yn = 'Y'
              AND C.code = :priceIdCd
              AND D.code = :productIdCd
          `;
          
          const productResults = await this.db_mysql.sequelize.query(productQuery, {
            replacements: { priceIdCd, productIdCd },
            type: this.db_mysql.Sequelize.QueryTypes.SELECT
          });
          
          if (productResults && productResults.length > 0) {
            productIds = productResults.map(p => p.product_id);
            logger.info({
              symbol: this.symbol,
              productIds
            }, '[BatchProcessor] product_id 조회 완료');
          }
        } catch (error) {
          logger.warn({
            err: String(error),
            symbol: this.symbol
          }, '[BatchProcessor] product_id 조회 실패, 모든 product_id 사용');
        }
      }

      // 2. 전체 배치 처리를 위한 ILP writer 생성 (모든 일별 처리에서 공유)
      const sharedIlpWriter = createIlpWriter({});
      
      // 3. 각 일별로 순차 처리
      let totalProcessed = 0;
      let totalSeconds = 0;
      const errors = [];
      const dayResults = [];

      for (let dayIndex = 0; dayIndex < dayRanges.length; dayIndex++) {
        const dayRange = dayRanges[dayIndex];
        const dayStart = dayRange.start;
        const dayEnd = dayRange.end;

        // 메모리 사용량 체크 및 경고
        const memUsage = process.memoryUsage();
        const memUsageMB = {
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024)
        };
        
        // 메모리 사용량이 1.5GB를 초과하면 경고 및 GC 강제 실행
        if (memUsageMB.heapUsed > 1536) {
          logger.warn({
            dayIndex: dayIndex + 1,
            totalDays,
            memoryUsage: memUsageMB,
            warning: '메모리 사용량이 높습니다. GC를 강제 실행합니다.'
          }, '[BatchProcessor] 메모리 사용량 경고');
          this.cleanupMemory();
          this.triggerGc();
          
          // 메모리 사용량이 1.8GB를 초과하면 치명적 경고
          if (memUsageMB.heapUsed > 1843) {
            logger.error({
              dayIndex: dayIndex + 1,
              totalDays,
              memoryUsage: memUsageMB,
              warning: '메모리 사용량이 매우 높습니다. 배치 처리를 중단할 수 있습니다.'
            }, '[BatchProcessor] 메모리 사용량 치명적 경고');
          }
        }

        logger.info({
          dayIndex: dayIndex + 1,
          totalDays,
          dayStart: dayStart.toISOString(),
          dayEnd: dayEnd.toISOString(),
          memoryUsage: memUsageMB,
          progress: `${dayIndex + 1}/${totalDays} (${((dayIndex + 1) / totalDays * 100).toFixed(1)}%)`
        }, '[BatchProcessor] 일별 처리 시작');

        try {
          // 해당 일의 데이터 조회 (공유된 ILP writer 전달)
          const dayResult = await this.processDay(
            dayStart,
            dayEnd,
            productIds,
            sharedIlpWriter,
            (processed, total) => {
              // 일별 진행 상황을 전체 진행 상황으로 변환
              const overallProcessed = totalProcessed + processed;
              const overallTotal = totalSeconds + total;
              if (progressCallback) {
                progressCallback(overallProcessed, overallTotal, dayIndex + 1, totalDays);
              }
            }
          );

          totalProcessed += dayResult.processed;
          totalSeconds += dayResult.total;
          dayResults.push({
            day: dayStart.toISOString().split('T')[0],
            ...dayResult
          });

          if (dayResult.errors && dayResult.errors.length > 0) {
            errors.push(...dayResult.errors);
          }

          logger.info({
            dayIndex: dayIndex + 1,
            totalDays,
            dayProcessed: dayResult.processed,
            dayTotal: dayResult.total,
            totalProcessed,
            totalSeconds
          }, '[BatchProcessor] 일별 처리 완료');

        } catch (error) {
          logger.error({
            err: String(error),
            stack: error.stack,
            dayIndex: dayIndex + 1,
            totalDays,
            dayStart: dayStart.toISOString(),
            dayEnd: dayEnd.toISOString(),
            memoryUsage: process.memoryUsage()
          }, '[BatchProcessor] 일별 처리 중 오류');
          
          // 메모리 정리 시도
          try {
            this.cleanupMemory();
            this.triggerGc();
          } catch (cleanupError) {
            logger.warn({ err: String(cleanupError) }, '[BatchProcessor] 메모리 정리 중 오류');
          }
          
          errors.push({
            day: dayStart.toISOString().split('T')[0],
            dayIndex: dayIndex + 1,
            error: String(error),
            memoryUsage: process.memoryUsage()
          });
          
          // 치명적 에러(메모리 부족 등)가 아닌 경우 계속 진행
          if (error.message && (
            error.message.includes('out of memory') ||
            error.message.includes('heap') ||
            error.message.includes('OOM') ||
            error.message.includes('Cannot allocate memory')
          )) {
            logger.error({
              memoryUsage: process.memoryUsage(),
              dayIndex: dayIndex + 1,
              totalDays
            }, '[BatchProcessor] 메모리 부족으로 인한 에러, 배치 처리 중단');
            throw error; // 치명적 에러는 상위로 전파하여 Worker 종료
          }
          
          // 일반 에러는 로그만 남기고 다음 일로 계속 진행
          logger.warn({
            dayIndex: dayIndex + 1,
            totalDays
          }, '[BatchProcessor] 일별 처리 실패, 다음 일로 계속 진행');
        }
      }

      logger.info({
        totalProcessed,
        totalSeconds,
        totalDays,
        errors: errors.length,
        dayResults: dayResults.map(r => ({
          day: r.day,
          processed: r.processed,
          total: r.total
        }))
      }, '[BatchProcessor] 배치 처리 완료');

      // 전체 배치 처리 완료 후 ILP writer 종료
      if (sharedIlpWriter) {
        sharedIlpWriter.end();
        logger.info('[BatchProcessor] ILP writer 종료 완료');
      }

      return {
        success: true,
        processed: totalProcessed,
        total: totalSeconds,
        totalDays,
        dayResults,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      logger.error({
        err: String(error),
        stack: error.stack
      }, '[BatchProcessor] 배치 처리 중 오류 발생');
      
      // 에러 발생 시에도 ILP writer 종료
      if (sharedIlpWriter) {
        try {
          sharedIlpWriter.end();
        } catch (e) {
          logger.error({ ex: "ILP", err: String(e) }, '[BatchProcessor] ILP writer 종료 중 오류');
        }
      }
      
      throw error;
    }
  }

  /**
   * 시작일과 종료일을 1일 단위로 나눕니다.
   * @param {Date} start - 시작 시간
   * @param {Date} end - 종료 시간
   * @returns {Array<{start: Date, end: Date}>} 일별 범위 배열
   */
  splitIntoDays(start, end) {
    const ranges = [];
    let currentDay = new Date(start);
    
    // 시작일의 00:00:00으로 설정
    currentDay.setHours(0, 0, 0, 0);
    
    while (currentDay < end) {
      const dayStart = new Date(currentDay);
      const dayEnd = new Date(currentDay);
      dayEnd.setHours(23, 59, 59, 999);
      
      // 마지막 날은 종료 시간으로 제한
      if (dayEnd > end) {
        dayEnd.setTime(end.getTime());
      }
      
      ranges.push({
        start: new Date(dayStart.getTime() + 9 * 60 * 60 * 1000),
        end: new Date(dayEnd.getTime() + 9 * 60 * 60 * 1000)  
      });
      
      // 다음 날로 이동
      currentDay.setDate(currentDay.getDate() + 1);
    }
    
    return ranges;
  }

  /**
   * 특정 일의 데이터를 처리합니다.
   * GC 문제를 방지하기 위해 청크 단위로 나누어 처리합니다.
   * @param {Date} dayStart - 일 시작 시간
   * @param {Date} dayEnd - 일 종료 시간
   * @param {Array<number>|null} productIds - product_id 목록
   * @param {Object} ilpWriter - 공유된 ILP writer
   * @param {Function} progressCallback - 진행 상황 콜백
   * @returns {Promise<Object>} 처리 결과
   */
  async processDay(dayStart, dayEnd, productIds, ilpWriter, progressCallback = null) {
    // 일을 시간 단위 청크로 나누기
    const chunkRanges = this.splitIntoChunks(dayStart, dayEnd, this.chunkSizeHours);
    const totalChunks = chunkRanges.length;
    
    logger.info({
      symbol: this.symbol,
      dayStart: dayStart.toISOString(),
      dayEnd: dayEnd.toISOString(),
      chunkSizeHours: this.chunkSizeHours,
      totalChunks
    }, '[BatchProcessor] 일별 청크 분할 완료');

    // FkbrtiEngine 초기화 (배치 모드, 공유된 ILP writer 전달)
    let engine = null;
    try {
      engine = new FkbrtiEngine({
        symbol: this.symbol,
        depth: this.depth,
        staleMs: this.staleMs,
        expectedExchanges: this.expectedExchanges,
        table_name: this.tableName,
        is_batch_mode: true, // 배치 모드 활성화
        ilpWriter: ilpWriter, // 공유된 ILP writer 전달
      });
    } catch (engineError) {
      logger.error({
        err: String(engineError),
        stack: engineError.stack
      }, '[BatchProcessor] FkbrtiEngine 초기화 실패');
      throw engineError;
    }

    let totalProcessed = 0;
    let totalSeconds = 0;
    const errors = [];

    // 각 청크별로 처리
    for (let chunkIndex = 0; chunkIndex < chunkRanges.length; chunkIndex++) {
      const chunkRange = chunkRanges[chunkIndex];
      
      logger.info({
        chunkIndex: chunkIndex + 1,
        totalChunks,
        chunkStart: chunkRange.start.toISOString(),
        chunkEnd: chunkRange.end.toISOString()
      }, '[BatchProcessor] 청크 처리 시작');

      try {
        // 청크 단위로 데이터 조회
        const chunkResult = await this.processChunk(
          chunkRange.start,
          chunkRange.end,
          productIds,
          engine,
          (processed, total) => {
            // 청크 내 진행 상황을 전체 진행 상황으로 변환
            const overallProcessed = totalProcessed + processed;
            const overallTotal = totalSeconds + total;
            if (progressCallback) {
              progressCallback(overallProcessed, overallTotal);
            }
          }
        );

        totalProcessed += chunkResult.processed;
        totalSeconds += chunkResult.total;
        
        if (chunkResult.errors && chunkResult.errors.length > 0) {
          errors.push(...chunkResult.errors);
        }

        logger.info({
          chunkIndex: chunkIndex + 1,
          totalChunks,
          chunkProcessed: chunkResult.processed,
          chunkTotal: chunkResult.total,
          totalProcessed,
          totalSeconds
        }, '[BatchProcessor] 청크 처리 완료');

        // 청크 처리 후 메모리 정리
        this.cleanupMemory();

        // 주기적으로 GC 유도 (옵션)
        if (this.enableGc && totalProcessed > 0 && totalProcessed % this.gcInterval === 0) {
          this.triggerGc();
        }

      } catch (error) {
        logger.error({
          err: String(error),
          stack: error.stack,
          chunkIndex: chunkIndex + 1,
          totalChunks,
          chunkStart: chunkRange.start.toISOString(),
          chunkEnd: chunkRange.end.toISOString(),
          memoryUsage: process.memoryUsage()
        }, '[BatchProcessor] 청크 처리 중 오류');
        
        // 메모리 정리 시도
        try {
          this.cleanupMemory();
          this.triggerGc();
        } catch (cleanupError) {
          logger.warn({ err: String(cleanupError) }, '[BatchProcessor] 메모리 정리 중 오류');
        }
        
        errors.push({
          chunk: chunkIndex + 1,
          chunkStart: chunkRange.start.toISOString(),
          chunkEnd: chunkRange.end.toISOString(),
          error: String(error),
          memoryUsage: process.memoryUsage()
        });
        
        // 치명적 에러가 아닌 경우 계속 진행
        // (메모리 부족 등으로 인한 에러는 재시도하지 않음)
        if (error.message && (
          error.message.includes('out of memory') ||
          error.message.includes('heap') ||
          error.message.includes('OOM')
        )) {
          logger.error({
            memoryUsage: process.memoryUsage(),
            chunkIndex: chunkIndex + 1
          }, '[BatchProcessor] 메모리 부족으로 인한 에러, 배치 처리 중단');
          throw error; // 치명적 에러는 상위로 전파
        }
      }
    }

    // 일별 처리 완료 후 메모리 정리
    this.cleanupMemory();
    
    // FkbrtiEngine 정리 (메모리 누수 방지)
    if (engine) {
      try {
        // engine의 내부 상태 정리
        if (engine.booksByEx) {
          engine.booksByEx = Object.create(null);
        }
        if (engine._timer) {
          engine.stop();
        }
        // ILP writer는 공유되므로 여기서 종료하지 않음
        engine = null;
        logger.debug('[BatchProcessor] FkbrtiEngine 정리 완료');
      } catch (cleanupError) {
        logger.warn({ err: String(cleanupError) }, '[BatchProcessor] FkbrtiEngine 정리 중 오류');
      }
    }

    return {
      processed: totalProcessed,
      total: totalSeconds,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 일을 시간 단위 청크로 나눕니다.
   * @param {Date} start - 시작 시간
   * @param {Date} end - 종료 시간
   * @param {number} chunkSizeHours - 청크 크기 (시간 단위)
   * @returns {Array<{start: Date, end: Date}>} 청크 범위 배열
   */
  splitIntoChunks(start, end, chunkSizeHours) {
    const ranges = [];
    let currentTime = new Date(start);
    
    while (currentTime < end) {
      const chunkStart = new Date(currentTime);
      const chunkEnd = new Date(currentTime);
      chunkEnd.setHours(chunkEnd.getHours() + chunkSizeHours);
      
      // 마지막 청크는 종료 시간으로 제한
      if (chunkEnd > end) {
        chunkEnd.setTime(end.getTime());
      }
      
      ranges.push({
        start: new Date(chunkStart),
        end: new Date(chunkEnd)
      });
      
      currentTime = new Date(chunkEnd);
    }
    
    return ranges;
  }

  /**
   * 청크 단위로 데이터를 처리합니다.
   * @param {Date} chunkStart - 청크 시작 시간
   * @param {Date} chunkEnd - 청크 종료 시간
   * @param {Array<number>|null} productIds - product_id 목록
   * @param {Object} engine - FkbrtiEngine 인스턴스
   * @param {Function} progressCallback - 진행 상황 콜백
   * @returns {Promise<Object>} 처리 결과
   */
  async processChunk(chunkStart, chunkEnd, productIds, engine, progressCallback = null) {
    // order_book_units에서 청크 데이터 조회
    let query = `
      SELECT 
        ts,
        exchange_cd,
        price_id,
        product_id,
        order_tp,
        price,
        size
      FROM tb_order_book_units
      WHERE ts >= :startTime 
        AND ts <= :endTime
    `;
    
    const replacements = {
      startTime: chunkStart.toISOString(),
      endTime: chunkEnd.toISOString()
    };

    // product_id 필터링 (있는 경우)
    if (productIds && productIds.length > 0) {
      query += ` AND product_id IN (:productIds)`;
      replacements.productIds = productIds;
    }

    query += ` ORDER BY ts ASC, exchange_cd ASC, order_tp ASC, price ASC`;

    const results = await quest_db.sequelize.query(query, {
      replacements,
      type: quest_db.Sequelize.QueryTypes.SELECT
    });

    if (!results || results.length === 0) {
      logger.debug({
        symbol: this.symbol,
        chunkStart: chunkStart.toISOString(),
        chunkEnd: chunkEnd.toISOString()
      }, '[BatchProcessor] 청크 데이터 조회 결과 없음');
      return {
        processed: 0,
        total: 0
      };
    }

    logger.debug({
      symbol: this.symbol,
      chunkStart: chunkStart.toISOString(),
      chunkEnd: chunkEnd.toISOString(),
      totalRows: results.length
    }, '[BatchProcessor] 청크 데이터 조회 완료');

    // 초 단위로 그룹화
    const groupedBySecond = this.groupBySecond(results);
    const totalSeconds = Object.keys(groupedBySecond).length;

    // 각 초마다 처리
    let processed = 0;
    const errors = [];

    // 타임스탬프 순서대로 정렬하여 처리
    const sortedTimestamps = Object.keys(groupedBySecond)
      .map(ts => parseInt(ts))
      .sort((a, b) => a - b);

    for (const secondTimestamp of sortedTimestamps) {
      const data = groupedBySecond[secondTimestamp];
      
      try {
        // 각 거래소별로 bids/asks 구성 (tb_order_book_units의 ts 사용)
        const { books: booksByExchange, timestamp } = this.buildOrderBooks(data);

        // 배치 모드에서는 각 초마다 booksByEx를 초기화하여 이전 데이터가 섞이지 않도록 함
        engine.booksByEx = Object.create(null);

        // FkbrtiEngine에 스냅샷 주입 (배치 모드에서는 자동 _tick 호출 안 함)
        // marketAt은 tb_order_book_units의 실제 ts 값 사용
        for (const [exchange, book] of Object.entries(booksByExchange)) {
          if (book.bids.length === 0 && book.asks.length === 0) {
            // bids와 asks가 모두 비어있으면 스킵
            continue;
          }
          
          engine.onSnapshotOrderBook({
            symbol: this.symbol,
            exchange_cd: exchange,
            bid: book.bids,  // [[price, size], ...] 형태
            ask: book.asks,   // [[price, size], ...] 형태
            ts: timestamp, // tb_order_book_units의 ts 값 사용
          });
        }

        // 인덱스 계산 및 저장 (배치 모드에서는 명시적으로 호출)
        // timestamp는 tb_order_book_units의 실제 ts 값
        engine._tick(timestamp);

        processed++;

        // 진행 상황 콜백 호출
        if (progressCallback) {
          progressCallback(processed, totalSeconds);
        }

        // 1000개마다 로그 출력
        if (processed % 1000 === 0) {
          logger.debug({
            processed,
            total: totalSeconds,
            progress: ((processed / totalSeconds) * 100).toFixed(2) + '%'
          }, '[BatchProcessor] 청크 처리 진행 중');
        }

        // 처리된 데이터는 즉시 참조 해제 (GC 유도)
        delete groupedBySecond[secondTimestamp];

      } catch (error) {
        logger.error({
          err: String(error),
          stack: error.stack,
          secondTimestamp
        }, '[BatchProcessor] 청크 초 단위 처리 중 오류');
        errors.push({
          timestamp: secondTimestamp,
          error: String(error)
        });
      }
    }

    // 청크 처리 완료 후 메모리 정리
    // groupedBySecond 객체는 이미 처리되면서 삭제되었으므로 추가 정리 불필요
    // results 배열은 함수 종료 시 자동으로 GC 대상이 됨

    return {
      processed,
      total: totalSeconds,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 메모리 정리 (명시적으로 변수 정리)
   */
  cleanupMemory() {
    // Node.js는 자동 GC를 사용하지만, 명시적으로 참조를 정리하면 도움이 됩니다
    if (global.gc && this.enableGc) {
      // --expose-gc 플래그가 설정된 경우에만 사용 가능
      try {
        global.gc();
        logger.debug('[BatchProcessor] GC 실행 완료');
      } catch (e) {
        // GC 실행 실패는 무시 (일반적인 경우)
      }
    }
  }

  /**
   * GC 유도 (비동기로 실행하여 처리 흐름을 방해하지 않음)
   */
  triggerGc() {
    if (global.gc && this.enableGc) {
      // 다음 이벤트 루프에서 GC 실행
      setImmediate(() => {
        try {
          global.gc();
          logger.debug({
            memoryUsage: process.memoryUsage()
          }, '[BatchProcessor] 주기적 GC 실행 완료');
        } catch (e) {
          // GC 실행 실패는 무시
        }
      });
    }
  }

  /**
   * 데이터를 초 단위로 그룹화합니다.
   * @param {Array} data - order_book_units 데이터
   * @returns {Object} 초 단위로 그룹화된 데이터
   */
  groupBySecond(data) {
    const grouped = {};

    for (const row of data) {
      const ts = new Date(row.ts).getTime();
      const secondTimestamp = Math.floor(ts / 1000) * 1000; // 초 단위로 반올림

      if (!grouped[secondTimestamp]) {
        grouped[secondTimestamp] = [];
      }

      grouped[secondTimestamp].push(row);
    }

    return grouped;
  }

  /**
   * 초 단위 데이터에서 거래소별 order book을 구성합니다.
   * @param {Array} data - 초 단위 데이터
   * @returns {Object} 거래소별 order book과 타임스탬프 정보
   */
  buildOrderBooks(data) {
    const booksByExchange = {};
    let representativeTs = null; // 대표 타임스탬프 (첫 번째 row의 ts 사용)

    for (const row of data) {
      // 첫 번째 row의 ts를 대표 타임스탬프로 사용
      if (representativeTs === null) {
        representativeTs = new Date(row.ts).getTime();
      }

      const exchange = row.exchange_cd;
      if (!booksByExchange[exchange]) {
        booksByExchange[exchange] = {
          bids: [],
          asks: []
        };
      }

      // price와 size가 유효한지 확인
      const price = Number(row.price);
      const size = Number(row.size);
      
      if (isNaN(price) || isNaN(size) || price <= 0 || size <= 0) {
        // 유효하지 않은 데이터는 스킵
        continue;
      }

      const level = [price, size];

      // order_tp 값 확인 (대소문자 구분 없이)
      const orderTp = String(row.order_tp || '').toUpperCase().trim();
      
      if (orderTp === 'B') {
        // Bid (매수)
        booksByExchange[exchange].bids.push(level);
      } else if (orderTp === 'A') {
        // Ask (매도)
        booksByExchange[exchange].asks.push(level);
      } else {
        // 알 수 없는 order_tp 값은 로그 출력
        logger.warn({
          order_tp: row.order_tp,
          exchange: row.exchange_cd,
          price: row.price,
          size: row.size
        }, '[BatchProcessor] 알 수 없는 order_tp 값');
      }
    }

    // 각 거래소별로 정렬
    for (const exchange of Object.keys(booksByExchange)) {
      // Bids: 가격 내림차순 (높은 가격부터)
      booksByExchange[exchange].bids.sort((a, b) => b[0] - a[0]);
      // Asks: 가격 오름차순 (낮은 가격부터)
      booksByExchange[exchange].asks.sort((a, b) => a[0] - b[0]);
      
      // Depth만큼만 유지
      booksByExchange[exchange].bids = booksByExchange[exchange].bids.slice(0, this.depth);
      booksByExchange[exchange].asks = booksByExchange[exchange].asks.slice(0, this.depth);
    }

    return {
      books: booksByExchange,
      timestamp: representativeTs || Date.now() // tb_order_book_units의 ts 사용
    };
  }
}

module.exports = { BatchProcessor };

