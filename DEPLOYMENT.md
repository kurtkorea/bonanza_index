# 배포 가이드

## 배포 아키텍처

Bonanza Index 시스템은 **Kubernetes (k3s)**로 통일 배포됩니다.

모든 서비스가 Kubernetes로 배포되며, Docker Compose는 개발/테스트 목적으로 선택적으로 사용할 수 있습니다.

## 1. Kubernetes 배포 (모든 서비스)

### 배포 순서

1. **마스터 노드 배포** (데이터베이스 및 인프라)
   ```bash
   ./k8s/scripts/deploy-master.sh
   ```

2. **워커 노드 배포** (애플리케이션 서비스)
   ```bash
   ./k8s/scripts/deploy-worker.sh
   ```

### 배포되는 서비스

- `orderbook-collector`: 거래소별 호가 수집
- `ticker-collector`: 거래소별 현재가·체결 수집
- `index-endpoint`: 지수 조회 API
- `index-calculator`: 지수 계산 서비스
- `orderbook-storage-worker`: 호가 저장 워커
- `ticker-storage-worker`: 티커 저장 워커
- `telegram-log`: 텔레그램 로깅 서비스
- `index-calc-fe`: 프론트엔드

### 데이터베이스 서비스

- `QuestDB`: 시계열 데이터베이스
- `Redis`: 캐시 및 큐
- `MariaDB`: 메타데이터 저장소

## 2. 전체 시스템 배포 순서

```bash
# 1. 마스터 노드 배포 (DB 및 인프라)
./k8s/scripts/deploy-master.sh

# 2. 워커 노드 배포 (모든 애플리케이션 서비스)
./k8s/scripts/deploy-worker.sh
```

## 3. Docker Compose (선택사항 - 개발/테스트용)

개발/테스트 목적으로 Docker Compose를 사용할 수 있습니다:

```bash
# 프로젝트 루트에서
docker-compose up -d

# 또는 관리 스크립트 사용
./docker-collectors.sh
```

## 4. 상태 확인

### Kubernetes 서비스

```bash
# Pod 상태
kubectl get pods -n bonanza-index

# 서비스 상태
kubectl get svc -n bonanza-index

# 로그 확인
./k8s/scripts/app-log.sh
```

### Docker 서비스 (선택사항)

```bash
# 컨테이너 상태
docker-compose ps

# 로그 확인
docker-compose logs -f

# 리소스 사용량
docker stats
```

## 5. 문제 해결

### Kubernetes Pod 문제

```bash
# Pod 상태 확인
kubectl get pods -n bonanza-index

# Pod 로그
kubectl logs <pod-name> -n bonanza-index

# Pod 재시작
kubectl delete pod <pod-name> -n bonanza-index
```

## 6. 업데이트

### Kubernetes 서비스 업데이트

```bash
# 이미지 재빌드 및 배포
./k8s/scripts/rebuild-and-deploy.sh
```

## 참고

- 모든 서비스는 Kubernetes로 배포되며, 통합 관리가 가능합니다
- Collectors는 외부 거래소와 직접 통신하므로 네트워크 연결이 중요합니다
- Kubernetes 서비스는 내부 네트워크를 통해 통신합니다
- 환경 변수는 ConfigMap과 Secret으로 관리되며, 각 서비스의 `env/prod.env` 파일도 참고할 수 있습니다

