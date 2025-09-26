"use strict";

/**
 * 에러 처리 유틸리티 함수들
 */

/**
 * 에러를 안전하게 로깅하는 함수
 * @param {Error} error - 에러 객체
 * @param {string} context - 에러가 발생한 컨텍스트
 * @param {Object} additionalData - 추가 데이터
 */
function logError(error, context = 'Unknown', additionalData = {}) {
    const errorInfo = {
        message: error.message,
        stack: error.stack,
        context: context,
        timestamp: new Date().toISOString(),
        ...additionalData
    };

    console.error(`[${context}] 에러 발생:`, errorInfo);
    
    if (global.logger) {
        global.logger.error(`[${context}] 에러 발생`, errorInfo);
    }
}

/**
 * 비동기 함수를 안전하게 실행하는 래퍼
 * @param {Function} asyncFn - 실행할 비동기 함수
 * @param {string} context - 컨텍스트
 * @param {*} defaultValue - 에러 발생시 반환할 기본값
 */
async function safeAsync(asyncFn, context = 'AsyncFunction', defaultValue = null) {
    try {
        return await asyncFn();
    } catch (error) {
        logError(error, context);
        return defaultValue;
    }
}

/**
 * 동기 함수를 안전하게 실행하는 래퍼
 * @param {Function} syncFn - 실행할 동기 함수
 * @param {string} context - 컨텍스트
 * @param {*} defaultValue - 에러 발생시 반환할 기본값
 */
function safeSync(syncFn, context = 'SyncFunction', defaultValue = null) {
    try {
        return syncFn();
    } catch (error) {
        logError(error, context);
        return defaultValue;
    }
}

/**
 * 데이터 유효성 검사 함수
 * @param {*} data - 검사할 데이터
 * @param {string} fieldName - 필드명
 * @param {string} expectedType - 예상 타입
 */
function validateData(data, fieldName, expectedType) {
    if (data === null || data === undefined) {
        throw new Error(`${fieldName}이 null 또는 undefined입니다.`);
    }
    
    if (expectedType && typeof data !== expectedType) {
        throw new Error(`${fieldName}의 타입이 올바르지 않습니다. 예상: ${expectedType}, 실제: ${typeof data}`);
    }
    
    return true;
}

/**
 * 배열 데이터 유효성 검사
 * @param {Array} array - 검사할 배열
 * @param {string} fieldName - 필드명
 * @param {number} minLength - 최소 길이
 */
function validateArray(array, fieldName, minLength = 0) {
    validateData(array, fieldName, 'object');
    
    if (!Array.isArray(array)) {
        throw new Error(`${fieldName}은 배열이어야 합니다.`);
    }
    
    if (array.length < minLength) {
        throw new Error(`${fieldName}의 길이가 부족합니다. 최소: ${minLength}, 실제: ${array.length}`);
    }
    
    return true;
}

/**
 * 객체 데이터 유효성 검사
 * @param {Object} obj - 검사할 객체
 * @param {string} fieldName - 필드명
 * @param {Array} requiredFields - 필수 필드들
 */
function validateObject(obj, fieldName, requiredFields = []) {
    validateData(obj, fieldName, 'object');
    
    if (Array.isArray(obj)) {
        throw new Error(`${fieldName}은 객체여야 합니다.`);
    }
    
    for (const field of requiredFields) {
        if (!(field in obj)) {
            throw new Error(`${fieldName}에 필수 필드 '${field}'가 없습니다.`);
        }
    }
    
    return true;
}

module.exports = {
    logError,
    safeAsync,
    safeSync,
    validateData,
    validateArray,
    validateObject
};


