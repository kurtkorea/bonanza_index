# Bonanza Index - Kubernetes 배포 가이드

이 디렉토리에는 Bonanza Index 프로젝트를 쿠버네티스에 배포하기 위한 모든 매니페스트 파일이 포함되어 있습니다.

## 🏗️ 서버 구조

이 배포는 **2대의 서버**로 구성됩니다:

- **마스터 노드** (121.88.4.53 - Linux): Kubernetes 마스터 노드 + QuestDB, Redis, MariaDB Pod 실행
- **워커 노드** (121.88.4.57 - Windows WSL): 모든 애플리케이션 Pod가 실행되는 쿠버네티스 워커 노드

### 노드 셀렉터

- **데이터베이스 Pod**: `nodeSelector: node-role.kubernetes.io/control-plane: "true"` → 마스터 노드에 배포
- **애플리케이션 Pod**: `nodeSelector: app-server: "true"` → 워커 노드에만 스케줄링

## 📁 디렉토리 구조

```
k8s/
├── namespace.yaml                 # 네임스페이스
├── configmap-common.yaml          # 공통 ConfigMap
├── secret.yaml                    # 비밀 정보 (시크릿)
├── ingress.yaml                   # Ingress 리소스
├── monitoring/                    # Prometheus, Loki, Grafana Helm 값 및 가이드
├── kube-system/
│   └── coredns-node-selector.yaml  # CoreDNS를 리눅스 노드(컨트롤 플레인)로 고정
├── questdb/                       # QuestDB StatefulSet (마스터 노드)
├── redis/                         # Redis Deployment (마스터 노드)
├── mariadb/                       # MariaDB StatefulSet (마스터 노드)
├── nginx/                         # Nginx Deployment (마스터 노드)
├── installation/                  # Kubernetes 설치 가이드
│   ├── README.md
│   ├── kubernetes-install-linux.md
│   └── kubernetes-install-wsl-windows.md
├── index-endpoint/                # API 엔드포인트 서비스 (워커 노드)
├── index-calculator/              # 지수 계산 서비스 (워커 노드)
├── orderbook-collector/           # 호가 수집 서비스 (워커 노드)
├── ticker-collector/              # 티커 수집 서비스 (워커 노드)
├── orderbook-storage-worker/      # 호가 저장 워커 (워커 노드)
├── ticker-storage-worker/         # 티커 저장 워커 (워커 노드)
├── orderbook-aggregator/          # 호가 집계 서비스 (워커 노드)
├── telegram-log/                  # 텔레그램 로그 서비스 (워커 노드)
└── index-calc-fe/                 # 프론트엔드 (워커 노드)
```

## 🚀 배포 순서

### -1. Kubernetes 설치 (필수)

**각 서버에 Kubernetes 설치가 필요합니다:**

- **Linux 서버 (121.88.4.53)**: 마스터 노드이므로 Kubernetes 설치 필수
- **Windows WSL 서버 (121.88.4.57)**: 워커 노드이므로 반드시 Kubernetes 설치 필요

👉 **[Kubernetes 설치 가이드](./installation/README.md)**

자세한 설치 방법:
- [Linux 마스터 노드 설치](./installation/kubernetes-install-linux.md)
- [Windows WSL 워커 노드 설치](./installation/kubernetes-install-wsl-windows.md)

### 0. 노드 설정 (필수)
# DNS(CoreDNS) 문제가 발생하는 경우
- Windows WSL 워커와 리눅스 컨트롤 플레인 간 네트워크 제약으로 DNS가 불안정하면 `kube-system/coredns-node-selector.yaml`을 적용해 CoreDNS 파드를 컨트롤 플레인 노드에 고정하세요.
- 적용 명령:
  ```bash
  kubectl apply -f k8s/kube-system/coredns-node-selector.yaml
  kubectl rollout restart deployment/coredns -n kube-system
  ```


#### 마스터 노드 확인

마스터 노드는 자동으로 `node-role.kubernetes.io/control-plane=true` 라벨을 가집니다.

```bash
# 마스터 노드 확인
kubectl get nodes --show-labels | grep -E "(master|control-plane)"
```

#### 워커 노드 라벨 추가

배포 전에 워커 노드 (121.88.4.57)에 라벨을 추가해야 합니다:

```bash
# 노드 확인 및 이름 찾기
kubectl get nodes -o wide | grep 121.88.4.57

# 워커 노드에 라벨 추가 (노드 이름은 실제 값으로 변경)
kubectl label nodes <node-name> app-server=true --overwrite

# 라벨 확인
kubectl get nodes --show-labels | grep app-server
```

자세한 내용은 `k8s/node-setup.md` 파일을 참조하세요.

### 1. 배포

#### 자동 배포 스크립트 사용 (권장)

```bash
# 노드 라벨 자동 설정 포함 버전
./k8s/deploy-with-node-setup.sh

# 또는 기본 배포 스크립트 (라벨은 이미 설정된 경우)
./k8s/deploy.sh
```

#### 수동 배포

```bash
# 네임스페이스 생성
kubectl apply -f k8s/namespace.yaml

# 공통 리소스
kubectl apply -f k8s/configmap-common.yaml
kubectl apply -f k8s/secret.yaml

# 데이터베이스 서비스 배포 (마스터 노드)
kubectl apply -f k8s/redis/pvc.yaml
kubectl apply -f k8s/redis/
kubectl apply -f k8s/questdb/
kubectl apply -f k8s/mariadb/

# Nginx 배포 (마스터 노드)
kubectl apply -f k8s/nginx/

# 백엔드 서비스 배포 (워커 노드)
kubectl apply -f k8s/index-endpoint/
kubectl apply -f k8s/index-calculator/
kubectl apply -f k8s/orderbook-collector/
kubectl apply -f k8s/ticker-collector/
kubectl apply -f k8s/orderbook-storage-worker/
kubectl apply -f k8s/ticker-storage-worker/
kubectl apply -f k8s/orderbook-aggregator/
kubectl apply -f k8s/telegram-log/

# 프론트엔드 배포 (워커 노드)
kubectl apply -f k8s/index-calc-fe/

# Ingress 배포
kubectl apply -f k8s/ingress.yaml

# 모니터링 스택 (Helm)
kubectl apply -f k8s/monitoring/namespace.yaml
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n bonanza-monitoring \
  -f k8s/monitoring/values-prometheus.yaml
helm upgrade --install loki grafana/loki-stack \
  -n bonanza-monitoring \
  -f k8s/monitoring/values-loki.yaml

# 모니터링 스택 (스크립트)
./k8s/scripts/deploy-monitoring.sh
./k8s/scripts/deploy-monitoring.sh --port-forward   # Grafana 포트포워딩 포함

# 모니터링 스택 제거 (스크립트)
./k8s/scripts/destroy-monitoring.sh            # PVC 유지
./k8s/scripts/destroy-monitoring.sh --delete-storage  # PVC/PV 삭제
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

# 데이터베이스 Pod (마스터 노드)
kubectl get pods -n bonanza-index -o wide | grep -E "(questdb|redis|mariadb)"

# 애플리케이션 Pod (워커 노드)
kubectl get pods -n bonanza-index -o wide | grep -vE "(questdb|redis|mariadb)"

# Ingress 확인
kubectl get ingress -n bonanza-index

# 특정 Pod 로그 확인
kubectl logs -f <pod-name> -n bonanza-index

# 배포 상태 확인
kubectl get deployments -n bonanza-index
```

## 📍 서버별 구성

### 마스터 노드 (121.88.4.53 - Linux)
- Kubernetes 마스터 노드
- **QuestDB Pod**: StatefulSet (PGWire 8812, REST 9000, ILP 9009)
- **Redis Pod**: Deployment (포트 6379)
- **MariaDB Pod**: StatefulSet (포트 23306)
- `node-role.kubernetes.io/control-plane=true` 라벨 자동 설정
- PersistentVolumeClaim을 통한 데이터 영구 저장

### 워커 노드 (121.88.4.57 - Windows WSL)
- 쿠버네티스 워커 노드
- 모든 애플리케이션 Pod 실행
- `app-server=true` 라벨 필요
- 마스터 노드의 데이터베이스 서비스에 접근하여 DB 사용

## 🔗 네트워크 아키텍처

```
                    ┌─────────────────────────────────┐
                    │   워커 노드 (121.88.4.57)        │
                    │   (Windows WSL)                  │
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
  │                 └─────────────────────────────────┘
  │                              ↓
  └──────────────────────────────┼────────────────────────
                                 ↓
                    ┌─────────────────────────────────┐
                    │   마스터 노드 (121.88.4.53)      │
                    │   (Linux)                       │
                    ├─────────────────────────────────┤
                    │  QuestDB Pod (StatefulSet)     │
                    │  - PGWire: 8812                │
                    │  - REST: 9000                   │
                    │  - ILP: 9009                    │
                    │                                │
                    │  Redis Pod (Deployment)        │
                    │  - Port: 6379                  │
                    │                                │
                    │  MariaDB Pod (StatefulSet)     │
                    │  - Port: 23306                 │
                    │                                │
                    │  PersistentVolume (데이터 저장) │
                    └─────────────────────────────────┘
```

## 📝 서비스 포트

| 서비스 | 포트 | 용도 | 배포 노드 |
|--------|------|------|-----------|
| questdb | 8812, 9000, 9009 | PGWire, REST, ILP | 마스터 |
| redis | 6379 | Redis | 마스터 |
| mariadb | 23306 | MySQL | 마스터 |
| index-endpoint | 3009 | REST API | 워커 |
| index-calculator | 6757 | ZMQ Publisher | 워커 |
| orderbook-collector | 5557, 6557 | ZMQ Push/Pub | 워커 |
| ticker-collector | 5657, 6657 | ZMQ Push/Pub | 워커 |
| telegram-log | 3109 | 텔레그램 로그 API | 워커 |
| index-calc-fe | 80 | 프론트엔드 | 워커 |
| kube-prometheus-stack-grafana | NodePort 31300 | 대시보드 | 워커 |
| kube-prometheus-stack-prometheus | 9090 | 메트릭 UI | 마스터 |
| kube-prometheus-stack-alertmanager | 9093 | 알람 UI | 마스터 |
| loki | 3100 | 로그 쿼리 API | 마스터 |

## ⚠️ 주의사항

1. **노드 라벨링 필수**: 배포 전에 반드시 워커 노드에 `app-server=true` 라벨을 추가해야 합니다. 라벨이 없으면 Pod가 스케줄링되지 않습니다.

2. **데이터베이스 Pod 배포**: 
   - **QuestDB**: StatefulSet으로 마스터 노드에 배포 (PersistentVolumeClaim 사용)
   - **Redis**: Deployment로 마스터 노드에 배포 (PersistentVolumeClaim 사용)
   - **MariaDB**: StatefulSet으로 마스터 노드에 배포 (PersistentVolumeClaim 사용)
   - 마스터 노드에 `node-role.kubernetes.io/control-plane=true` 라벨이 자동 설정됩니다.
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
# 노드 라벨 확인
kubectl get nodes --show-labels

# 워커 노드 라벨 확인
kubectl get nodes --show-labels | grep app-server

# 마스터 노드 라벨 확인
kubectl get nodes --show-labels | grep control-plane

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

