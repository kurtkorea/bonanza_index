# orderbook-collector 배포 안내

`orderbook-collector`는 Kubernetes (k3s)로 배포되며, 여러 개의 `process_id`로 분리 배포할 수 있습니다.

## 배포 구조

- `deployment-1.yaml`: process_id 1용 Deployment
- `deployment-2.yaml`: process_id 2용 Deployment
- `service-1.yaml`: process_id 1용 Service
- `service-2.yaml`: process_id 2용 Service
- `deployment.yaml`: 단일 배포용 (기존, 선택사항)
- `service.yaml`: 단일 배포용 Service (기존, 선택사항)

## Kubernetes 배포 방법

### 다중 인스턴스 배포 (권장)

```bash
# process_id 2개로 배포
kubectl apply -f k8s/orderbook-collector/deployment-1.yaml
kubectl apply -f k8s/orderbook-collector/deployment-2.yaml
kubectl apply -f k8s/orderbook-collector/service-1.yaml
kubectl apply -f k8s/orderbook-collector/service-2.yaml

# 또는 전체 디렉토리 적용 (기존 deployment.yaml 제외)
kubectl apply -f k8s/orderbook-collector/deployment-1.yaml \
               -f k8s/orderbook-collector/deployment-2.yaml \
               -f k8s/orderbook-collector/service-1.yaml \
               -f k8s/orderbook-collector/service-2.yaml
```

### 단일 인스턴스 배포

```bash
# 기존 방식 (단일 process_id)
kubectl apply -f k8s/orderbook-collector/deployment.yaml
kubectl apply -f k8s/orderbook-collector/service.yaml
```

### 워커 노드 배포 스크립트 사용

```bash
# 워커 노드 배포 스크립트 사용 (자동으로 다중 인스턴스 배포)
./k8s/scripts/deploy-worker.sh
```

## Process ID 설정

각 Deployment의 `PROCESS_ID` 환경 변수를 통해 구분됩니다:

- `deployment-1.yaml`: `PROCESS_ID=orderbook-collector-process-1`
- `deployment-2.yaml`: `PROCESS_ID=orderbook-collector-process-2`

**중요**: 실제 process_id 값은 데이터베이스의 `tb_index_process_info` 테이블에 등록된 값을 사용해야 합니다. 
위의 예시 값(`orderbook-collector-process-1`, `orderbook-collector-process-2`)은 실제 process_id로 변경해야 합니다.

### Process ID 변경 방법

1. 데이터베이스에서 실제 process_id 확인:
   ```sql
   SELECT process_id FROM tb_index_process_info;
   ```

2. deployment-1.yaml과 deployment-2.yaml의 `PROCESS_ID` 환경 변수 값을 실제 process_id로 변경:
   ```yaml
   - name: PROCESS_ID
     value: "실제-process-id-값"
   ```

3. 변경 후 재배포:
   ```bash
   kubectl apply -f k8s/orderbook-collector/deployment-1.yaml
   kubectl apply -f k8s/orderbook-collector/deployment-2.yaml
   ```

## Docker 배포 (선택사항)

개발/테스트 목적으로 Docker Compose를 사용할 수도 있습니다:

```bash
# Docker Compose를 사용한 빌드 및 시작
docker-compose up -d orderbook-collector

# 또는 관리 스크립트 사용
./docker-collectors.sh
```

