# orderbook-collector 다중 배포 방식 비교

## 요구사항
- 여러 개의 `process_id`로 orderbook-collector 배포
- 각각 다른 환경 설정 파일 사용
- 각 인스턴스는 독립적으로 운영

## 옵션 1: Docker 단일 배포 (각각)

### 구현 방법
```yaml
# docker-compose.yml
services:
  orderbook-collector-1:
    build:
      context: ./be
      dockerfile: orderbook-collector/Dockerfile
    container_name: orderbook-collector-1
    env_file:
      - ./be/orderbook-collector/env/prod-1.env
    environment:
      - PROCESS_ID=process-id-1
    ports:
      - "6001:6001"
    # ... 기타 설정

  orderbook-collector-2:
    build:
      context: ./be
      dockerfile: orderbook-collector/Dockerfile
    container_name: orderbook-collector-2
    env_file:
      - ./be/orderbook-collector/env/prod-2.env
    environment:
      - PROCESS_ID=process-id-2
    ports:
      - "6002:6001"
    # ... 기타 설정
```

### 장점 ✅
1. **간단한 설정**: docker-compose.yml만 수정하면 됨
2. **빠른 배포/재시작**: `docker-compose up -d` 한 번에 모든 인스턴스 관리
3. **로컬 개발과 유사**: 개발 환경과 프로덕션 환경이 일관됨
4. **네트워크 단순**: Docker 네트워크만 사용, 외부 거래소 연결 용이
5. **포트 매핑 유연**: 각 인스턴스마다 다른 호스트 포트 할당 가능
6. **환경 파일 분리**: 각 인스턴스마다 별도 .env 파일 사용 가능

### 단점 ❌
1. **수동 관리**: 여러 컨테이너를 수동으로 관리해야 함
2. **스케일링 어려움**: 인스턴스 추가/제거가 수동 작업
3. **모니터링 분산**: 각 컨테이너를 개별적으로 모니터링
4. **자동 재시작 제한**: Docker의 restart 정책만 의존
5. **리소스 관리 수동**: CPU/메모리 제한을 수동으로 설정
6. **로깅 통합 어려움**: 각 컨테이너의 로그를 별도로 수집해야 함

---

## 옵션 2: Kubernetes 배포

### 구현 방법
```yaml
# k8s/orderbook-collector/deployment-1.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orderbook-collector-1
  namespace: bonanza-index
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: orderbook-collector
        image: bonanza-index/orderbook-collector:latest
        env:
        - name: PROCESS_ID
          value: "process-id-1"
        envFrom:
        - configMapRef:
            name: orderbook-collector-config-1
        # ... 기타 설정

# k8s/orderbook-collector/configmap-1.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: orderbook-collector-config-1
  namespace: bonanza-index
data:
  PORT: "6001"
  DEPTH: "15"
  # ... 환경 변수들
```

### 장점 ✅
1. **자동 관리**: Deployment로 여러 인스턴스를 자동 관리
2. **스케일링 용이**: `kubectl scale` 명령으로 쉽게 스케일링
3. **자동 재시작**: Pod 실패 시 자동 재시작
4. **헬스체크 내장**: Liveness/Readiness Probe로 자동 헬스체크
5. **리소스 제한**: CPU/메모리 제한을 자동으로 관리
6. **로깅 통합**: kubectl logs로 모든 Pod 로그 통합 관리
7. **모니터링 통합**: Kubernetes 메트릭과 통합 가능
8. **서비스 디스커버리**: Service로 내부 통신 자동화
9. **ConfigMap/Secret**: 환경 변수를 중앙에서 관리
10. **롤링 업데이트**: 무중단 업데이트 가능

### 단점 ❌
1. **초기 설정 복잡**: ConfigMap, Deployment 등 여러 리소스 생성 필요
2. **Kubernetes 의존**: k3s 클러스터가 필요
3. **네트워크 복잡**: 외부 거래소 연결 시 네트워크 정책 고려 필요
4. **학습 곡선**: Kubernetes 개념 이해 필요
5. **디버깅 복잡**: kubectl 명령어로 디버깅해야 함

---

## 비교표

| 항목 | Docker 단일 배포 | Kubernetes 배포 |
|------|----------------|----------------|
| **설정 복잡도** | ⭐⭐ 낮음 | ⭐⭐⭐⭐ 높음 |
| **관리 편의성** | ⭐⭐ 수동 | ⭐⭐⭐⭐⭐ 자동 |
| **스케일링** | ⭐ 수동 | ⭐⭐⭐⭐⭐ 자동 |
| **모니터링** | ⭐⭐ 분산 | ⭐⭐⭐⭐⭐ 통합 |
| **자동 재시작** | ⭐⭐ 기본 | ⭐⭐⭐⭐⭐ 고급 |
| **리소스 관리** | ⭐⭐ 수동 | ⭐⭐⭐⭐⭐ 자동 |
| **로깅** | ⭐⭐ 분산 | ⭐⭐⭐⭐⭐ 통합 |
| **네트워크** | ⭐⭐⭐⭐⭐ 단순 | ⭐⭐⭐ 복잡 |
| **외부 연결** | ⭐⭐⭐⭐⭐ 용이 | ⭐⭐⭐ 보통 |
| **학습 곡선** | ⭐⭐ 낮음 | ⭐⭐⭐⭐ 높음 |
| **운영 오버헤드** | ⭐⭐ 낮음 | ⭐⭐⭐ 중간 |

---

## 추천: **Kubernetes 배포** 🎯

### 추천 이유

1. **운영 효율성**
   - 여러 인스턴스를 한 번에 관리
   - 자동 재시작, 헬스체크로 안정성 향상
   - 통합 로깅/모니터링으로 운영 편의성 증대

2. **확장성**
   - 인스턴스 추가/제거가 쉬움
   - 필요시 자동 스케일링 가능
   - 리소스 관리 자동화

3. **일관성**
   - 나머지 서비스들이 이미 Kubernetes로 배포됨
   - 통일된 배포/관리 방식
   - ConfigMap/Secret으로 중앙 집중식 설정 관리

4. **운영 안정성**
   - Pod 실패 시 자동 재시작
   - 롤링 업데이트로 무중단 배포
   - 리소스 제한으로 시스템 안정성 보장

### Docker 단일 배포를 선택해야 하는 경우

다음 조건이 모두 충족될 때만 Docker 단일 배포를 고려:

- ✅ 인스턴스 개수가 2-3개로 고정
- ✅ 자동 스케일링이 필요 없음
- ✅ 간단한 운영 환경
- ✅ Kubernetes 클러스터가 없거나 사용하기 어려운 환경

---

## 구현 가이드

### Kubernetes 배포 구현 예시

```bash
# 1. ConfigMap 생성 (각 process_id마다)
kubectl create configmap orderbook-collector-config-1 \
  --from-env-file=./be/orderbook-collector/env/prod-1.env \
  -n bonanza-index

# 2. Deployment 생성
kubectl apply -f k8s/orderbook-collector/deployment-1.yaml

# 3. 여러 인스턴스 배포
for i in {1..5}; do
  kubectl apply -f k8s/orderbook-collector/deployment-${i}.yaml
done
```

### Docker 단일 배포 구현 예시

```bash
# docker-compose.yml에 여러 서비스 정의 후
docker-compose up -d orderbook-collector-1
docker-compose up -d orderbook-collector-2
docker-compose up -d orderbook-collector-3
```

---

## 최종 권장사항

**Kubernetes 배포를 강력히 권장합니다.**

이유:
1. 이미 나머지 서비스가 Kubernetes로 배포되어 있음
2. 여러 인스턴스 관리에 더 적합
3. 운영 안정성과 확장성이 우수
4. 장기적으로 유지보수가 용이

Docker 단일 배포는 개발/테스트 환경이나 소규모 배포에만 적합합니다.

