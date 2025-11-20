"use strict";

const redis = require("redis");
const logger = require('./utils/logger.js');

class RedisManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.retryDelay = 5000;
        this.reconnectTimer = null;
    }

    async initialize() {
        try {
            logger.info("[REDIS] 연결 시도 중...");
            
            if (this.client) {
                try {
                    await this.client.quit();
                    logger.info("[REDIS] 기존 연결 종료");
                } catch (error) {
                    logger.error({ ex: "REDIS", err: error }, "[REDIS] 기존 연결 종료 실패:");
                }
            }

            const redisConfig = {
                socket: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT) || 6379,
                    connectTimeout: 10000,
                    reconnectStrategy: (retries) => {
                        if (retries > this.maxRetries) {
                            logger.error({ ex: "REDIS", retries: retries, maxRetries: this.maxRetries }, "[REDIS] 최대 재연결 시도 횟수 초과");
                            return new Error("Redis 연결 실패");
                        }
                        return Math.min(retries * 100, 3000);
                    }
                },
                password: process.env.REDIS_PASSWORD || undefined
            };

            logger.info({
                ex: "REDIS",
                host: redisConfig.socket.host,
                port: redisConfig.socket.port,
                hasPassword: !!redisConfig.password
            }, "[REDIS] 설정:");
        
            this.client = redis.createClient(redisConfig);

            this.client.on('error', (err) => {
                logger.error({ ex: "REDIS", err: err }, "[REDIS] Client Error:");
                this.isConnected = false;
                this.scheduleReconnect();
            });

            this.client.on('connect', () => {
                logger.info("[REDIS] Client Connected");
                this.isConnected = true;
                this.retryCount = 0;
                this.clearReconnectTimer();
            });

            this.client.on('end', () => {
                logger.info("[REDIS] Client Connection Ended");
                this.isConnected = false;
                this.scheduleReconnect();
            });

            await this.client.connect();
            logger.info("[REDIS] 연결 성공");
            return this.client;

        } catch (error) {
            logger.error({ ex: "REDIS", err: error }, "[REDIS] 연결 실패:");
            this.isConnected = false;
            this.scheduleReconnect();
            throw error;
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        this.retryCount++;
        if (this.retryCount <= this.maxRetries) {
            logger.info({ ex: "REDIS", retryCount: this.retryCount }, "[REDIS] 재연결 시도 예정...");
            this.reconnectTimer = setTimeout(async () => {
                try {
                    await this.initialize();
                } catch (error) {
                    logger.error({ ex: "REDIS", err: error }, "[REDIS] 재연결 시도 실패:");
                }
            }, this.retryDelay * this.retryCount);
        } else {
            logger.error("[REDIS] 최대 재연결 시도 횟수 초과");
        }
    }

    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    async hGet(key, hkey, field) {
        try {
            if (!this.isConnected) {
                await this.initialize();
            }
            return await this.client.hGet(key, hkey, field);
        } catch (error) {
            logger.error({ ex: "REDIS", err: error }, "[REDIS] get error:");
            throw error;
        }
    }

    async hSet(key, hkey, field) {
        try {
            if (!this.isConnected) {
                await this.initialize();
            }
            return await this.client.hSet(key, hkey, field);
        } catch (error) {
            logger.error({ ex: "REDIS", err: error }, "[REDIS] set error:");
            throw error;
        }
    }

    async hDel(key, field) {
        try {
            if (!this.isConnected) {
                await this.initialize();
            }
            return await this.client.hDel(key, field);
        } catch (error) {
            logger.error({ ex: "REDIS", err: error }, "[REDIS] delete error:");
            throw error;
        }
    }

    async get(key) {
        try {
            if (!this.isConnected) {
                await this.initialize();
            }
            return await this.client.get(key);
        } catch (error) {
            logger.error({ ex: "REDIS", err: error }, "[REDIS] get error:");
            throw error;
        }
    }

    async set(key, value) {
        try {
            if (!this.isConnected) {
                await this.initialize();
            }
            return await this.client.set(key, value);
        } catch (error) {
            logger.error({ ex: "REDIS", err: error }, "[REDIS] set error:");
            throw error;
        }
    }

    async del(key) {
        try {
            if (!this.isConnected) {
                await this.initialize();
            }
            return await this.client.del(key);
        } catch (error) {
            logger.error({ ex: "REDIS", err: error }, "[REDIS] delete error:");
            throw error;
        }
    }

    async quit() {
        try {
            this.clearReconnectTimer();
            if (this.client) {
                await this.client.quit();
                this.isConnected = false;
                logger.info("[REDIS] connection closed");
            }
        } catch (error) {
            logger.error({ ex: "REDIS", err: error }, "[REDIS] error closing connection:");
            throw error;
        }
    }
}

// Redis 매니저 인스턴스 생성
const redisManager = new RedisManager();

module.exports = {
    redisManager,
    initializeRedis: () => redisManager.initialize()
};
