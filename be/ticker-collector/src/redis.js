"use strict";

const redis = require("redis");

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
            console.log("Redis 연결 시도 중...");
            
            if (this.client) {
                try {
                    await this.client.quit();
                    console.log("기존 Redis 연결 종료");
                } catch (error) {
                    console.error("기존 Redis 연결 종료 실패:", error);
                }
            }

            const redisConfig = {
                socket: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT) || 6379,
                    connectTimeout: 10000,
                    reconnectStrategy: (retries) => {
                        if (retries > this.maxRetries) {
                            console.error("Redis 최대 재연결 시도 횟수 초과");
                            return new Error("Redis 연결 실패");
                        }
                        return Math.min(retries * 100, 3000);
                    }
                },
                password: process.env.REDIS_PASSWORD || undefined
            };

            console.log("Redis 설정:", {
                host: redisConfig.socket.host,
                port: redisConfig.socket.port,
                hasPassword: !!redisConfig.password
            });

            this.client = redis.createClient(redisConfig);

            this.client.on('error', (err) => {
                console.error('Redis Client Error:', err);
                this.isConnected = false;
                this.scheduleReconnect();
            });

            this.client.on('connect', () => {
                console.log('Redis Client Connected');
                this.isConnected = true;
                this.retryCount = 0;
                this.clearReconnectTimer();
            });

            this.client.on('end', () => {
                console.log('Redis Client Connection Ended');
                this.isConnected = false;
                this.scheduleReconnect();
            });

            await this.client.connect();
            console.log('Redis 연결 성공');
            return this.client;

        } catch (error) {
            console.error('Redis 연결 실패:', error);
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
            console.log(`${this.retryCount}번째 재연결 시도 예정...`);
            this.reconnectTimer = setTimeout(async () => {
                try {
                    await this.initialize();
                } catch (error) {
                    console.error('재연결 시도 실패:', error);
                }
            }, this.retryDelay * this.retryCount);
        } else {
            console.error('Redis 최대 재연결 시도 횟수 초과');
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
            console.error('Redis get error:', error);
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
            console.error('Redis set error:', error);
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
            console.error('Redis delete error:', error);
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
            console.error('Redis get error:', error);
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
            console.error('Redis set error:', error);
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
            console.error('Redis delete error:', error);
            throw error;
        }
    }

    async quit() {
        try {
            this.clearReconnectTimer();
            if (this.client) {
                await this.client.quit();
                this.isConnected = false;
                console.log('Redis connection closed');
            }
        } catch (error) {
            console.error('Error closing Redis connection:', error);
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
