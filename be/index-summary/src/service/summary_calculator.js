/**
 * FKBRTI Summary 계산 서비스
 * tb_fkbrti_1sec 데이터를 기반으로 통계를 계산하여 tb_fkbrti_summary에 저장합니다.
 */
const db_mysql = require('../models/index.js');
const { quest_db } = require('../db/quest_db.js');
const logger = require('../utils/logger.js');

class SummaryCalculator {
  constructor(opts = {}) {
    this.symbol = opts.symbol || 'KRW-BTC';
  }

  /**
   * 리소스를 정리합니다.
   */
  close() {
    // Worker Thread 제거로 인해 정리할 리소스 없음
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
   * 1일 간격 통계 쿼리
   */
  async query1Day(symbol, startTime, endTime) {
    logger.debug({ symbol, startTime, endTime }, '[SummaryCalculator] query1Day 실행');

    const query = `
      SELECT
        symbol,
        '1d' as interval,
        '1s' AS second,
        round(min(diff),  4) AS diff_min,
        round(max(diff),  4) AS diff_max,
        round(avg(diff),  4) AS diff_avg,
        round(min(ratio), 4) AS ratio_min,
        round(max(ratio), 4) AS ratio_max,
        round(avg(ratio), 4) AS ratio_avg
      FROM tb_fkbrti_1sec
      WHERE createdAt >= :startTime 
        AND createdAt <= :endTime
        AND symbol = :symbol

      UNION ALL

      SELECT
        symbol,
        '1d' as interval,
        '5s' AS second,
        round(min(diff_avg),  4) AS diff_min,
        round(max(diff_avg),  4) AS diff_max,
        round(avg(diff_avg),  4) AS diff_avg,
        round(min(ratio_avg), 4) AS ratio_min,
        round(max(ratio_avg), 4) AS ratio_max,
        round(avg(ratio_avg), 4) AS ratio_avg
      FROM (
        SELECT
          symbol,
          avg(diff)  AS diff_avg,
          avg(ratio) AS ratio_avg
        FROM tb_fkbrti_1sec
        WHERE createdAt >= :startTime 
          AND createdAt <= :endTime
          AND symbol = :symbol
        SAMPLE BY 5s ALIGN TO CALENDAR
      )

      UNION ALL 

      SELECT
        symbol,
        '1d' as interval,
        '10s' AS second,
        round(min(diff_avg),  4) AS diff_min,
        round(max(diff_avg),  4) AS diff_max,
        round(avg(diff_avg),  4) AS diff_avg,
        round(min(ratio_avg), 4) AS ratio_min,
        round(max(ratio_avg), 4) AS ratio_max,
        round(avg(ratio_avg), 4) AS ratio_avg
      FROM (
        SELECT
          symbol,
          avg(diff)  AS diff_avg,
          avg(ratio) AS ratio_avg
        FROM tb_fkbrti_1sec
        WHERE createdAt >= :startTime 
          AND createdAt <= :endTime
          AND symbol = :symbol
        SAMPLE BY 10s ALIGN TO CALENDAR
      )
    `;

    const results = await quest_db.sequelize.query(query, {
      replacements: {
        symbol: symbol,
        startTime: startTime,
        endTime: endTime
      },
      type: quest_db.Sequelize.QueryTypes.SELECT
    });

    return results;
  }

  /**
   * 1주일 간격 통계 쿼리
   */
  async query1Week(symbol, startTime, endTime) {
    logger.debug({ symbol, startTime, endTime }, '[SummaryCalculator] query1Week 실행');

    const query = `
      SELECT
        symbol,
        '1w' as interval,
        '1s' AS second,
        round(min(diff_avg),  4) AS diff_min,
        round(max(diff_avg),  4) AS diff_max,
        round(avg(diff_avg),  4) AS diff_avg,
        round(min(ratio_avg), 4) AS ratio_min,
        round(max(ratio_avg), 4) AS ratio_max,
        round(avg(ratio_avg), 4) AS ratio_avg
      FROM (
        SELECT
          symbol,
          avg(diff)  AS diff_avg,
          avg(ratio) AS ratio_avg
        FROM tb_fkbrti_1sec
        WHERE createdAt >= :startTime 
          AND createdAt <= :endTime
          AND symbol = :symbol
        SAMPLE BY 1m ALIGN TO CALENDAR
      )

      UNION ALL

      SELECT
        symbol,
        '1w' as interval,
        '5s' AS second,
        round(min(diff_avg),  4) AS diff_min,
        round(max(diff_avg),  4) AS diff_max,
        round(avg(diff_avg),  4) AS diff_avg,
        round(min(ratio_avg), 4) AS ratio_min,
        round(max(ratio_avg), 4) AS ratio_max,
        round(avg(ratio_avg), 4) AS ratio_avg
      FROM (
        SELECT
          symbol,
          avg(diff)  AS diff_avg,
          avg(ratio) AS ratio_avg
        FROM tb_fkbrti_1sec
        WHERE createdAt >= :startTime 
          AND createdAt <= :endTime
          AND symbol = :symbol
        SAMPLE BY 5m ALIGN TO CALENDAR
      )

      UNION ALL 

      SELECT
        symbol,
        '1w' as interval,
        '10s' AS second,
        round(min(diff_avg),  4) AS diff_min,
        round(max(diff_avg),  4) AS diff_max,
        round(avg(diff_avg),  4) AS diff_avg,
        round(min(ratio_avg), 4) AS ratio_min,
        round(max(ratio_avg), 4) AS ratio_max,
        round(avg(ratio_avg), 4) AS ratio_avg
      FROM (
        SELECT
          symbol,
          avg(diff)  AS diff_avg,
          avg(ratio) AS ratio_avg
        FROM tb_fkbrti_1sec
        WHERE createdAt >= :startTime 
          AND createdAt <= :endTime
          AND symbol = :symbol
        SAMPLE BY 10m ALIGN TO CALENDAR
      )
    `;

    const results = await quest_db.sequelize.query(query, {
      replacements: {
        symbol: symbol,
        startTime: startTime,
        endTime: endTime
      },
      type: quest_db.Sequelize.QueryTypes.SELECT
    });

    return results;
  }

  /**
   * 1개월 간격 통계 쿼리
   */
  async query1Month(symbol, startTime, endTime) {
    logger.debug({ symbol, startTime, endTime }, '[SummaryCalculator] query1Month 실행');

    const query = `
      SELECT
        symbol,
        '1m' as interval,
        '1s' AS second,
        round(min(diff_avg),  4) AS diff_min,
        round(max(diff_avg),  4) AS diff_max,
        round(avg(diff_avg),  4) AS diff_avg,
        round(min(ratio_avg), 4) AS ratio_min,
        round(max(ratio_avg), 4) AS ratio_max,
        round(avg(ratio_avg), 4) AS ratio_avg
      FROM (
        SELECT
          symbol,
          avg(diff)  AS diff_avg,
          avg(ratio) AS ratio_avg
        FROM tb_fkbrti_1sec
        WHERE createdAt >= :startTime 
          AND createdAt <= :endTime
          AND symbol = :symbol
        SAMPLE BY 1m ALIGN TO CALENDAR
      )

      UNION ALL 

      SELECT
        symbol,
        '1m' as interval,
        '5s' AS second,
        round(min(diff_avg),  4) AS diff_min,
        round(max(diff_avg),  4) AS diff_max,
        round(avg(diff_avg),  4) AS diff_avg,
        round(min(ratio_avg), 4) AS ratio_min,
        round(max(ratio_avg), 4) AS ratio_max,
        round(avg(ratio_avg), 4) AS ratio_avg
      FROM (
        SELECT
          symbol,
          avg(diff)  AS diff_avg,
          avg(ratio) AS ratio_avg
        FROM tb_fkbrti_1sec
        WHERE createdAt >= :startTime 
          AND createdAt <= :endTime
          AND symbol = :symbol
        SAMPLE BY 5m ALIGN TO CALENDAR
      )

      UNION ALL 

      SELECT
        symbol,
        '1m' as interval,
        '10s' AS second,
        round(min(diff_avg),  4) AS diff_min,
        round(max(diff_avg),  4) AS diff_max,
        round(avg(diff_avg),  4) AS diff_avg,
        round(min(ratio_avg), 4) AS ratio_min,
        round(max(ratio_avg), 4) AS ratio_max,
        round(avg(ratio_avg), 4) AS ratio_avg
      FROM (
        SELECT
          symbol,
          avg(diff)  AS diff_avg,
          avg(ratio) AS ratio_avg
        FROM tb_fkbrti_1sec
        WHERE createdAt >= :startTime 
          AND createdAt <= :endTime
          AND symbol = :symbol
        SAMPLE BY 10m ALIGN TO CALENDAR
      )
    `;

    const results = await quest_db.sequelize.query(query, {
      replacements: {
        symbol: symbol,
        startTime: startTime,
        endTime: endTime
      },
      type: quest_db.Sequelize.QueryTypes.SELECT
    });

    return results;
  }

  /**
   * 1년 간격 통계 쿼리
   */
  async query1Year(symbol, startTime, endTime) {
    logger.debug({ symbol, startTime, endTime }, '[SummaryCalculator] query1Year 실행');

    const query = `
      SELECT
        symbol,
        '1y' as interval,
        '1s' AS second,
        round(min(diff_avg),  4) AS diff_min,
        round(max(diff_avg),  4) AS diff_max,
        round(avg(diff_avg),  4) AS diff_avg,
        round(min(ratio_avg), 4) AS ratio_min,
        round(max(ratio_avg), 4) AS ratio_max,
        round(avg(ratio_avg), 4) AS ratio_avg
      FROM (
        SELECT
          symbol,
          avg(diff)  AS diff_avg,
          avg(ratio) AS ratio_avg
        FROM tb_fkbrti_1sec
        WHERE createdAt >= :startTime 
          AND createdAt <= :endTime
          AND symbol = :symbol
        SAMPLE BY 1m ALIGN TO CALENDAR
      )

      UNION ALL 

      SELECT
        symbol,
        '1y' as interval,
        '5s' AS second,
        round(min(diff_avg),  4) AS diff_min,
        round(max(diff_avg),  4) AS diff_max,
        round(avg(diff_avg),  4) AS diff_avg,
        round(min(ratio_avg), 4) AS ratio_min,
        round(max(ratio_avg), 4) AS ratio_max,
        round(avg(ratio_avg), 4) AS ratio_avg
      FROM (
        SELECT
          symbol,
          avg(diff)  AS diff_avg,
          avg(ratio) AS ratio_avg
        FROM tb_fkbrti_1sec
        WHERE createdAt >= :startTime 
          AND createdAt <= :endTime
          AND symbol = :symbol
        SAMPLE BY 5m ALIGN TO CALENDAR
      )

      UNION ALL 

      SELECT
        symbol,
        '1y' as interval,
        '10s' AS second,
        round(min(diff_avg),  4) AS diff_min,
        round(max(diff_avg),  4) AS diff_max,
        round(avg(diff_avg),  4) AS diff_avg,
        round(min(ratio_avg), 4) AS ratio_min,
        round(max(ratio_avg), 4) AS ratio_max,
        round(avg(ratio_avg), 4) AS ratio_avg
      FROM (
        SELECT
          symbol,
          avg(diff)  AS diff_avg,
          avg(ratio) AS ratio_avg
        FROM tb_fkbrti_1sec
        WHERE createdAt >= :startTime 
          AND createdAt <= :endTime
          AND symbol = :symbol
        SAMPLE BY 10m ALIGN TO CALENDAR
      )
    `;

    const results = await quest_db.sequelize.query(query, {
      replacements: {
        symbol: symbol,
        startTime: startTime,
        endTime: endTime
      },
      type: quest_db.Sequelize.QueryTypes.SELECT
    });

    return results;
  }

  /**
   * Summary 통계를 계산합니다.
   * QuestDB 쿼리를 직접 실행합니다.
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

    try {
      logger.debug({ symbol }, '[SummaryCalculator] Summary 계산 시작 (직접 쿼리 실행)');

      // 각 interval별로 병렬 실행하여 성능 향상
      const queries = [
        this.query1Day(symbol, oneDayAgo.toISOString(), now.toISOString()),
        this.query1Week(symbol, oneWeekAgo.toISOString(), now.toISOString()),
        this.query1Month(symbol, oneMonthAgo.toISOString(), now.toISOString()),
        this.query1Year(symbol, oneYearAgo.toISOString(), now.toISOString())
      ];

      // 병렬 실행
      const results = await Promise.all(queries);
      
      // 결과 합치기
      const summaryData = results.flat();

      logger.debug({ symbol, count: summaryData.length }, '[SummaryCalculator] Summary 계산 완료');

      return summaryData;
    } catch (error) {
      logger.error({
        err: String(error),
        stack: error.stack,
        symbol
      }, '[SummaryCalculator] Summary 계산 중 오류 발생');
      throw error;
    }
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
