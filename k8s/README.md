# Bonanza Index - Kubernetes 배포 가이드

이 디렉토리에는 Bonanza Index 프로젝트를 쿠버네티스에 배포하기 위한 모든 매니페스트 파일이 포함되어 있습니다.

## 🏗️ 서버 구조

이 배포는 **단일 머신(Standalone)** 구성입니다:

- **단일 노드**: 모든 서비스(데이터베이스, 애플리케이션, 프론트엔드)가 하나의 Kubernetes 노드에서 실행됩니다.
- 노드 셀렉터 없음: 모든 Pod는 Kubernetes 스케줄러에 의해 자동으로 스케줄링됩니다.

## 📁 디렉토리 구조

```
k8s/
├── namespace.yaml                 # 네임스페이스
├── configmap-common.yaml          # 공통 ConfigMap
├── secret.yaml                    # 비밀 정보 (시크릿)
├── ingress.yaml                   # Ingress 리소스
├── questdb/                      # QuestDB StatefulSet
├── redis/                        # Redis Deployment
├── mariadb/                      # MariaDB StatefulSet
├── nginx/                        # Nginx Deployment
├── installation/                 # Kubernetes 설치 가이드
│   ├── README.md
│   ├── kubernetes-install-linux.md
│   └── kubernetes-install-wsl-windows.md
├── index-endpoint/                # API 엔드포인트 서비스
├── index-calculator/              # 지수 계산 서비스
├── orderbook-collector/           # 호가 수집 서비스
├── ticker-collector/              # 티커 수집 서비스
├── orderbook-storage-worker/      # 호가 저장 워커
├── ticker-storage-worker/         # 티커 저장 워커
├── orderbook-aggregator/          # 호가 집계 서비스
├── telegram-log/                  # 텔레그램 로그 서비스
└── index-calc-fe/                 # 프론트엔드
```

## 🚀 배포 순서

### -1. Kubernetes 설치 (필수)

**단일 머신에 Kubernetes 설치가 필요합니다:**

👉 **[Kubernetes 설치 가이드](./installation/README.md)**

자세한 설치 방법:
- [Linux 설치](./installation/kubernetes-install-linux.md)
- [Windows WSL 설치](./installation/kubernetes-install-wsl-windows.md)

### 0. 클러스터 확인

```bash
# 노드 확인
kubectl get nodes

# 클러스터 정보 확인
kubectl cluster-info
```

### 1. 배포

#### 수동 배포

```bash
# 네임스페이스 생성
kubectl apply -f k8s/namespace.yaml

# 공통 리소스
kubectl apply -f k8s/configmap-common.yaml
kubectl apply -f k8s/secret.yaml

# 데이터베이스 서비스 배포
kubectl apply -f k8s/redis/pvc.yaml
kubectl apply -f k8s/redis/
kubectl apply -f k8s/questdb/
kubectl apply -f k8s/mariadb/

# Nginx 배포
kubectl apply -f k8s/nginx/

# 백엔드 서비스 배포
kubectl apply -f k8s/index-endpoint/
kubectl apply -f k8s/index-calculator/
kubectl apply -f k8s/orderbook-collector/
kubectl apply -f k8s/ticker-collector/
kubectl apply -f k8s/orderbook-storage-worker/
kubectl apply -f k8s/ticker-storage-worker/
kubectl apply -f k8s/orderbook-aggregator/
kubectl apply -f k8s/telegram-log/

# 프론트엔드 배포
kubectl apply -f k8s/index-calc-fe/

# Ingress 배포
kubectl apply -f k8s/ingress.yaml
```

### 2. 배포 확인

```bash
# 네임스페이스 확인
kubectl get namespaces | grep bonanza-index

# Pod 상태 확인
kubectl get pods -n bonanza-index

# 서비스 확인
kubectl get svc -n bonanza-index

# 노드별 Pod 배치 확인
kubectl get pods -n bonanza-index -o wide --sort-by=.spec.nodeName

# 데이터베이스 Pod
kubectl get pods -n bonanza-index -o wide | grep -E "(questdb|redis|mariadb)"

# 애플리케이션 Pod
kubectl get pods -n bonanza-index -o wide | grep -vE "(questdb|redis|mariadb)"

# Ingress 확인
kubectl get ingress -n bonanza-index

# 특정 Pod 로그 확인
kubectl logs -f <pod-name> -n bonanza-index

# 배포 상태 확인
kubectl get deployments -n bonanza-index
```

## 📍 서비스 구성

### 데이터베이스 서비스
- **QuestDB**: StatefulSet (PGWire 8812, REST 9000, ILP 9009)
- **Redis**: Deployment (포트 6379)
- **MariaDB**: StatefulSet (포트 23306)
- PersistentVolumeClaim을 통한 데이터 영구 저장

### 애플리케이션 서비스
- 모든 백엔드 및 프론트엔드 서비스가 동일한 노드에서 실행
- Kubernetes 서비스 DNS를 통해 서비스 간 통신

## 🔗 네트워크 아키텍처

```
                    ┌─────────────────────────────────┐
                    │   단일 노드 (Standalone)          │
                    ├─────────────────────────────────┤
Internet             │                                 │
  ↓                 │  ┌──────────────────────────┐  │
Ingress (nginx)     │  │ index-calc-fe            │  │
  ↓                 │  │ index-endpoint (3009)     │  │
  ├─────────────────┼─→│ index-calculator         │  │
  │                 │  │ orderbook-collector      │  │
  │                 │  │ ticker-collector         │  │
  │                 │  │ orderbook-storage-worker│  │
  │                 │  │ ticker-storage-worker    │  │
  │                 │  │ orderbook-aggregator     │  │
  │                 │  │ telegram-log            │  │
  │                 │  └──────────────────────────┘  │
  │                 │                                 │
  │                 │  ┌──────────────────────────┐  │
  └─────────────────┼─→│ QuestDB (8812,9000,9009) │  │
                    │  │ Redis (6379)              │  │
                    │  │ MariaDB (23306)           │  │
                    │  │ Nginx (7600)              │  │
                    │  └──────────────────────────┘  │
                    │                                 │
                    │  PersistentVolume (데이터 저장) │
                    └─────────────────────────────────┘
```

## 📝 서비스 포트

| 서비스 | 포트 | 용도 |
|--------|------|------|
| questdb | 8812, 9000, 9009 | PGWire, REST, ILP |
| redis | 6379 | Redis |
| mariadb | 23306 | MySQL |
| nginx | 7600 | Reverse Proxy |
| index-endpoint | 3009 | REST API |
| index-calculator | 6757 | ZMQ Publisher |
| orderbook-collector | 5557, 6557 | ZMQ Push/Pub |
| ticker-collector | 5657, 6657 | ZMQ Push/Pub |
| telegram-log | 3109 | 텔레그램 로그 API |
| index-calc-fe | 80 | 프론트엔드 |

## ⚠️ 주의사항

1. **단일 노드 구성**: 모든 서비스가 하나의 노드에서 실행되므로 리소스(CPU, 메모리)를 충분히 확보해야 합니다.

2. **데이터베이스 Pod 배포**: 
   - **QuestDB**: StatefulSet으로 배포 (PersistentVolumeClaim 사용)
   - **Redis**: Deployment로 배포 (PersistentVolumeClaim 사용)
   - **MariaDB**: StatefulSet으로 배포 (PersistentVolumeClaim 사용)
   - StorageClass가 설정되어 있어야 PVC가 정상 작동합니다.

3. **리소스 제한**: 프로덕션 환경에서는 리소스 요청/제한을 실제 워크로드에 맞게 조정하세요.

4. **헬스 체크**: `/health` 엔드포인트가 없는 서비스는 livenessProbe를 exec 방식으로 변경하거나 헬스 체크 엔드포인트를 추가하세요.

## 📞 문제 해결

### Pod가 시작되지 않는 경우

```bash
# Pod 상태 확인
kubectl describe pod <pod-name> -n bonanza-index

# 로그 확인
kubectl logs <pod-name> -n bonanza-index
kubectl logs <pod-name> -n bonanza-index --previous  # 이전 컨테이너 로그
```

### 노드 스케줄링 문제

```bash
# 노드 확인
kubectl get nodes

# 노드 리소스 확인
kubectl top nodes

# Pod가 스케줄링되지 않는 이유 확인
kubectl describe pod <pod-name> -n bonanza-index | grep -A 10 Events
```

### 데이터베이스 연결 문제

```bash
# 데이터베이스 Pod 상태 확인
kubectl get pods -l app=questdb -n bonanza-index
kubectl get pods -l app=redis -n bonanza-index
kubectl get pods -l app=mariadb -n bonanza-index

# PVC 상태 확인
kubectl get pvc -n bonanza-index

# 서비스 엔드포인트 확인
kubectl get endpoints -n bonanza-index | grep -E "(questdb|redis|mariadb)"
```

## 🔄 롤링 업데이트

```bash
# 이미지 업데이트 후
kubectl set image deployment/index-endpoint \
  index-endpoint=bonanza-index/index-endpoint:v1.1.0 \
  -n bonanza-index

# 롤백
kubectl rollout undo deployment/index-endpoint -n bonanza-index

# 배포 히스토리
kubectl rollout history deployment/index-endpoint -n bonanza-index
```

## 🗑️ 삭제

### 전체 삭제

```bash
kubectl delete namespace bonanza-index
```

### 개별 리소스 삭제

```bash
kubectl delete -f k8s/index-endpoint/
```

