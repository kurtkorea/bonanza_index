/**
 * FKBRTI Summary 계산 서비스
 * tb_fkbrti_1sec 데이터를 기반으로 통계를 계산하여 tb_fkbrti_summary에 저장합니다.
 * Worker Thread를 사용하여 QuestDB 쿼리를 별도 스레드에서 실행합니다.
 */
const { Worker } = require('worker_threads');
const path = require('path');
const db_mysql = require('../models/index.js');
const logger = require('../utils/logger.js');

class SummaryCalculator {
  constructor(opts = {}) {
    this.symbol = opts.symbol || 'KRW-BTC';
    this.worker = null;
    this.workerReady = false;
  }

  /**
   * Worker Thread를 생성합니다.
   */
  _createWorker() {
    if (this.worker) {
      return this.worker;
    }

    const workerPath = path.join(__dirname, '../worker/summary_worker.js');
    this.worker = new Worker(workerPath);

    this.worker.on('error', (error) => {
      logger.error({
        err: String(error),
        stack: error.stack
      }, '[SummaryCalculator] Worker Thread 오류');
    });

    this.worker.on('exit', (code) => {
      if (code !== 0) {
        logger.warn({ code }, '[SummaryCalculator] Worker Thread 종료');
      }
      this.worker = null;
      this.workerReady = false;
    });

    return this.worker;
  }

  /**
   * Worker Thread를 종료합니다.
   */
  _terminateWorker() {
    if (this.worker) {
      this.worker.postMessage({ type: 'shutdown' });
      this.worker.terminate().catch((error) => {
        logger.error({
          err: String(error)
        }, '[SummaryCalculator] Worker Thread 종료 중 오류');
      });
      this.worker = null;
    }
  }

  /**
   * 리소스를 정리합니다.
   */
  close() {
    this._terminateWorker();
  }

  /**
   * Summary 통계를 계산하고 저장합니다.
   * @param {string} symbol - 심볼
   * @returns {Promise<Object>} 처리 결과
   */
  async calculateAndSave(symbol = null) {
    const targetSymbol = symbol || this.symbol;
    
    try {
      logger.info({
        symbol: targetSymbol
      }, '[SummaryCalculator] Summary 계산 시작');

      // 통계 쿼리 실행
      const summaryData = await this.calculateSummary(targetSymbol);

      if (!summaryData || summaryData.length === 0) {
        logger.warn({
          symbol: targetSymbol
        }, '[SummaryCalculator] 계산된 데이터가 없습니다.');
        return {
          success: false,
          message: '계산된 데이터가 없습니다.',
          count: 0
        };
      }

      // DB에 저장
      const savedCount = await this.saveSummary(summaryData);

      logger.info({
        symbol: targetSymbol,
        count: savedCount
      }, '[SummaryCalculator] Summary 계산 및 저장 완료');

      return {
        success: true,
        count: savedCount,
        data: summaryData
      };

    } catch (error) {
      logger.error({
        err: String(error),
        stack: error.stack,
        symbol: targetSymbol
      }, '[SummaryCalculator] Summary 계산 중 오류 발생');
      throw error;
    }
  }

  /**
   * Summary 통계를 계산합니다 (Worker Thread 사용).
   * QuestDB 쿼리를 별도 스레드에서 실행하여 메인 스레드의 블로킹을 방지합니다.
   * @param {string} symbol - 심볼
   * @returns {Promise<Array>} 계산된 통계 데이터
   */
  async calculateSummary(symbol) {
    const KST_OFFSET = 9 * 60 * 60 * 1000; // 9시간
    const now = new Date(new Date().getTime() + KST_OFFSET);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000 + KST_OFFSET);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + KST_OFFSET);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000 + KST_OFFSET);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000 + KST_OFFSET);

    return new Promise((resolve, reject) => {
      const worker = this._createWorker();
      let resolved = false;

      // 타임아웃을 5분으로 증가 (1년치 데이터 조회는 시간이 걸릴 수 있음)
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          worker.removeListener('message', messageHandler);
          logger.error({ symbol }, '[SummaryCalculator] Summary 계산 타임아웃 (5분)');
          reject(new Error('Summary 계산 타임아웃 (5분)'));
        }
      }, 5 * 60 * 1000); // 5분 타임아웃

      const messageHandler = (message) => {
        if (resolved) return;

        if (message.type === 'result') {
          clearTimeout(timeout);
          resolved = true;
          worker.removeListener('message', messageHandler);
          logger.debug({ symbol, count: message.data?.length }, '[SummaryCalculator] Worker Thread에서 결과 수신');
          resolve(message.data);
        } else if (message.type === 'error') {
          clearTimeout(timeout);
          resolved = true;
          worker.removeListener('message', messageHandler);
          logger.error({ symbol, error: message.error }, '[SummaryCalculator] Worker Thread에서 에러 수신');
          reject(new Error(message.error.message));
        }
      };

      worker.on('message', messageHandler);

      // Worker가 이미 준비되어 있으면 즉시 요청 전송, 아니면 준비될 때까지 대기
      const sendRequest = () => {
        if (!resolved) {
          logger.debug({ symbol }, '[SummaryCalculator] Worker에 계산 요청 전송');
          worker.postMessage({
            type: 'calculate',
            data: {
              symbol,
              oneDayAgo: oneDayAgo.toISOString(),
              oneWeekAgo: oneWeekAgo.toISOString(),
              oneMonthAgo: oneMonthAgo.toISOString(),
              oneYearAgo: oneYearAgo.toISOString(),
              now: now.toISOString()
            }
          });
        }
      };

      if (this.workerReady) {
        // Worker가 이미 준비되어 있으면 즉시 요청 전송
        sendRequest();
      } else {
        // Worker가 준비될 때까지 대기
        const readyHandler = (message) => {
          if (message.type === 'ready') {
            this.workerReady = true;
            worker.removeListener('message', readyHandler);
            sendRequest();
          }
        };
        worker.on('message', readyHandler);
        
        // 최대 5초 대기 후에도 ready가 오지 않으면 강제로 요청 전송
        setTimeout(() => {
          if (!this.workerReady && !resolved) {
            logger.warn({ symbol }, '[SummaryCalculator] Worker ready 대기 시간 초과, 요청 전송');
            this.workerReady = true;
            worker.removeListener('message', readyHandler);
            sendRequest();
          }
        }, 5000);
      }
    });
  }


  /**
   * 계산된 Summary 데이터를 저장합니다 (최근 1건만 유지, MySQL).
   * 각 (symbol, interval, second) 조합별로 최신 데이터만 저장됩니다.
   * @param {Array} summaryData - 계산된 통계 데이터
   * @returns {Promise<number>} 저장된 레코드 수
   */
  async saveSummary(summaryData) {
    if (!summaryData || summaryData.length === 0) {
      return 0;
    }

    const now = new Date();
    
    try {
      // MySQL Sequelize 모델을 사용하여 일괄 삽입/업데이트 (UPSERT)
      const records = summaryData.map(row => ({
        symbol: row.symbol || '',
        interval: row.interval || '',
        second: row.second || '',
        diff_min: row.diff_min != null ? row.diff_min : 0,
        diff_max: row.diff_max != null ? row.diff_max : 0,
        diff_avg: row.diff_avg != null ? row.diff_avg : 0,
        ratio_min: row.ratio_min != null ? row.ratio_min : 0,
        ratio_max: row.ratio_max != null ? row.ratio_max : 0,
        ratio_avg: row.ratio_avg != null ? row.ratio_avg : 0,
        statTime: now,
        createdAt: now,
        updatedAt: now
      }));

      // Sequelize bulkCreate를 사용하여 UPSERT (기존 레코드가 있으면 업데이트, 없으면 삽입)
      // unique index: (symbol, interval, second) - 각 조합별로 최근 1건만 유지
      await db_mysql.FkbrtiSummary.bulkCreate(records, {
        updateOnDuplicate: [
          'statTime',
          'diff_min',
          'diff_max',
          'diff_avg',
          'ratio_min',
          'ratio_max',
          'ratio_avg',
          'updatedAt'
        ],
        fields: [
          'symbol',
          'interval',
          'second',
          'statTime',
          'diff_min',
          'diff_max',
          'diff_avg',
          'ratio_min',
          'ratio_max',
          'ratio_avg',
          'createdAt',
          'updatedAt'
        ]
      });

      logger.debug({
        count: summaryData.length,
        intervals: summaryData.map(d => `${d.symbol}_${d.interval}_${d.second}`)
      }, '[SummaryCalculator] Summary 데이터 MySQL UPSERT 완료');

      return summaryData.length;

    } catch (error) {
      logger.error({
        err: String(error),
        stack: error.stack,
        summaryDataCount: summaryData.length
      }, '[SummaryCalculator] MySQL UPSERT 실패');
      throw error;
    }
  }
}

module.exports = { SummaryCalculator };

