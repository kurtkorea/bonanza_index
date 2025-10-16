"use strict";

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// 로그 디렉토리 생성
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// 로그 포맷 정의
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// 콘솔 포맷 정의
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.printf(
        info => `${info.timestamp} ${info.level}: ${info.message}`
    )
);

// 로거 생성
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    defaultMeta: { service: 'margin-service' },
    transports: [
        // 콘솔 출력
        new winston.transports.Console({
            format: consoleFormat
        }),
        // 에러 로그 파일
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // 모든 로그 파일
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ],
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(logDir, 'exceptions.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ],
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(logDir, 'rejections.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

// 개발 환경에서는 더 자세한 로깅
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// 로거 메서드 래퍼
const logWrapper = {
    error: (message, meta) => {
        logger.error(message, meta);
    },
    warn: (message, meta) => {
        logger.warn(message, meta);
    },
    info: (message, meta) => {
        logger.info(message, meta);
    },
    debug: (message, meta) => {
        logger.debug(message, meta);
    },
    http: (message, meta) => {
        logger.http(message, meta);
    }
};

module.exports = logWrapper; 