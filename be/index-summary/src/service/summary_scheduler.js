/**
 * Summary 계산 스케줄러
 * 주기적으로 Summary 통계를 계산하여 tb_fkbrti_summary에 저장합니다.
 */
const logger = require('../utils/logger.js');
const { SummaryCalculator } = require('./summary_calculator.js');

class SummaryScheduler {
  constructor(opts = {}) {
    this.intervalMs = opts.intervalMs || 60 * 60 * 1000; // 기본 1시간
    this.symbols = opts.symbols || ['KRW-BTC'];
    this.enabled = opts.enabled !== false;
    this.timer = null;
    this.isRunning = false;
  }

  start() {
    if (!this.enabled) {
      logger.info('[SummaryScheduler] 스케줄러가 비활성화되어 있습니다.');
      return;
    }

    if (this.timer) {
      logger.warn('[SummaryScheduler] 스케줄러가 이미 실행 중입니다.');
      return;
    }

    this.timer = setInterval(() => {
      this.execute();
    }, this.intervalMs);

    logger.info({
      intervalMs: this.intervalMs,
      symbols: this.symbols
    }, '[SummaryScheduler] 스케줄러 시작');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[SummaryScheduler] 스케줄러 중지');
    }
  }

  /**
   * Summary 계산을 실행합니다.
   */
  async execute() {
    if (this.isRunning) {
      logger.warn('[SummaryScheduler] 이전 작업이 아직 실행 중입니다. 스킵합니다.');
      return;
    }

    this.isRunning = true;

    try {
      logger.info({
        symbols: this.symbols
      }, '[SummaryScheduler] Summary 계산 시작');

      for (const symbol of this.symbols) {
        try {
          const calculator = new SummaryCalculator({ symbol });
          const result = await calculator.calculateAndSave(symbol);
          
          logger.info({
            symbol,
            success: result.success,
            count: result.count
          }, '[SummaryScheduler] 심볼별 Summary 계산 완료');
        } catch (error) {
          logger.error({
            symbol,
            err: String(error),
            stack: error.stack
          }, '[SummaryScheduler] 심볼별 Summary 계산 중 오류');
        }
      }

      logger.info({
        symbols: this.symbols
      }, '[SummaryScheduler] Summary 계산 완료');
    } catch (error) {
      logger.error({
        err: String(error),
        stack: error.stack
      }, '[SummaryScheduler] Summary 계산 중 오류 발생');
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = { SummaryScheduler };

