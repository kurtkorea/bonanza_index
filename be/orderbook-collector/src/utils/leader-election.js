"use strict";

/**
 * Redis 기반 리더 선출(Leader Election) 유틸리티
 * 
 * - Redis의 SET key value NX EX ttl 명령을 사용하여 분산 락 방식으로 리더 선출
 * - 리더는 주기적으로 리더십을 갱신하여 유지
 * - 리더십 상실 시 자동으로 팔로워로 전환
 */

const logger = require('./logger.js');
const { redisManager } = require('../redis.js');
const os = require('os');

class LeaderElection {
  constructor(options = {}) {
    // 리더십 키 (기본값: orderbook-collector:leader)
    this.leaderKey = options.leaderKey || process.env.LEADER_KEY || 'orderbook-collector:leader';
    
    // 리더십 TTL (초) - 기본 10초
    this.leaseTime = options.leaseTime || parseInt(process.env.LEADER_LEASE_TIME) || 10;
    
    // 리더십 갱신 주기 (밀리초) - TTL의 절반
    this.renewInterval = options.renewInterval || parseInt(process.env.LEADER_RENEW_INTERVAL) || (this.leaseTime * 500);
    
    // 리더십 획득 재시도 주기 (밀리초)
    this.retryInterval = options.retryInterval || parseInt(process.env.LEADER_RETRY_INTERVAL) || 2000;
    
    // 인스턴스 식별자 (호스트명 + PID)
    this.instanceId = options.instanceId || `${os.hostname()}-${process.pid}`;
    
    // 리더십 상태
    this.isLeader = false;
    this.isRunning = false;
    
    // 타이머
    this.renewTimer = null;
    this.retryTimer = null;
    
    // 리더십 변경 콜백
    this.onLeaderChange = options.onLeaderChange || null;
    
    // 리더십 갱신 성공 콜백 (큐 상태 체크용)
    this.onRenewalSuccess = options.onRenewalSuccess || null;
    
    logger.info({
      leaderKey: this.leaderKey,
      leaseTime: this.leaseTime,
      renewInterval: this.renewInterval,
      retryInterval: this.retryInterval,
      instanceId: this.instanceId
    }, '[LeaderElection] 초기화 완료');
  }

  /**
   * 리더십 획득 시도
   * @returns {Promise<boolean>} 리더십 획득 성공 여부
   */
  async acquireLeadership() {
    try {
      logger.debug({
        instanceId: this.instanceId,
        leaderKey: this.leaderKey,
        redisConnected: redisManager.isConnected
      }, '[LeaderElection] 리더십 획득 시도 중...');
      
      if (!redisManager.isConnected) {
        logger.warn('[LeaderElection] Redis 연결되지 않음, 리더십 획득 실패');
        return false;
      }

      // 현재 리더 확인 (디버깅용)
      const currentLeaderBefore = await redisManager.client.get(this.leaderKey);
      // logger.debug({
      //   instanceId: this.instanceId,
      //   currentLeaderBefore: currentLeaderBefore,
      //   leaderKey: this.leaderKey
      // }, '[LeaderElection] 현재 리더 확인 (SET 전)');
      
      // SET key value NX EX ttl - 키가 없을 때만 설정하고 TTL 설정
      // logger.debug({
      //   instanceId: this.instanceId,
      //   leaderKey: this.leaderKey,
      //   leaseTime: this.leaseTime
      // }, '[LeaderElection] Redis SET 명령 실행 중...');
      
      // node-redis v4 방식: client.set(key, value, { NX: true, EX: seconds })
      const result = await redisManager.client.set(
        this.leaderKey,
        this.instanceId,
        {
          NX: true,  // 키가 없을 때만 설정
          EX: this.leaseTime  // TTL 설정 (초)
        }
      );

      // logger.info({
      //   instanceId: this.instanceId,
      //   result: result,
      //   resultType: typeof result,
      //   isOK: result === 'OK',
      //   isNull: result === null,
      //   leaderKey: this.leaderKey
      // }, '[LeaderElection] Redis SET 명령 결과');

      // node-redis v4에서는 성공 시 'OK', 실패 시 null 반환
      // 하지만 일부 버전에서는 다른 값이 반환될 수 있으므로 명시적으로 체크
      if (result === 'OK' || result === true) {
        logger.info({
          instanceId: this.instanceId,
          leaderKey: this.leaderKey,
          leaseTime: this.leaseTime,
          result: result,
        }, '[LeaderElection] ✅ 리더십 획득 성공');
        
        this.isLeader = true;
        this.startRenewal();
        
        // 리더십 변경 콜백 호출
        if (this.onLeaderChange) {
          this.onLeaderChange(true, this.instanceId);
        }
        
        return true;
      } else {
        // 다른 인스턴스가 이미 리더이거나 SET 실패
        const currentLeader = await redisManager.client.get(this.leaderKey);
        const ttl = await redisManager.client.ttl(this.leaderKey);
        
        // logger.info({
        //   instanceId: this.instanceId,
        //   currentLeader: currentLeader,
        //   result: result,
        //   resultType: typeof result,
        //   ttl: ttl,
        //   isCurrentLeader: currentLeader === this.instanceId
        // }, '[LeaderElection] ❌ 리더십 획득 실패');
        
        // 만약 현재 리더가 자신인데 result가 null이면, 이미 리더인 상태
        // (이전에 획득했지만 상태가 동기화되지 않은 경우)
        
        if (currentLeader === this.instanceId) {
          logger.warn({
            instanceId: this.instanceId
          }, '[LeaderElection] ⚠️ 이미 자신이 리더인데 SET이 null 반환. 상태 동기화 중...');
          this.isLeader = true;
          this.startRenewal();
          if (this.onLeaderChange) {
            this.onLeaderChange(true, this.instanceId);
          }
          return true;
        }
        
        return false;
      }
    } catch (error) {
      logger.error({
        err: String(error),
        stack: error.stack,
        instanceId: this.instanceId
      }, '[LeaderElection] 리더십 획득 중 오류 발생');
      return false;
    }
  }

  /**
   * 리더십 갱신
   * @returns {Promise<boolean>} 갱신 성공 여부
   */
  async renewLeadership() {
    try {
      if (!redisManager.isConnected) {
        logger.warn('[LeaderElection] Redis 연결되지 않음, 리더십 갱신 실패');
        this.isLeader = false;
        return false;
      }

      // 현재 리더 확인
      const currentLeader = await redisManager.client.get(this.leaderKey);
      
      if (currentLeader === this.instanceId) {
        // 자신이 리더인 경우 TTL 갱신
        await redisManager.client.expire(this.leaderKey, this.leaseTime);
        logger.debug({
          instanceId: this.instanceId
        }, '[LeaderElection] I am the leader');
        
        // 리더십 갱신 성공 콜백 호출 (큐 상태 체크용)
        if (this.onRenewalSuccess && typeof this.onRenewalSuccess === 'function') {
          try {
            this.onRenewalSuccess();
          } catch (error) {
            logger.error({
              err: String(error),
              stack: error.stack
            }, '[LeaderElection] 리더십 갱신 성공 콜백 실행 중 오류 발생');
          }
        }
        
        return true;
      } else {
        // 다른 인스턴스가 리더가 된 경우
        logger.warn({
          instanceId: this.instanceId,
          currentLeader: currentLeader
        }, '[LeaderElection] 리더십 상실 (다른 리더 존재)');
        
        this.isLeader = false;
        this.stopRenewal();
        
        // 리더십 변경 콜백 호출
        if (this.onLeaderChange) {
          this.onLeaderChange(false, currentLeader);
        }
        
        // 리더십 재획득 시도
        this.startRetry();
        return false;
      }
    } catch (error) {
      logger.error({
        err: String(error),
        stack: error.stack
      }, '[LeaderElection] 리더십 갱신 중 오류 발생');
      
      this.isLeader = false;
      this.stopRenewal();
      this.startRetry();
      return false;
    }
  }

  /**
   * 리더십 해제
   */
  async releaseLeadership() {
    try {
      if (!this.isLeader) {
        return;
      }

      if (redisManager.isConnected) {
        const currentLeader = await redisManager.client.get(this.leaderKey);
        if (currentLeader === this.instanceId) {
          await redisManager.client.del(this.leaderKey);
          logger.info({
            instanceId: this.instanceId
          }, '[LeaderElection] 리더십 해제 완료');
        }
      }

      this.isLeader = false;
      this.stopRenewal();
      this.stopRetry();
      
      // 리더십 변경 콜백 호출
      if (this.onLeaderChange) {
        this.onLeaderChange(false, null);
      }
    } catch (error) {
      logger.error({
        err: String(error),
        stack: error.stack
      }, '[LeaderElection] 리더십 해제 중 오류 발생');
    }
  }

  /**
   * 리더십 갱신 시작
   */
  startRenewal() {
    this.stopRenewal();
    
    this.renewTimer = setInterval(async () => {
      if (this.isLeader) {
        await this.renewLeadership();
      }
    }, this.renewInterval);
    
    logger.info({
      renewInterval: this.renewInterval
    }, '[LeaderElection] 리더십 갱신 시작');
  }

  /**
   * 리더십 갱신 중지
   */
  stopRenewal() {
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
      logger.info('[LeaderElection] 리더십 갱신 중지');
    }
  }

  /**
   * 리더십 재획득 시도 시작
   */
  startRetry() {
    this.stopRetry();
    
    this.retryTimer = setInterval(async () => {
      if (!this.isLeader) {
        const acquired = await this.acquireLeadership();
        if (acquired) {
          this.stopRetry();
        }
      }
    }, this.retryInterval);
    
    logger.info({
      retryInterval: this.retryInterval
    }, '[LeaderElection] 리더십 재획득 시도 시작');
  }

  /**
   * 리더십 재획득 시도 중지
   */
  stopRetry() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
      logger.info('[LeaderElection] 리더십 재획득 시도 중지');
    }
  }

  /**
   * 리더 선출 시작
   */
  async start() {
    if (this.isRunning) {
      logger.warn('[LeaderElection] 이미 실행 중');
      return;
    }

    this.isRunning = true;
    logger.info({
      instanceId: this.instanceId,
      leaderKey: this.leaderKey,
      leaseTime: this.leaseTime
    }, '[LeaderElection] 리더 선출 시작');
    
    // Redis 연결 상태 확인
    if (!redisManager.isConnected) {
      logger.warn('[LeaderElection] Redis 연결되지 않음. 리더십 획득 시도 전에 Redis 연결을 확인하세요.');
    } else {
      logger.info('[LeaderElection] Redis 연결 확인됨');
    }
    
    // 즉시 리더십 획득 시도
    logger.info('[LeaderElection] 리더십 획득 시도 시작...');
    const acquired = await this.acquireLeadership();
    
    if (acquired) {
      logger.info('[LeaderElection] 초기 리더십 획득 성공');
    } else {
      logger.info('[LeaderElection] 초기 리더십 획득 실패. 재시도 시작...');
      // 리더십 획득 실패 시 재시도 시작
      this.startRetry();
    }
  }

  /**
   * 리더 선출 중지
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info('[LeaderElection] 리더 선출 중지');
    
    await this.releaseLeadership();
    this.stopRenewal();
    this.stopRetry();
  }

  /**
   * 현재 리더 확인
   * @returns {Promise<string|null>} 현재 리더 인스턴스 ID 또는 null
   */
  async getCurrentLeader() {
    try {
      if (!redisManager.isConnected) {
        return null;
      }
      return await redisManager.client.get(this.leaderKey);
    } catch (error) {
      logger.error({
        err: String(error)
      }, '[LeaderElection] 현재 리더 확인 중 오류 발생');
      return null;
    }
  }

  /**
   * 리더십 강제 해제 (관리 목적)
   */
  async forceRelease() {
    try {
      if (redisManager.isConnected) {
        await redisManager.client.del(this.leaderKey);
        logger.warn('[LeaderElection] 리더십 강제 해제 완료');
      }
    } catch (error) {
      logger.error({
        err: String(error)
      }, '[LeaderElection] 리더십 강제 해제 중 오류 발생');
    }
  }
}

module.exports = { LeaderElection };

