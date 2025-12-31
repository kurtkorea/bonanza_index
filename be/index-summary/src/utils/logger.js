"use strict";

/**
 * 공통 Logger 유틸리티
 * orderbook-collector와 ticker-collector에서 공유하여 사용
 * 
 * 두 가지 패턴 지원:
 * 1. logger.info("message", { meta }) - 첫 번째 인자가 문자열
 * 2. logger.info({ ex: "name", ... }, "message") - 첫 번째 인자가 객체
 */
const logger = {
  info: (arg1, arg2) => {
    if (typeof arg1 === 'string') {
      // 패턴 1: logger.info("message", { meta })
      console.log('[INFO]', arg1, arg2 ? JSON.stringify(arg2) : '');
    } else {
      // 패턴 2: logger.info({ meta }, "message")
      console.log('[INFO]', arg2 || '', JSON.stringify(arg1));
    }
  },
  warn: (arg1, arg2) => {
    if (typeof arg1 === 'string') {
      // 패턴 1: logger.warn("message", { meta })
      console.warn('[WARN]', arg1, arg2 ? JSON.stringify(arg2) : '');
    } else {
      // 패턴 2: logger.warn({ meta }, "message")
      console.warn('[WARN]', arg2 || '', JSON.stringify(arg1));
    }
  },
  error: (arg1, arg2) => {
    if (typeof arg1 === 'string') {
      // 패턴 1: logger.error("message", { meta })
      console.error('[ERROR]', arg1, arg2 ? JSON.stringify(arg2) : '');
    } else {
      // 패턴 2: logger.error({ meta }, "message")
      console.error('[ERROR]', arg2 || '', JSON.stringify(arg1));
    }
  },
  debug: (arg1, arg2) => {
    if ((process.env.LOG_LEVEL || "info") === "debug") {
      if (typeof arg1 === 'string') {
        // 패턴 1: logger.debug("message", { meta })
        console.debug('[DEBUG]', arg1, arg2 ? JSON.stringify(arg2) : '');
      } else {
        // 패턴 2: logger.debug({ meta }, "message")
        console.debug('[DEBUG]', arg2 || '', JSON.stringify(arg1));
      }
    }
  }
};

module.exports = logger;