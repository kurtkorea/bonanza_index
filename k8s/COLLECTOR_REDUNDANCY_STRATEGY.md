# 시세 수집기 이중화 전략

## 개요

`orderbook-collector`와 `ticker-collector`는 웹소켓을 통해 실시간 시세 데이터를 수집하는 핵심 컴포넌트입니다. 프로세스 크래시나 재시작 시 데이터 손실을 방지하고 무중단 서비스를 제공하기 위한 이중화 전략을 제시합니다.

## 현재 구성 분석

### 아키텍처

```
┌─────────────────────────────────────────┐
│  거래소 웹소켓 (업비트/빗썸/코빗/코인원)  │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  orderbook-collector / ticker-collector │
│  - 웹소켓 연결                           │
│  - 메모리 큐 (최대 5,000건)              │
│  - ZMQ PUSH 전송                         │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  orderbook-storage-worker               │
│  - ZMQ 수신                             │
│  - QuestDB 저장                          │
└─────────────────────────────────────────┘
```

### 현재 상태

**배포 구성:**
- **Deployment**: Kubernetes Deployment
- **Replicas**: 1 (단일 인스턴스)
- **다중 인스턴스 구조**: deployment-1.yaml, deployment-2.yaml 존재 (미사용)

**데이터 흐름:**
1. 웹소켓으로 시세 수신
2. 메모리 큐에 버퍼링 (`QUEUE_MAX_SIZE = 5000`)
3. 배치 처리로 ZMQ PUSH 전송
4. orderbook-storage-worker가 QuestDB에 저장

**현재 복구 메커니즘:**
- ✅ 웹소켓 자동 재연결 (`RECONNECT_INTERVAL`)
- ✅ ZMQ 재연결 로직 (`reconnectZMQ()`)
- ❌ 크래시 시 메모리 큐 데이터 손실
- ❌ 재시작 시 손실된 데이터 복구 불가

### 문제점

1. **단일 장애점 (SPOF)**
   - 단일 인스턴스로 인한 서비스 중단
   - 크래시 시 즉시 데이터 수집 중단

2. **데이터 손실**
   - 메모리 큐에 버퍼링된 데이터 손실 (최대 5,000건)
   - 크래시 시점의 웹소켓 메시지 손실
   - 재시작 전 수신된 데이터 복구 불가

3. **복구 시간**
   - Pod 재시작: 30초 ~ 2분
   - 웹소켓 재연결: 즉시 ~ 5초
   - **총 복구 시간: 30초 ~ 2분 5초**
   - 이 시간 동안 데이터 수집 중단

---

## 이중화 전략

### 전략 비교

| 전략 | 복구 시간 | 데이터 손실 | 구현 난이도 | 리소스 비용 | 권장도 |
|------|----------|------------|------------|------------|--------|
| **전략 1: Active-Active (권장)** | 즉시 | 없음 | 중간 | 중간 | ⭐⭐⭐⭐⭐ |
| **전략 2: Active-Standby** | < 10초 | 최소 | 낮음 | 중간 | ⭐⭐⭐⭐ |
| **전략 3: 큐 영속화** | 30초~2분 | 없음 | 높음 | 낮음 | ⭐⭐⭐ |
| **전략 4: 하이브리드** | 즉시 | 없음 | 높음 | 높음 | ⭐⭐⭐⭐⭐ |

---

## 전략 1: Active-Active 이중화 (권장)

### 개요

두 개의 독립적인 인스턴스가 동시에 동일한 데이터를 수집하고, 각각 독립적으로 저장하는 방식입니다.

### 아키텍처

```
┌─────────────────────────────────────────┐
│  거래소 웹소켓                           │
└─────────────────────────────────────────┘
         ↓                    ↓
┌─────────────────┐  ┌─────────────────┐
│ Collector-1     │  │ Collector-2     │
│ (Active)        │  │ (Active)        │
│ - 웹소켓 연결    │  │ - 웹소켓 연결    │
│ - 큐 버퍼링      │  │ - 큐 버퍼링      │
│ - ZMQ 전송       │  │ - ZMQ 전송       │
└─────────────────┘  └─────────────────┘
         ↓                    ↓
┌─────────────────────────────────────────┐
│  Storage Worker (중복 제거)              │
│  - 타임스탬프 기반 중복 제거             │
│  - QuestDB 저장                          │
└─────────────────────────────────────────┘
```

### 장점

- ✅ **무중단 서비스**: 한 인스턴스 크래시 시에도 다른 인스턴스가 계속 수집
- ✅ **데이터 손실 없음**: 두 인스턴스가 동시에 수집하므로 손실 최소화
- ✅ **즉시 복구**: 크래시 감지 즉시 다른 인스턴스가 서비스 계속
- ✅ **부하 분산**: 두 인스턴스가 동시에 처리

### 단점

- ⚠️ **중복 데이터**: 동일 데이터가 두 번 저장됨 (중복 제거 필요)
- ⚠️ **리소스 사용**: 두 배의 리소스 필요
- ⚠️ **중복 제거 로직**: Storage Worker에서 중복 제거 구현 필요

### 구현 방법

#### 1. Kubernetes Deployment 확장

```yaml
# k8s/orderbook-collector/deployment-active-active.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orderbook-collector-primary
  namespace: bonanza-index
  labels:
    app: orderbook-collector
    role: primary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: orderbook-collector
      role: primary
  template:
    metadata:
      labels:
        app: orderbook-collector
        role: primary
    spec:
      containers:
      - name: orderbook-collector
        image: bonanza-index/orderbook-collector:latest
        env:
        - name: PROCESS_ID
          value: "orderbook-collector-process-1"
        # ... 기존 설정 ...
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orderbook-collector-secondary
  namespace: bonanza-index
  labels:
    app: orderbook-collector
    role: secondary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: orderbook-collector
      role: secondary
  template:
    metadata:
      labels:
        app: orderbook-collector
        role: secondary
    spec:
      containers:
      - name: orderbook-collector
        image: bonanza-index/orderbook-collector:latest
        env:
        - name: PROCESS_ID
          value: "orderbook-collector-process-2"
        # ... 기존 설정 동일 ...
```

#### 2. Storage Worker 중복 제거 로직

```javascript
// be/orderbook-storage-worker/src/utils/deduplicator.js

class DataDeduplicator {
  constructor(windowMs = 1000) {
    // 타임스탬프 기반 중복 제거 윈도우 (기본 1초)
    this.windowMs = windowMs;
    // 최근 처리된 데이터 캐시 (타임스탬프 -> Set<해시>)
    this.recentData = new Map();
    // 정리 작업 인터벌
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, windowMs * 2);
  }

  /**
   * 데이터 중복 여부 확인
   * @param {Object} data - 수집된 데이터
   * @param {number} timestamp - 데이터 타임스탬프
   * @returns {boolean} - 중복이면 true, 아니면 false
   */
  isDuplicate(data, timestamp) {
    const windowKey = Math.floor(timestamp / this.windowMs);
    const dataHash = this.hashData(data);

    if (!this.recentData.has(windowKey)) {
      this.recentData.set(windowKey, new Set());
    }

    const windowSet = this.recentData.get(windowKey);
    
    if (windowSet.has(dataHash)) {
      return true; // 중복
    }

    windowSet.add(dataHash);
    return false; // 새로운 데이터
  }

  /**
   * 데이터 해시 생성
   * @param {Object} data - 데이터 객체
   * @returns {string} - 해시 값
   */
  hashData(data) {
    // 타임스탬프, 거래소, 심볼, 호가 데이터를 기반으로 해시 생성
    const key = `${data.exchange_cd}_${data.symbol}_${data.marketAt}_${JSON.stringify(data.bids)}_${JSON.stringify(data.asks)}`;
    return require('crypto').createHash('md5').update(key).digest('hex');
  }

  /**
   * 오래된 윈도우 정리
   */
  cleanup() {
    const now = Date.now();
    const currentWindow = Math.floor(now / this.windowMs);
    const keepWindows = 3; // 최근 3개 윈도우 유지

    for (const [windowKey] of this.recentData) {
      if (windowKey < currentWindow - keepWindows) {
        this.recentData.delete(windowKey);
      }
    }
  }

  /**
   * 리소스 정리
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.recentData.clear();
  }
}

module.exports = { DataDeduplicator };
```

#### 3. Storage Worker에 중복 제거 적용

```javascript
// be/orderbook-storage-worker/src/app.js (수정 예시)

const { DataDeduplicator } = require('./utils/deduplicator.js');

// 전역 중복 제거기 인스턴스
const deduplicator = new DataDeduplicator(1000); // 1초 윈도우

// ZMQ 메시지 수신 핸들러
async function handleZmqMessage(topic, ts, payload) {
  try {
    const data = JSON.parse(payload);
    
    // 중복 확인
    if (deduplicator.isDuplicate(data, ts)) {
      logger.debug({ topic, ts }, 'Duplicate data detected, skipping');
      return;
    }
    
    // 중복이 아니면 저장
    await saveToQuestDB(data);
    
  } catch (error) {
    logger.error({ err: String(error) }, 'Error processing ZMQ message');
  }
}
```

#### 4. Health Check 및 모니터링

```yaml
# k8s/orderbook-collector/deployment-active-active.yaml (추가)

apiVersion: v1
kind: Service
metadata:
  name: orderbook-collector-primary
  namespace: bonanza-index
spec:
  selector:
    app: orderbook-collector
    role: primary
  ports:
  - port: 6001
    name: http
---
apiVersion: v1
kind: Service
metadata:
  name: orderbook-collector-secondary
  namespace: bonanza-index
spec:
  selector:
    app: orderbook-collector
    role: secondary
  ports:
  - port: 6001
    name: http
---
# PodDisruptionBudget 설정
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: orderbook-collector-pdb
  namespace: bonanza-index
spec:
  minAvailable: 1  # 최소 1개 Pod 유지
  selector:
    matchLabels:
      app: orderbook-collector
```

#### 5. 모니터링 및 알림

```yaml
# k8s/collectors/monitoring.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: collector-alerts
  namespace: bonanza-index
spec:
  groups:
  - name: collectors
    rules:
    # Collector Pod 크래시 감지
    - alert: CollectorPodCrash
      expr: kube_pod_status_phase{pod=~"orderbook-collector-.*", phase!="Running"} == 1
      for: 1m
      annotations:
        summary: "Collector Pod가 크래시되었습니다"
        description: "Pod {{ $labels.pod }}가 {{ $labels.phase }} 상태입니다"
    
    # 두 인스턴스 모두 다운 감지
    - alert: AllCollectorsDown
      expr: count(kube_pod_status_phase{pod=~"orderbook-collector-.*", phase="Running"}) < 1
      for: 30s
      annotations:
        summary: "모든 Collector 인스턴스가 다운되었습니다"
        description: "데이터 수집이 중단되었습니다"
    
    # 중복 데이터 비율 모니터링
    - alert: HighDuplicateRate
      expr: rate(collector_duplicate_count[5m]) / rate(collector_total_count[5m]) > 0.5
      for: 5m
      annotations:
        summary: "중복 데이터 비율이 높습니다"
        description: "중복 비율: {{ $value | humanizePercentage }}"
```

### 예상 성능

- **복구 시간**: 즉시 (다른 인스턴스가 계속 수집)
- **데이터 손실**: 없음
- **리소스 사용**: 2배 (CPU, 메모리, 네트워크)
- **중복 데이터**: 약 50% (중복 제거 후 실제 저장량은 동일)

---

## 전략 2: Active-Standby 이중화

### 개요

하나의 Active 인스턴스가 데이터를 수집하고, Standby 인스턴스는 대기 상태로 유지하다가 Active가 크래시 시 즉시 전환하는 방식입니다.

### 아키텍처

```
┌─────────────────────────────────────────┐
│  거래소 웹소켓                           │
└─────────────────────────────────────────┘
              ↓
┌─────────────────┐  ┌─────────────────┐
│ Collector-1     │  │ Collector-2     │
│ (Active)        │  │ (Standby)       │
│ - 웹소켓 연결    │  │ - 대기 상태      │
│ - 데이터 수집    │  │ - Health Check   │
│ - ZMQ 전송       │  │ - 자동 전환 대기  │
└─────────────────┘  └─────────────────┘
         ↓                    ↓
┌─────────────────────────────────────────┐
│  Storage Worker                         │
│  - ZMQ 수신                             │
│  - QuestDB 저장                          │
└─────────────────────────────────────────┘
```

### 장점

- ✅ **리소스 효율**: Standby는 최소 리소스만 사용
- ✅ **데이터 중복 없음**: Active만 데이터 수집
- ✅ **빠른 전환**: 크래시 감지 시 즉시 전환 (< 10초)

### 단점

- ⚠️ **전환 시 데이터 손실**: 전환 시간 동안 데이터 손실 가능
- ⚠️ **복잡한 전환 로직**: 자동 전환 메커니즘 구현 필요
- ⚠️ **웹소켓 재연결 시간**: 전환 시 웹소켓 재연결 필요

### 구현 방법

#### 1. Kubernetes Deployment 구성

```yaml
# k8s/orderbook-collector/deployment-active-standby.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orderbook-collector-active
  namespace: bonanza-index
  labels:
    app: orderbook-collector
    role: active
spec:
  replicas: 1
  selector:
    matchLabels:
      app: orderbook-collector
      role: active
  template:
    metadata:
      labels:
        app: orderbook-collector
        role: active
    spec:
      containers:
      - name: orderbook-collector
        image: bonanza-index/orderbook-collector:latest
        env:
        - name: PROCESS_ID
          value: "orderbook-collector-process-1"
        - name: COLLECTOR_ROLE
          value: "active"
        # ... 기존 설정 ...
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orderbook-collector-standby
  namespace: bonanza-index
  labels:
    app: orderbook-collector
    role: standby
spec:
  replicas: 1
  selector:
    matchLabels:
      app: orderbook-collector
      role: standby
  template:
    metadata:
      labels:
        app: orderbook-collector
        role: standby
    spec:
      containers:
      - name: orderbook-collector
        image: bonanza-index/orderbook-collector:latest
        env:
        - name: PROCESS_ID
          value: "orderbook-collector-process-2"
        - name: COLLECTOR_ROLE
          value: "standby"
        # Standby 모드: 웹소켓 연결하지 않음
        - name: STANDBY_MODE
          value: "true"
        # ... 기존 설정 ...
```

#### 2. 자동 전환 스크립트

```bash
#!/bin/bash
# k8s/collectors/failover.sh

NAMESPACE="bonanza-index"
ACTIVE_DEPLOYMENT="orderbook-collector-active"
STANDBY_DEPLOYMENT="orderbook-collector-standby"
CHECK_INTERVAL=10  # 10초마다 체크

while true; do
    # Active Pod 상태 확인
    ACTIVE_STATUS=$(kubectl get pod -n "$NAMESPACE" -l app=orderbook-collector,role=active -o jsonpath='{.items[0].status.phase}' 2>/dev/null)
    
    if [ "$ACTIVE_STATUS" != "Running" ]; then
        echo "[$(date)] Active Pod failed (status: $ACTIVE_STATUS). Initiating failover..."
        
        # Standby를 Active로 전환
        kubectl patch deployment "$STANDBY_DEPLOYMENT" -n "$NAMESPACE" -p '{"spec":{"template":{"spec":{"containers":[{"name":"orderbook-collector","env":[{"name":"COLLECTOR_ROLE","value":"active"},{"name":"STANDBY_MODE","value":"false"}]}]}}}}'
        
        # 레이블 변경
        kubectl label deployment "$STANDBY_DEPLOYMENT" -n "$NAMESPACE" role=active --overwrite
        kubectl label deployment "$ACTIVE_DEPLOYMENT" -n "$NAMESPACE" role=standby --overwrite
        
        # Deployment 이름 교체 (선택사항)
        # kubectl scale deployment "$STANDBY_DEPLOYMENT" -n "$NAMESPACE" --replicas=1
        # kubectl scale deployment "$ACTIVE_DEPLOYMENT" -n "$NAMESPACE" --replicas=0
        
        echo "[$(date)] Failover completed"
        
        # 알림 전송
        curl -X POST http://telegram-log-service:3109/v1/telegram \
            -H "Content-Type: application/json" \
            -d '{"message":"Collector failover occurred. Standby -> Active"}'
    fi
    
    sleep "$CHECK_INTERVAL"
done
```

#### 3. Collector 코드에 Standby 모드 추가

```javascript
// be/orderbook-collector/src/app.js (수정 예시)

const COLLECTOR_ROLE = process.env.COLLECTOR_ROLE || 'active';
const STANDBY_MODE = process.env.STANDBY_MODE === 'true';

async function main() {
  if (STANDBY_MODE || COLLECTOR_ROLE === 'standby') {
    logger.info('Running in STANDBY mode. Waiting for failover...');
    
    // Standby 모드: Health Check만 수행
    startHealthCheckServer();
    
    // Active 상태 확인 및 전환 대기
    await waitForActiveRole();
    return;
  }
  
  // Active 모드: 정상 실행
  await initializeCollectors();
}

async function waitForActiveRole() {
  // Redis 또는 Kubernetes API를 통해 Active 상태 확인
  const checkInterval = setInterval(async () => {
    const isActive = await checkIfShouldBecomeActive();
    if (isActive) {
      clearInterval(checkInterval);
      logger.info('Becoming ACTIVE. Starting collectors...');
      await initializeCollectors();
    }
  }, 5000); // 5초마다 체크
}
```

### 예상 성능

- **복구 시간**: < 10초 (전환 시간)
- **데이터 손실**: 전환 시간 동안 최소 (약 5-10초)
- **리소스 사용**: Active 100% + Standby 10% (Health Check만)

---

## 전략 3: 큐 영속화 (Persistent Queue)

### 개요

메모리 큐 대신 영속적인 스토리지(Redis, 파일 시스템)를 사용하여 크래시 시에도 데이터를 보존하는 방식입니다.

### 아키텍처

```
┌─────────────────────────────────────────┐
│  거래소 웹소켓                           │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Collector                              │
│  - 웹소켓 연결                           │
│  - Redis 큐 (영속화)                     │
│  - ZMQ 전송                              │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Storage Worker                         │
│  - ZMQ 수신                             │
│  - QuestDB 저장                          │
└─────────────────────────────────────────┘
```

### 장점

- ✅ **데이터 손실 없음**: 크래시 시에도 큐 데이터 보존
- ✅ **단일 인스턴스**: 리소스 효율적
- ✅ **복구 시 데이터 복원**: 재시작 시 큐에서 데이터 복원

### 단점

- ⚠️ **복구 시간**: 재시작 후 큐 복원 시간 필요 (30초~2분)
- ⚠️ **추가 인프라**: Redis 또는 파일 시스템 필요
- ⚠️ **성능 영향**: 디스크 I/O로 인한 지연 가능

### 구현 방법

#### 1. Redis 기반 영속 큐

```javascript
// be/orderbook-collector/src/utils/persistent-queue.js

const redis = require('redis');
const logger = require('./logger.js');

class PersistentQueue {
  constructor(redisClient, queueKey = 'collector:queue') {
    this.redis = redisClient;
    this.queueKey = queueKey;
    this.maxSize = 10000; // 최대 큐 크기
  }

  async enqueue(data) {
    try {
      const message = JSON.stringify({
        data,
        timestamp: Date.now(),
        enqueuedAt: Date.now()
      });
      
      // Redis List에 추가 (왼쪽에서 추가)
      await this.redis.lpush(this.queueKey, message);
      
      // 최대 크기 초과 시 오래된 데이터 제거
      await this.redis.ltrim(this.queueKey, 0, this.maxSize - 1);
      
      return true;
    } catch (error) {
      logger.error({ err: String(error) }, 'Failed to enqueue to Redis');
      throw error;
    }
  }

  async dequeue(count = 1) {
    try {
      // Redis List에서 오른쪽에서 제거 (FIFO)
      const messages = await this.redis.rpop(this.queueKey, count);
      
      if (!messages || messages.length === 0) {
        return [];
      }
      
      return messages.map(msg => JSON.parse(msg));
    } catch (error) {
      logger.error({ err: String(error) }, 'Failed to dequeue from Redis');
      throw error;
    }
  }

  async size() {
    try {
      return await this.redis.llen(this.queueKey);
    } catch (error) {
      logger.error({ err: String(error) }, 'Failed to get queue size');
      return 0;
    }
  }

  async clear() {
    try {
      await this.redis.del(this.queueKey);
    } catch (error) {
      logger.error({ err: String(error) }, 'Failed to clear queue');
    }
  }
}

module.exports = { PersistentQueue };
```

#### 2. Collector에 영속 큐 적용

```javascript
// be/orderbook-collector/src/service/websocket_broker.js (수정 예시)

const { PersistentQueue } = require('../utils/persistent-queue.js');
const { redisManager } = require('../redis.js');

class WebSocketBroker {
  constructor(process_info) {
    // ... 기존 코드 ...
    
    // 영속 큐 초기화
    this.persistentQueue = new PersistentQueue(
      redisManager.getClient(),
      `collector:queue:${this.exchange_cd}`
    );
    
    // 재시작 시 큐 복원
    this.restoreQueue();
  }

  async enqueue(message) {
    // 메모리 큐와 영속 큐 모두에 추가
    this.queue.push({ message, enqueuedAt: Date.now() });
    await this.persistentQueue.enqueue(message);
  }

  async restoreQueue() {
    try {
      const queueSize = await this.persistentQueue.size();
      if (queueSize > 0) {
        logger.info({ size: queueSize }, 'Restoring queue from Redis');
        
        // 큐에서 데이터 복원
        const restored = await this.persistentQueue.dequeue(queueSize);
        for (const item of restored) {
          this.queue.push({
            message: item.data,
            enqueuedAt: item.enqueuedAt
          });
        }
        
        logger.info({ restored: restored.length }, 'Queue restored');
      }
    } catch (error) {
      logger.error({ err: String(error) }, 'Failed to restore queue');
    }
  }
}
```

### 예상 성능

- **복구 시간**: 30초 ~ 2분 (큐 복원 시간)
- **데이터 손실**: 없음
- **리소스 사용**: Redis 메모리 사용 (약 100MB ~ 1GB)

---

## 전략 4: 하이브리드 (Active-Active + 큐 영속화)

### 개요

Active-Active 이중화와 큐 영속화를 결합한 최고 수준의 안정성을 제공하는 방식입니다.

### 아키텍처

```
┌─────────────────────────────────────────┐
│  거래소 웹소켓                           │
└─────────────────────────────────────────┘
         ↓                    ↓
┌─────────────────┐  ┌─────────────────┐
│ Collector-1     │  │ Collector-2     │
│ (Active)        │  │ (Active)        │
│ - 웹소켓 연결    │  │ - 웹소켓 연결    │
│ - Redis 큐       │  │ - Redis 큐       │
│ - ZMQ 전송       │  │ - ZMQ 전송       │
└─────────────────┘  └─────────────────┘
         ↓                    ↓
┌─────────────────────────────────────────┐
│  Storage Worker (중복 제거)              │
│  - 타임스탬프 기반 중복 제거             │
│  - QuestDB 저장                          │
└─────────────────────────────────────────┘
```

### 장점

- ✅ **최고 수준의 안정성**: 이중화 + 영속화
- ✅ **무중단 서비스**: 한 인스턴스 크래시 시에도 계속 수집
- ✅ **데이터 손실 없음**: 크래시 시에도 큐 데이터 보존
- ✅ **즉시 복구**: 다른 인스턴스가 계속 수집

### 단점

- ⚠️ **높은 리소스 사용**: 2배 인스턴스 + Redis
- ⚠️ **복잡한 구현**: 두 전략의 복합 구현
- ⚠️ **운영 복잡도**: 모니터링 및 관리 복잡

### 구현 방법

전략 1과 전략 3을 결합하여 구현합니다.

---

## 권장 전략 선택 가이드

### 시나리오별 권장 전략

| 시나리오 | 권장 전략 | 이유 |
|---------|----------|------|
| **프로덕션 (고가용성 필수)** | 전략 4: 하이브리드 | 최고 수준의 안정성 |
| **프로덕션 (비용 고려)** | 전략 1: Active-Active | 무중단 + 합리적 비용 |
| **개발/테스트** | 전략 3: 큐 영속화 | 단일 인스턴스 + 데이터 보존 |
| **리소스 제약** | 전략 2: Active-Standby | 최소 리소스 사용 |

### 최종 권장사항

**프로덕션 환경: 전략 1 (Active-Active)**

이유:
1. ✅ 무중단 서비스 제공
2. ✅ 데이터 손실 없음
3. ✅ 구현 난이도 중간
4. ✅ 리소스 비용 합리적
5. ✅ 운영 복잡도 적절

**구현 우선순위:**
1. **1단계**: Storage Worker에 중복 제거 로직 추가
2. **2단계**: Collector를 2개 인스턴스로 배포
3. **3단계**: 모니터링 및 알림 설정
4. **4단계**: (선택) 큐 영속화 추가

---

## 구현 체크리스트

### Phase 1: 중복 제거 로직 구현

- [ ] `DataDeduplicator` 클래스 구현
- [ ] Storage Worker에 중복 제거 적용
- [ ] 중복 제거 테스트
- [ ] 성능 테스트 (처리량 확인)

### Phase 2: Active-Active 배포

- [ ] `deployment-primary.yaml` 생성
- [ ] `deployment-secondary.yaml` 생성
- [ ] Service 생성
- [ ] PodDisruptionBudget 설정
- [ ] 배포 및 테스트

### Phase 3: 모니터링 설정

- [ ] PrometheusRule 생성
- [ ] Grafana 대시보드 구성
- [ ] 알림 설정
- [ ] 중복 데이터 비율 모니터링

### Phase 4: (선택) 큐 영속화

- [ ] Redis 기반 영속 큐 구현
- [ ] Collector에 영속 큐 적용
- [ ] 큐 복원 로직 테스트

---

## 모니터링 지표

### 필수 모니터링 지표

1. **가용성**
   - Collector Pod 상태 (Running/Not Running)
   - 두 인스턴스 모두 다운 여부
   - 웹소켓 연결 상태

2. **데이터 품질**
   - 중복 데이터 비율
   - 데이터 수집 지연 시간
   - 큐 크기

3. **성능**
   - 초당 처리 메시지 수
   - ZMQ 전송 성공률
   - QuestDB 저장 성공률

4. **리소스**
   - CPU 사용률
   - 메모리 사용률
   - 네트워크 대역폭

---

## 결론

시세 수집기의 크래시 및 재시작 시 데이터 손실을 방지하기 위해서는 **이중화가 필수**입니다.

**권장 전략: Active-Active 이중화**
- 무중단 서비스 제공
- 데이터 손실 없음
- 합리적인 리소스 사용
- 구현 및 운영 복잡도 적절

**다음 단계:**
1. Storage Worker에 중복 제거 로직 구현
2. Collector를 2개 인스턴스로 배포
3. 모니터링 및 알림 설정
4. 운영 및 최적화

---

**작성일:** 2025-11-28  
**최종 수정일:** 2025-11-28  
**버전:** 1.0

