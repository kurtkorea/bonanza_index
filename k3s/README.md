# Bonanza Index Kubernetes (k3s) 배포 가이드

이 디렉토리는 Bonanza Index 서비스들을 Kubernetes (k3s)에 배포하기 위한 매니페스트 파일들을 포함합니다.

## 배포 대상 서비스

- **minio**: 객체 스토리지 서비스 (S3 호환)
- **index-calculator**: 지수 계산 서비스
- **index-endpoint**: 지수 API 엔드포인트
- **orderbook-collector**: 호가 수집 서비스
- **orderbook-storage-worker**: 호가 저장 워커
- **ticker-collector**: 현재가 수집 서비스
- **ticker-storage-worker**: 현재가 저장 워커
- **telegram-log**: 텔레그램 로그 전송 서비스

## 외부 리소스

다음 서비스들은 Docker로 별도 설치되어 있습니다 (10.40.100.21):

- **MySQL**: 포트 30306
- **QuestDB**: 포트 8812, 9000, 9009
- **Redis**: 포트 6379

## 사전 요구사항

### k3s 설치

k3s가 설치되어 있지 않은 경우 다음 명령어로 설치합니다:

#### Linux (Ubuntu/Debian)

```bash
# k3s 설치
curl -sfL https://get.k3s.io | sh -

# k3s 서비스 상태 확인
sudo systemctl status k3s

# k3s 자동 시작 설정 (이미 기본적으로 활성화됨)
sudo systemctl enable k3s
```

#### k3s 설치 후 설정

```bash
# kubectl 명령어를 일반 사용자로 사용하기 위한 설정
# 방법 1: k3s kubectl 사용 (권장)
# k3s kubectl 명령어를 사용하거나 스크립트가 자동으로 처리합니다

# 방법 2: kubectl 심볼릭 링크 생성 (선택사항)
sudo ln -s /usr/local/bin/k3s /usr/local/bin/kubectl

# 방법 3: kubeconfig 파일 복사 (선택사항)
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config
export KUBECONFIG=~/.kube/config
```

#### k3s 설치 확인

```bash
# k3s 버전 확인
k3s --version

# kubectl을 통한 클러스터 확인
k3s kubectl get nodes
k3s kubectl get pods --all-namespaces
```

#### k3s 제거 (필요시)

```bash
# k3s 서비스 중지 및 제거
sudo /usr/local/bin/k3s-uninstall.sh

# 또는 k3s-agent 제거 (agent 노드인 경우)
sudo /usr/local/bin/k3s-agent-uninstall.sh
```

### 호스트 디렉토리 준비

MinIO를 위한 디렉토리를 생성합니다:

```bash
# MinIO 볼륨 디렉토리 생성
sudo mkdir -p /home/dayfin/volume/minio
sudo chmod -R 777 /home/dayfin/volume/minio
```

## 배포 방법

### 1. Docker 이미지 빌드

각 서비스의 Docker 이미지를 빌드합니다. 빌드 컨텍스트에 따라 빌드 방법이 다릅니다:

#### index-calculator 이미지 빌드

```bash
cd be/index-calculator
docker build -t bonanza-index/index-calculator:latest .
cd ../..
```

#### index-endpoint 이미지 빌드

```bash
cd be/index-endpoint
docker build -t bonanza-index/index-endpoint:latest .
cd ../..
```

#### orderbook-collector 이미지 빌드

**주의**: orderbook-collector는 `be` 디렉토리를 빌드 컨텍스트로 사용합니다.

```bash
cd be
docker build -f orderbook-collector/Dockerfile -t bonanza-index/orderbook-collector:latest .
cd ..
```

#### ticker-collector 이미지 빌드

**주의**: ticker-collector는 `be` 디렉토리를 빌드 컨텍스트로 사용합니다.

```bash
cd be
docker build -f ticker-collector/Dockerfile -t bonanza-index/ticker-collector:latest .
cd ..
```

#### orderbook-storage-worker 이미지 빌드

**주의**: orderbook-storage-worker는 `be` 디렉토리를 빌드 컨텍스트로 사용합니다.

```bash
cd be
docker build -f orderbook-storage-worker/Dockerfile -t bonanza-index/orderbook-storage-worker:latest .
cd ..
```

#### ticker-storage-worker 이미지 빌드

**주의**: ticker-storage-worker는 `be` 디렉토리를 빌드 컨텍스트로 사용합니다.

```bash
cd be
docker build -f ticker-storage-worker/Dockerfile -t bonanza-index/ticker-storage-worker:latest .
cd ..
```

#### 스크립트를 사용한 빌드 (권장)

메뉴 방식의 빌드 스크립트를 사용할 수 있습니다:

```bash
cd k3s/scripts
chmod +x build-images.sh
./build-images.sh
```

스크립트를 실행하면 다음과 같은 메뉴가 표시됩니다:

```
==========================================
  Bonanza Index Docker 이미지 빌드
==========================================

빌드할 서비스를 선택하세요:

  1) index-calculator
  2) index-endpoint
  3) orderbook-collector
  4) ticker-collector
  5) orderbook-storage-worker
  6) ticker-storage-worker
  7) telegram-log
  8) 모든 서비스 (all)
  0) 종료

선택 [0-8]:
```

원하는 번호를 입력하면 해당 서비스를 빌드합니다.

#### 모든 이미지 빌드 (수동 방법)

스크립트 없이 직접 빌드하는 경우:

```bash
# 프로젝트 루트 디렉토리에서 실행

# index-calculator
cd be/index-calculator && docker build -t bonanza-index/index-calculator:latest . && cd ../..

# index-endpoint
cd be/index-endpoint && docker build -t bonanza-index/index-endpoint:latest . && cd ../..

# orderbook-collector
cd be && docker build -f orderbook-collector/Dockerfile -t bonanza-index/orderbook-collector:latest . && cd ..

# ticker-collector
cd be && docker build -f ticker-collector/Dockerfile -t bonanza-index/ticker-collector:latest . && cd ..

# orderbook-storage-worker
cd be && docker build -f orderbook-storage-worker/Dockerfile -t bonanza-index/orderbook-storage-worker:latest . && cd ..

# ticker-storage-worker
cd be && docker build -f ticker-storage-worker/Dockerfile -t bonanza-index/ticker-storage-worker:latest . && cd ..

# telegram-log
cd be/telegram-log && docker build -t bonanza-index/telegram-log:latest . && cd ../..
```

#### 빌드된 이미지 확인

```bash
docker images | grep bonanza-index
```

예상 출력:
```
bonanza-index/index-calculator          latest    ...
bonanza-index/index-endpoint            latest    ...
bonanza-index/orderbook-collector       latest    ...
bonanza-index/orderbook-storage-worker  latest    ...
bonanza-index/ticker-collector          latest    ...
bonanza-index/ticker-storage-worker     latest    ...
bonanza-index/telegram-log              latest    ...
```

### 2. 이미지를 k3s 노드로 전송 및 로드

빌드된 이미지를 k3s 노드에 로드합니다. 스크립트를 사용하거나 수동으로 진행할 수 있습니다:

#### 스크립트를 사용한 이미지 로드 (권장)

메뉴 방식의 이미지 로드 스크립트를 사용할 수 있습니다:

```bash
cd k3s/scripts
chmod +x load-images.sh
./load-images.sh
```

스크립트 옵션:
- 현재 디렉토리의 tar.gz 파일 자동 로드
- 파일 경로 지정하여 로드
- Docker에서 직접 저장 후 로드
- 로드된 이미지 확인
- 필요한 이미지 목록 확인

#### 수동으로 이미지 전송 및 로드

빌드된 이미지를 k3s 노드에 로드하는 방법:

#### 방법 1: tar 파일로 저장 후 전송 (권장)

```bash
# 이미지를 tar 파일로 저장
docker save bonanza-index/index-calculator:latest | gzip > index-calculator.tar.gz
docker save bonanza-index/index-endpoint:latest | gzip > index-endpoint.tar.gz
docker save bonanza-index/orderbook-collector:latest | gzip > orderbook-collector.tar.gz
docker save bonanza-index/orderbook-storage-worker:latest | gzip > orderbook-storage-worker.tar.gz
docker save bonanza-index/ticker-collector:latest | gzip > ticker-collector.tar.gz
docker save bonanza-index/ticker-storage-worker:latest | gzip > ticker-storage-worker.tar.gz
docker save bonanza-index/telegram-log:latest | gzip > telegram-log.tar.gz

# k3s 노드로 파일 전송 (scp 사용 예시)
scp *.tar.gz user@k3s-node:/tmp/

# k3s 노드에서 이미지 로드
ssh user@k3s-node
cd /tmp
sudo k3s ctr images import index-calculator.tar.gz
sudo k3s ctr images import index-endpoint.tar.gz
sudo k3s ctr images import orderbook-collector.tar.gz
sudo k3s ctr images import orderbook-storage-worker.tar.gz
sudo k3s ctr images import ticker-collector.tar.gz
sudo k3s ctr images import ticker-storage-worker.tar.gz
sudo k3s ctr images import telegram-log.tar.gz
```

#### 방법 2: Docker에서 직접 로드 (가장 편리)

Docker에 이미 빌드된 이미지가 있다면, 스크립트의 옵션 3을 사용하거나 다음 명령어로 직접 로드할 수 있습니다:

```bash
# Docker에 있는 이미지를 k3s에 직접 로드
docker save bonanza-index/index-calculator:latest | sudo k3s ctr images import -
docker save bonanza-index/index-endpoint:latest | sudo k3s ctr images import -
docker save bonanza-index/orderbook-collector:latest | sudo k3s ctr images import -
docker save bonanza-index/ticker-collector:latest | sudo k3s ctr images import -
docker save bonanza-index/orderbook-storage-worker:latest | sudo k3s ctr images import -
docker save bonanza-index/ticker-storage-worker:latest | sudo k3s ctr images import -
docker save bonanza-index/telegram-log:latest | sudo k3s ctr images import -

# 로드 확인
sudo k3s ctr images list | grep bonanza-index
```

#### 방법 3: Docker Registry 사용 (선택사항)

이미지를 Docker Registry에 푸시한 후 k3s 노드에서 pull할 수 있습니다:

```bash
# 이미지 태그 지정 (예: Docker Hub 사용)
docker tag bonanza-index/index-calculator:latest your-registry/bonanza-index/index-calculator:latest
docker push your-registry/bonanza-index/index-calculator:latest

# k3s 노드에서
sudo k3s ctr images pull your-registry/bonanza-index/index-calculator:latest
```

#### 이미지 로드 확인

```bash
# k3s에 로드된 이미지 목록 확인
sudo k3s ctr images list | grep bonanza-index

# 필요한 모든 이미지가 있는지 확인
# 이미지 로드 스크립트의 옵션 5를 사용하면 더 편리합니다
```

### 3. 배포 실행

#### 방법 1: 개별 배포

**k3s 환경에서 kubectl 사용 방법:**
- `kubectl` 명령어가 PATH에 있는 경우: `kubectl`
- k3s만 설치된 경우: `k3s kubectl` 또는 `sudo k3s kubectl`

```bash
# kubectl 명령어 확인 (k3s 환경)
if command -v kubectl &> /dev/null; then
    KUBECTL="kubectl"
else
    KUBECTL="k3s kubectl"
fi

# 네임스페이스 생성
$KUBECTL apply -f namespace.yaml

# MinIO 먼저 배포 (다른 서비스들이 의존)
# 주의: 호스트 경로 /home/dayfin/volume/minio가 존재하거나 생성 가능해야 합니다
$KUBECTL apply -f minio-deployment.yaml
$KUBECTL apply -f minio-service.yaml

# MinIO가 준비될 때까지 대기
$KUBECTL wait --for=condition=ready pod -l app=minio -n bonanza-index --timeout=120s

# MinIO 버킷 초기화
$KUBECTL apply -f minio-job-init-bucket.yaml

# Storage Workers 배포 (의존성 때문)
$KUBECTL apply -f orderbook-storage-worker-deployment.yaml
$KUBECTL apply -f orderbook-storage-worker-service.yaml
$KUBECTL apply -f ticker-storage-worker-deployment.yaml
$KUBECTL apply -f ticker-storage-worker-service.yaml

# Collectors 배포
$KUBECTL apply -f orderbook-collector-deployment.yaml
$KUBECTL apply -f orderbook-collector-service.yaml
$KUBECTL apply -f ticker-collector-deployment.yaml
$KUBECTL apply -f ticker-collector-service.yaml

# Calculator 및 Endpoint 배포
$KUBECTL apply -f index-calculator-deployment.yaml
$KUBECTL apply -f index-calculator-service.yaml
$KUBECTL apply -f index-endpoint-deployment.yaml
$KUBECTL apply -f index-endpoint-service.yaml

# Telegram Log 배포
$KUBECTL apply -f telegram-log-deployment.yaml
$KUBECTL apply -f telegram-log-service.yaml
```

#### 방법 2: 스크립트 사용 (권장)

메뉴 방식의 배포 스크립트를 사용할 수 있습니다:

```bash
cd k3s/scripts
chmod +x deploy.sh
./deploy.sh
```

또는 k3s 디렉토리에서:

```bash
cd k3s
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

스크립트를 실행하면 다음과 같은 메뉴가 표시됩니다:

```
==========================================
  Bonanza Index Kubernetes 배포
==========================================

배포할 항목을 선택하세요:

  1) minio
  2) orderbook-storage-worker
  3) ticker-storage-worker
  4) orderbook-collector
  5) ticker-collector
  6) index-calculator
  7) index-endpoint
  8) telegram-log
  9) 모든 서비스 배포 (All Services)
  0) 종료

선택 [0-9]:
```

옵션 9를 선택하면 모든 서비스가 의존성 순서에 맞게 자동으로 배포됩니다:
1. MinIO (다른 서비스들이 의존)
2. Telegram Log (collector들이 의존, 준비될 때까지 대기)
3. Storage Workers
4. Collectors (telegram-log가 준비된 후)
5. Calculator
6. Endpoint

#### 방법 3: kustomize 사용

```bash
# k3s 환경에 맞게 kubectl 명령어 사용
if command -v kubectl &> /dev/null; then
    kubectl apply -k .
else
    k3s kubectl apply -k .
fi
```

### 4. 배포 확인

#### 스크립트를 사용한 상태 확인 (권장)

메뉴 방식의 상태 확인 스크립트를 사용할 수 있습니다:

```bash
cd k3s/scripts
chmod +x status.sh
./status.sh
```

스크립트를 실행하면 다음과 같은 메뉴가 표시됩니다:

```
==========================================
  Bonanza Index 배포 상태 확인
==========================================

확인할 항목을 선택하세요:

  1) Pod 상태 (Pods)
  2) 서비스 상태 (Services)
  3) Deployment 상태 (Deployments)
  4) 전체 상태 요약 (Summary)
  5) 리소스 사용량 (Resource Usage)
  6) 이벤트 확인 (Events)
  7) 특정 Pod 로그 확인 (Logs)
  8) Pod 상세 정보 (Describe Pod)
  9) 네임스페이스 전체 상태 (All Resources)
  0) 종료

선택 [0-9]:
```

#### 수동으로 상태 확인

```bash
# kubectl 명령어 설정 (k3s 환경)
if command -v kubectl &> /dev/null; then
    KUBECTL="kubectl"
else
    KUBECTL="k3s kubectl"
fi

# Pod 상태 확인
$KUBECTL get pods -n bonanza-index

# 서비스 상태 확인
$KUBECTL get svc -n bonanza-index

# Deployment 상태 확인
$KUBECTL get deployments -n bonanza-index

# 로그 확인
$KUBECTL logs -f <pod-name> -n bonanza-index

# Pod 상세 정보 확인
$KUBECTL describe pod <pod-name> -n bonanza-index

# 이벤트 확인
$KUBECTL get events -n bonanza-index --sort-by='.lastTimestamp'
```

### 5. 실시간 로그 확인

#### 스크립트를 사용한 로그 확인 (권장)

각 서비스별로 실시간 로그를 확인할 수 있는 메뉴 방식의 스크립트를 사용할 수 있습니다:

```bash
cd k3s/scripts
chmod +x logs.sh
./logs.sh
```

스크립트를 실행하면 다음과 같은 메뉴가 표시됩니다:

```
==========================================
  Bonanza Index 실시간 로그 확인
==========================================

확인할 서비스를 선택하세요:

  1) orderbook-collector
  2) ticker-collector
  3) orderbook-storage-worker
  4) ticker-storage-worker
  5) index-calculator
  6) index-endpoint
  7) telegram-log
  8) index-calc-fe
  9) minio
 10) 모든 Pod 목록에서 선택
 11) 특정 Pod 이름으로 직접 확인
  0) 종료

선택 [0-11]:
```

**기능:**
- 각 서비스별로 바로 로그 확인 가능
- 실시간 로그 스트리밍 (`-f` 옵션)
- Pod 목록에서 선택하거나 직접 Pod 이름 입력 가능
- Ctrl+C로 종료 후 메뉴로 돌아감

#### 수동으로 로그 확인

```bash
# 특정 서비스의 Pod 로그 확인
$KUBECTL logs -f -l app=orderbook-collector -n bonanza-index --tail=100

# 특정 Pod의 로그 확인
$KUBECTL logs -f <pod-name> -n bonanza-index --tail=100

# 모든 Pod의 로그 확인
$KUBECTL logs -f --all-containers=true --all-namespaces
```

#### 이전 컨테이너 로그 확인 (재시작 전 로그)

컨테이너가 재시작된 경우, 재시작 전의 로그를 확인할 수 있습니다:

```bash
# 스크립트 사용 (권장)
cd k3s/scripts
./logs.sh
# 메뉴에서 "12) 이전 컨테이너 로그 확인" 선택

# 수동으로 확인
$KUBECTL logs <pod-name> -n bonanza-index --previous --tail=1000

# 특정 서비스의 이전 로그 확인
$KUBECTL logs -l app=index-calculator -n bonanza-index --previous --tail=1000
```

**참고:**
- `--previous` 옵션은 컨테이너가 재시작된 경우에만 사용 가능합니다
- 이전 컨테이너가 없는 경우 에러가 발생할 수 있습니다
- 로그는 Kubernetes에 일정 기간 보관되므로, 너무 오래된 로그는 확인할 수 없을 수 있습니다

## 서비스 포트

- **minio**: ClusterIP (API 포트: 9000, Console 포트: 9001)
- **index-calculator**: ClusterIP (HTTP 포트: 10201, ZMQ 포트: 6757) - 내부 통신용
- **index-endpoint**: LoadBalancer (HTTP 포트: 3009, ZMQ 포트: 7757) - 외부 API 접근용
- **index-calc-fe**: LoadBalancer (HTTP 포트: 80, NodePort: 30076) - 프론트엔드 웹 접근용
- **minio**: ClusterIP (API 포트: 9000, Console 포트: 9001) - 내부 통신용
- **minio-console-service**: LoadBalancer (Console 포트: 9001) - MinIO 관리자 콘솔 외부 접근용
- **orderbook-collector**: ClusterIP (HTTP 포트: 6001) - 리더 선출 모드 (replicas: 2)
- **orderbook-storage-worker**: ClusterIP (ZMQ 포트: 5557, 6557)
- **ticker-collector**: ClusterIP (HTTP 포트: 6002) - 리더 선출 모드 (replicas: 2)
- **ticker-storage-worker**: ClusterIP (ZMQ 포트: 5657, 6657)
- **telegram-log**: ClusterIP (HTTP 포트: 3109)

## 환경 변수

각 서비스의 환경 변수는 Deployment 파일에 하드코딩되어 있습니다. 
외부 서비스 (MySQL, QuestDB, Redis)는 IP 주소 10.40.100.21으로 설정되어 있습니다.

민감한 정보(비밀번호 등)는 현재 환경 변수로 직접 설정되어 있습니다. 
프로덕션 환경에서는 Kubernetes Secret을 사용하는 것을 권장합니다.

### 리더 선출 (Leader Election)

**orderbook-collector**와 **ticker-collector**는 리더 선출 모드로 배포됩니다:
- **Replicas**: 2개로 설정되어 있어 고가용성 제공
- **리더 선출 방식**: Redis 기반 분산 락 방식
- **동작 방식**: 여러 인스턴스 중 하나만 리더로 선출되어 실제 작업 수행 (ZMQ 전송 등)
- **리더십 키**: 
  - orderbook-collector: `orderbook-collector:leader`
  - ticker-collector: `ticker-collector:leader`
- **리더십 TTL**: 10초 (주기적으로 갱신)
- **장애 복구**: 리더가 다운되면 자동으로 다른 인스턴스가 리더가 됨

### MinIO 설정

- **Root User**: bonanza
- **Root Password**: 56tyghbn
- **Bucket**: bonanza-index
- **Region**: us-east-1
- **Storage**: HostPath (`/home/dayfin/volume/minio`)
- **API 포트**: 9000 (내부 통신용, ClusterIP)
- **Console 포트**: 9001 (관리자 콘솔, LoadBalancer로 외부 접근 가능)

**주의**: MinIO 배포 전에 호스트에 `/home/dayfin/volume/minio` 디렉토리가 존재하거나 생성 가능해야 합니다. k3s 노드에서 다음 명령으로 디렉토리를 생성할 수 있습니다:

```bash
sudo mkdir -p /home/dayfin/volume/minio
sudo chmod -R 777 /home/dayfin/volume/minio  # 필요시 권한 설정
```

#### MinIO 관리자 콘솔 접속

MinIO 관리자 콘솔은 `minio-console-service`를 통해 LoadBalancer 타입으로 외부에 노출됩니다:

```bash
# MinIO Console Service의 External IP 확인
kubectl get svc minio-console-service -n bonanza-index

# 또는 k3s 환경에서
k3s kubectl get svc minio-console-service -n bonanza-index
```

출력 예시:
```
NAME                     TYPE           CLUSTER-IP      EXTERNAL-IP     PORT(S)          AGE
minio-console-service    LoadBalancer   10.43.x.x       <pending>       9001:3xxxx/TCP   1m
```

k3s 환경에서는 `<pending>` 상태가 될 수 있습니다. 이 경우 노드의 IP 주소와 포트를 사용하여 접속할 수 있습니다:

```bash
# 노드 IP 확인
kubectl get nodes -o wide

# 콘솔 접속 URL
# http://<노드_IP>:<NodePort>
```

또는 port-forward를 사용하여 로컬에서 접속할 수 있습니다:

```bash
kubectl port-forward svc/minio-console-service 9001:9001 -n bonanza-index
# 브라우저에서 http://localhost:9001 접속
```

**로그인 정보:**
- Username: `bonanza`
- Password: `56tyghbn`

## 리소스 할당

서버 스펙에 맞춰 리소스가 최적화되어 있습니다:
- **CPU**: 2 코어
- **Memory**: 15GB

### CPU 할당 요약

| 서비스 | Replicas | CPU Requests (per pod) | CPU Limits (per pod) | 총 CPU Requests |
|--------|----------|----------------------|---------------------|----------------|
| minio | 1 | 150m | 500m | 150m |
| index-calculator | 1 | 200m | 500m | 200m |
| index-endpoint | 1 | 100m | 300m | 100m |
| orderbook-collector | 2 | 50m | 200m | 100m |
| orderbook-storage-worker | 1 | 200m | 500m | 200m |
| ticker-collector | 2 | 50m | 200m | 100m |
| ticker-storage-worker | 1 | 200m | 500m | 200m |
| telegram-log | 1 | 100m | 200m | 100m |
| **총계** | **10** | - | - | **1150m (1.15 CPU)** |

**참고**: 
- Collector들은 리더 선출 모드이므로 실제로는 리더만 활발히 작업합니다
- CPU requests 합계가 1.05 CPU로 2 CPU 코어의 절반 정도를 사용하므로 여유가 있습니다
- CPU limits는 burst 상황에 대비하여 설정되었습니다

### 메모리 할당 요약

| 서비스 | Replicas | Memory Requests (per pod) | Memory Limits (per pod) | 총 Memory Requests |
|--------|----------|--------------------------|------------------------|-------------------|
| minio | 1 | 512Mi | 2Gi | 512Mi |
| index-calculator | 1 | 256Mi | 1Gi | 256Mi |
| index-endpoint | 1 | 256Mi | 1Gi | 256Mi |
| orderbook-collector | 2 | 256Mi | 1Gi | 512Mi |
| orderbook-storage-worker | 1 | 512Mi | 2Gi | 512Mi |
| ticker-collector | 2 | 256Mi | 1Gi | 512Mi |
| ticker-storage-worker | 1 | 512Mi | 2Gi | 512Mi |
| telegram-log | 1 | 256Mi | 512Mi | 256Mi |
| **총계** | **10** | - | - | **3.31Gi** |

**참고**: 메모리 requests 합계가 약 3GB로 15GB 메모리의 약 20%를 사용하므로 충분한 여유가 있습니다.

### 5. 배포 삭제

#### 스크립트를 사용한 삭제 (권장)

메뉴 방식의 삭제 스크립트를 사용할 수 있습니다:

```bash
cd k3s/scripts
chmod +x undeploy.sh
./undeploy.sh
```

스크립트를 실행하면 다음과 같은 메뉴가 표시됩니다:

```
==========================================
  Bonanza Index 배포 삭제
==========================================

삭제할 항목을 선택하세요:

  1) telegram-log
  2) index-endpoint
  3) index-calculator
  4) ticker-collector
  5) orderbook-collector
  6) ticker-storage-worker
  7) orderbook-storage-worker
  8) minio
  9) 모든 서비스 삭제 (All Services)
  10) 네임스페이스 삭제 (Namespace - 모든 리소스 포함)
  0) 종료

선택 [0-10]:
```

#### 수동으로 삭제

```bash
# kubectl 명령어 설정 (k3s 환경)
if command -v kubectl &> /dev/null; then
    KUBECTL="kubectl"
else
    KUBECTL="k3s kubectl"
fi

# 개별 서비스 삭제
$KUBECTL delete deployment <service-name> -n bonanza-index
$KUBECTL delete service <service-name> -n bonanza-index

# 모든 서비스 삭제
$KUBECTL delete all --all -n bonanza-index

# 네임스페이스 삭제 (모든 리소스 포함)
$KUBECTL delete namespace bonanza-index
```

**주의**: 네임스페이스를 삭제하면 모든 리소스가 삭제됩니다. 신중하게 사용하세요.

## 트러블슈팅

### Pod가 시작되지 않는 경우

```bash
# Pod 이벤트 확인
kubectl describe pod <pod-name> -n bonanza-index

# 로그 확인
kubectl logs <pod-name> -n bonanza-index
```

### 서비스 간 통신 문제

- ZMQ 서비스 이름 확인 (예: `orderbook-storage-worker.bonanza-index.svc.cluster.local`)
- 네트워크 정책 확인
- 서비스 선택자(selector) 확인

### Telegram 서비스 연결 문제

Telegram 서비스 연결 타임아웃 오류가 발생하는 경우:

```bash
# 1. telegram-log Pod이 실행 중이고 Ready 상태인지 확인
kubectl get pods -n bonanza-index | grep telegram-log
# 출력 예시:
# NAME                            READY   STATUS    RESTARTS   AGE
# telegram-log-xxxxxxxxx-xxxxx    1/1     Running   0          5m

# 2. telegram-log 서비스가 생성되었는지 확인
kubectl get svc -n bonanza-index | grep telegram-log
# 출력 예시:
# NAME           TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
# telegram-log   ClusterIP   10.43.x.x       <none>        3109/TCP   5m

# 3. 서비스 엔드포인트 확인 (가장 중요!)
kubectl get endpoints -n bonanza-index telegram-log
# 출력 예시:
# NAME           ENDPOINTS         AGE
# telegram-log   10.42.x.x:3109    5m
# 만약 ENDPOINTS가 <none>이면 Pod이 ready 상태가 아닙니다

# 4. telegram-log Pod 로그 확인
kubectl logs -n bonanza-index -l app=telegram-log --tail=50

# 5. Pod 상세 상태 확인
kubectl describe pod -n bonanza-index -l app=telegram-log

# 6. 서비스 연결 테스트 (orderbook-collector Pod에서)
kubectl exec -n bonanza-index -it $(kubectl get pod -n bonanza-index -l app=orderbook-collector -o jsonpath='{.items[0].metadata.name}') -- wget -O- --timeout=5 http://telegram-log.bonanza-index.svc.cluster.local:3109/health 2>&1 || echo "연결 실패"

# 또는 curl 사용 (Pod에 curl이 설치된 경우)
kubectl exec -n bonanza-index -it $(kubectl get pod -n bonanza-index -l app=orderbook-collector -o jsonpath='{.items[0].metadata.name}') -- curl -v --max-time 5 http://telegram-log.bonanza-index.svc.cluster.local:3109/health 2>&1 || echo "연결 실패"
```

**일반적인 원인:**
- telegram-log Pod이 실행되지 않음 또는 CrashLoopBackOff 상태
- telegram-log Pod이 Ready 상태가 아님 (엔드포인트가 없음)
- 네트워크 정책에 의해 연결이 차단됨
- telegram-log 서비스가 제대로 생성되지 않음
- 이미지가 로드되지 않음 (ImagePullBackOff)

**참고:** 
- Telegram 서비스는 선택적 서비스이며, 연결에 실패해도 collector 서비스는 계속 작동합니다 ("continuing anyway" 메시지).
- 연결 테스트가 성공했다면 서비스는 정상 작동 중입니다.
- 타임아웃 오류가 간헐적으로 발생할 수 있으나, Telegram 서비스 자체는 정상입니다 (3초 타임아웃 내에 응답하지 못하는 경우).
- 이는 일시적인 네트워크 지연이거나 서비스 부하 때문일 수 있으며, collector 서비스 동작에는 영향을 주지 않습니다.

**타임아웃 오류가 계속 발생하는 경우:**

Pod과 서비스가 모두 정상이라면, 실제 연결을 테스트해보세요:

```bash
# orderbook-collector Pod 이름 확인
kubectl get pods -n bonanza-index -l app=orderbook-collector -o name | head -1

# Pod 내부에서 telegram-log 서비스 연결 테스트
kubectl exec -n bonanza-index -it <orderbook-collector-pod-name> -- wget -O- --timeout=5 http://telegram-log.bonanza-index.svc.cluster.local:3109/health

# 또는 curl 사용
kubectl exec -n bonanza-index -it <orderbook-collector-pod-name> -- curl -v --max-time 5 http://telegram-log.bonanza-index.svc.cluster.local:3109/health
```

연결이 성공하면 서비스는 정상 작동 중입니다. 타임아웃 오류는 일시적인 네트워크 문제일 수 있으며, collector 서비스 자체는 정상 작동합니다.

### ImagePullBackOff 오류 (이미지를 찾을 수 없는 경우)

Pod이 `ImagePullBackOff` 상태인 경우, 이미지가 k3s 노드에 로드되지 않았습니다.

#### 빠른 해결 방법

**이미지 로드 스크립트 사용 (가장 편리):**

```bash
cd k3s/scripts
chmod +x load-images.sh
./load-images.sh
# 메뉴에서 옵션 3 선택 (Docker에서 직접 로드)
```

#### 상세 해결 방법

**방법 1: 이미지 로드 스크립트 사용**

```bash
cd k3s/scripts
chmod +x load-images.sh
./load-images.sh
```

**방법 2: 수동으로 이미지 로드**

```bash
# Docker에 있는 이미지를 k3s에 직접 로드
docker save bonanza-index/index-calculator:latest | sudo k3s ctr images import -
docker save bonanza-index/index-endpoint:latest | sudo k3s ctr images import -
docker save bonanza-index/orderbook-collector:latest | sudo k3s ctr images import -
docker save bonanza-index/ticker-collector:latest | sudo k3s ctr images import -
docker save bonanza-index/orderbook-storage-worker:latest | sudo k3s ctr images import -
docker save bonanza-index/ticker-storage-worker:latest | sudo k3s ctr images import -
docker save bonanza-index/telegram-log:latest | sudo k3s ctr images import -

# 로드 확인
sudo k3s ctr images list | grep bonanza-index

# Pod 상태 확인 (자동으로 재시도됨)
kubectl get pods -n bonanza-index
```

**방법 3: tar 파일로 저장 후 로드**

```bash
# 로컬에서 이미지를 tar 파일로 저장
docker save bonanza-index/index-calculator:latest | gzip > index-calculator.tar.gz

# 서버로 전송
scp index-calculator.tar.gz user@server:/tmp/

# 서버에서 로드
gunzip -c /tmp/index-calculator.tar.gz | sudo k3s ctr images import -
```

