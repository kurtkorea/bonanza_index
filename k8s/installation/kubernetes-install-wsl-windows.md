# Kubernetes 설치 가이드 - Windows WSL (워커 노드)

이 문서는 **Windows WSL2 환경**에 Kubernetes를 설치하는 방법을 설명합니다.

## 📋 사전 요구사항

### WSL2 확인 및 설치

#### 1. WSL2 설치 확인

```powershell
# PowerShell (관리자 권한)에서 실행
wsl --list --verbose

# WSL2가 설치되어 있는지 확인
# VERSION이 2로 표시되어야 합니다
```

#### 2. WSL2 설치 (없는 경우)

```powershell
# PowerShell (관리자 권한)에서 실행

# WSL 기능 활성화
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# 재부팅 후 WSL2 커널 업데이트 다운로드
# https://aka.ms/wsl2kernel 에서 다운로드 및 설치

# 기본 WSL 버전을 2로 설정
wsl --set-default-version 2

# Ubuntu 설치 (Microsoft Store에서)
# 또는 수동 설치
wsl --install -d Ubuntu-22.04
```

#### 3. WSL2 리소스 할당 설정

WSL2의 메모리와 CPU를 제한하려면 `%USERPROFILE%\.wslconfig` 파일을 생성/수정:

```ini
# C:\Users\<사용자명>\.wslconfig
[wsl2]
memory=8GB        # 최소 4GB 권장 (8GB 이상 권장)
processors=4      # CPU 코어 수 (2개 이상 권장)
swap=4GB          # 스왑 메모리
localhostForwarding=true
```

변경 후 WSL 재시작:

```powershell
# PowerShell에서 실행
wsl --shutdown
wsl
```

### WSL2 내부 설정

```bash
# WSL2 Ubuntu 터미널에서 실행

# 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# 필수 패키지 설치
sudo apt install -y curl wget git vim

# 시간 동기화 확인 (WSL2에서는 자동으로 동기화됨)
# WSL2는 Windows 시스템 시간을 자동으로 사용하므로 별도 설정 불필요
date
# 시간이 정확하지 않은 경우:
# - Windows 시간을 확인하고 동기화
# - WSL2 재시작: wsl --shutdown 후 다시 시작
```

## 🎯 설치 옵션

### 옵션 1: k3s Agent (워커 노드로 조인) - 권장 ⭐

Windows WSL를 워커 노드로 사용하여 Linux 마스터 노드에 조인합니다.

#### 1.1 마스터 노드에서 토큰 확인

```bash
# Linux 마스터 노드 (121.88.4.53)에서 실행
sudo cat /var/lib/rancher/k3s/server/node-token

# 출력 예시:
# K108ff12bdcf17f46fc62a0afeb3d4f26bf92b8b309d4f64f7e517c2696bceac5d2::server:821ba06dd321d42a7a85764f365bb5a4
```

#### 1.2 WSL2에서 k3s Agent 설치

```bash
# WSL2 Ubuntu 터미널에서 실행

# 호스트명 설정 (필수 - sudo 오류 방지)
sudo hostnamectl set-hostname bonanza-worker
sudo bash -c 'echo "127.0.0.1 bonanza-worker" >> /etc/hosts'

# 환경 변수 설정 (마스터 노드 정보)
export K3S_TOKEN=K103fb127f89a3ad2d513b33b3875a6634518785b3214e44815bb31b1542e4a001b::server:2f77d67023e56c496dcacea95e51175b
export K3S_URL="https://localhost:6443"  # 마스터 노드 IP

# k3s Agent 설치 및 마스터에 조인 (노드 이름: bonanza-worker)
# 참고: WSL2에서는 내부 IP를 자동으로 사용하며, 외부 IP는 별도로 지정 가능
# --node-external-ip를 사용하여 외부 IP를 지정할 수 있지만, 
# 네트워크 인터페이스에 없는 IP는 설정하지 않습니다
curl -sfL https://get.k3s.io | K3S_TOKEN=$K3S_TOKEN K3S_URL=$K3S_URL INSTALL_K3S_EXEC="--with-node-id --node-name bonanza-worker" sh -

# 설치 확인
sudo systemctl status k3s-agent

# 참고: k3s agent 모드에서는 서비스 이름이 k3s-agent입니다
# k3s.service가 아니라 k3s-agent.service를 사용해야 합니다

# 서비스가 자동으로 시작되지 않은 경우 수동 시작
sudo systemctl start k3s-agent
sudo systemctl enable k3s-agent

# 서비스 상태 확인
sudo systemctl status k3s-agent

# 로그 확인
sudo journalctl -u k3s-agent -f
```

#### 1.3 kubeconfig 설정

k3s agent 모드에서는 마스터 노드의 kubeconfig를 사용해야 합니다.

```bash
# 마스터 노드에서 kubeconfig 복사
# 방법 1: SCP 사용 (권장)
mkdir -p ~/.kube
scp -P 22222 bonanza@121.88.4.53:/home/bonanza/.kube/config ~/.kube/config

# 방법 2: 수동 복사
# 마스터 노드에서:
# cat ~/.kube/config
# WSL2에서 ~/.kube/config 파일 생성 후 내용 붙여넣기

# 권한 설정
chmod 600 ~/.kube/config

# kubeconfig 파일 확인
kubectl config view

# kubectl 테스트
kubectl get nodes
```

**참고**: k3s agent 모드에서는 `/etc/rancher/k3s/k3s.yaml` 파일이 없거나 권한이 없을 수 있습니다. 
마스터 노드의 kubeconfig를 사용하는 것이 정상입니다.

#### 1.4 containerd 소켓 경로 확인 (이미지 로드 시 필요)

```bash
# k3s agent가 사용하는 containerd 소켓 찾기
sudo find /run /var/run -name "containerd.sock" 2>/dev/null

[bonanza@BONANZA-APP~/.kube]$ sudo find /run /var/run -name "containerd.sock" 2>/dev/null
/run/k3s/containerd/containerd.sock


# 일반적인 경로:
# /run/k3s/containerd/containerd.sock (k3s agent 모드)
# /run/containerd/containerd.sock
# /var/run/containerd/containerd.sock

# 이미지 로드 시 사용
sudo ctr --address /run/k3s/containerd/containerd.sock -n k8s.io images import <image-file>
# 또는
sudo ctr --address /run/containerd/containerd.sock -n k8s.io images import <image-file>
```

### 옵션 2: k3s Server (독립 클러스터)

Windows WSL에 독립적인 단일 노드 클러스터를 설치합니다.

#### 2.1 k3s Server 설치

```bash
# WSL2 Ubuntu 터미널에서 실행

# k3s Server 설치
curl -sfL https://get.k3s.io | sh -

# 설치 확인
sudo k3s kubectl get nodes

# kubeconfig 설정
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config
chmod 600 ~/.kube/config

# kubectl 별칭 설정
echo 'alias kubectl="k3s kubectl"' >> ~/.bashrc
source ~/.bashrc

# 서비스 상태 확인
sudo systemctl status k3s
sudo systemctl enable k3s
```

#### 2.2 클러스터 확인

```bash
# 클러스터 정보
kubectl cluster-info

# 노드 확인
kubectl get nodes

# 모든 리소스 확인
kubectl get all --all-namespaces
```

### 옵션 3: kind (Kubernetes in Docker) - 개발/테스트용

로컬 개발 및 테스트용으로 사용합니다. 프로덕션에는 권장하지 않습니다.

#### 3.1 Docker 설치

```bash
# Docker 설치 (Docker Desktop for Windows 사용 권장)
# 또는 WSL2 내부에 Docker 설치

# Docker Desktop이 설치되어 있다면 WSL2 통합 활성화
# Docker Desktop 설정 > Resources > WSL Integration > Ubuntu 활성화

# Docker 설치 확인
docker --version
docker ps
```

#### 3.2 kind 설치 및 클러스터 생성

```bash
# kind 설치
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# kubectl 설치
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

# 클러스터 생성
kind create cluster --name bonanza-index

# 클러스터 확인
kubectl cluster-info --context kind-bonanza-index
kubectl get nodes
```

### 옵션 4: Docker Desktop Kubernetes

Windows Docker Desktop의 내장 Kubernetes를 사용합니다.

#### 4.1 Docker Desktop 설정

1. Docker Desktop 실행
2. Settings > Kubernetes
3. "Enable Kubernetes" 체크
4. "Apply & Restart" 클릭

#### 4.2 kubectl 설정

```bash
# WSL2에서 kubectl 사용
# Docker Desktop이 자동으로 kubeconfig를 설정합니다

# kubectl 설치 (아직 없다면)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

# kubeconfig 확인
kubectl config get-contexts

# 클러스터 확인
kubectl cluster-info
kubectl get nodes
```

## 🔧 설치 후 설정

### 1. 워커 노드 라벨 추가

#### 왜 app-server 라벨이 필요한가?

`app-server=true` 라벨은 **애플리케이션 Pod가 워커 노드에만 스케줄링되도록** 하기 위해 필요합니다.

**노드 분리 전략:**
- **마스터 노드** (`node-role.kubernetes.io/control-plane=true`): 
  - QuestDB, Redis, MariaDB, Nginx만 실행
  - 데이터베이스와 인프라 서비스 전용
- **워커 노드** (`app-server=true`): 
  - 모든 애플리케이션 Pod 실행 (index-endpoint, index-calculator, orderbook-collector, ticker-collector 등)
  - 애플리케이션 서비스 전용

**애플리케이션 Deployment 파일에서 nodeSelector 사용:**
```yaml
# 예: index-endpoint/deployment.yaml
spec:
  template:
    spec:
      nodeSelector:
        app-server: "true"  # 이 라벨이 있는 노드에만 Pod 스케줄링
```

**라벨이 없으면:**
- 애플리케이션 Pod가 스케줄링되지 않음 (Pending 상태)
- `kubectl describe pod`에서 "No nodes available" 오류 발생

```bash
# 노드 이름 확인
kubectl get nodes

# 워커 노드에 app-server 라벨 추가
# 노드 이름은 실제 값으로 변경 (예: bonanza-app-wsl)
kubectl label nodes bonanza-app-wsl app-server=true --overwrite

# 또는 IP 주소로 노드 찾기
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}{end}' | grep 218.145.67.182

# 워커 노드 IP로 라벨 추가 (자동)
WORKER_NODE=$(kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}{end}' | grep 218.145.67.182 | cut -f1)
kubectl label nodes $WORKER_NODE app-server=true --overwrite

# 라벨 확인
kubectl get nodes --show-labels | grep app-server

# 모든 노드 라벨 확인
kubectl get nodes --show-labels
```

### 2. 노드 간 네트워크 확인

```bash
# 마스터 노드에서 워커 노드 접근 확인
ping <워커-노드-IP>

# 워커 노드에서 마스터 노드 접근 확인
ping localhost

# 포트 확인 (6443: Kubernetes API)
telnet localhost 6443
```

### 3. 방화벽 설정 (Windows 방화벽)

```powershell
# PowerShell (관리자 권한)에서 실행

# WSL2 네트워크 프로파일 확인
Get-NetFirewallProfile

# Kubernetes API 포트 열기 (필요한 경우)
New-NetFirewallRule -DisplayName "Kubernetes API" -Direction Inbound -Protocol TCP -LocalPort 6443 -Action Allow
```

## 🔍 설치 확인

### 1. 클러스터 상태 확인

```bash
# 클러스터 정보
kubectl cluster-info

# 노드 상태
kubectl get nodes -o wide

# 모든 노드가 Ready 상태인지 확인
kubectl get nodes

# 노드 라벨 확인
kubectl get nodes --show-labels
```

### 2. Pod 스케줄링 테스트

```bash
# 테스트 Pod 생성
kubectl run test-pod --image=nginx:alpine -n default

# Pod 상태 확인
kubectl get pods -o wide

# Pod가 워커 노드에 스케줄링되었는지 확인
kubectl get pods -o wide | grep <node-name>

# 테스트 Pod 삭제
kubectl delete pod test-pod
```

### 3. containerd 이미지 확인

```bash
# containerd 소켓 경로 찾기
sudo find /run /var/run -name "containerd.sock" 2>/dev/null

# 이미지 목록 확인
sudo ctr --address /run/containerd/containerd.sock -n k8s.io images list

# 또는 k3s를 사용하는 경우
sudo ctr -n k8s.io images list
```

## 🐛 문제 해결

### 1. k3s Agent가 마스터에 조인 실패

```bash
# 서비스 상태 및 오류 로그 확인
sudo systemctl status k3s.service
sudo journalctl -xeu k3s.service -n 50

# 마스터 노드 IP 및 포트 확인
ping 121.88.4.53
telnet 121.88.4.53 6443
# 또는
curl -k https://121.88.4.53:6443

# 토큰 재확인
# 마스터 노드에서:
sudo cat /var/lib/rancher/k3s/server/node-token

# 환경 변수 확인
echo $K3S_TOKEN
echo $K3S_URL

# k3s 서비스 재시작
sudo systemctl restart k3s
sudo journalctl -u k3s -f

# k3s 서비스 제거 후 재설치 (필요한 경우)
sudo /usr/local/bin/k3s-uninstall.sh
# 환경 변수 다시 설정 후 재설치
export K3S_TOKEN="<토큰>"
export K3S_URL="https://121.88.4.53:6443"
curl -sfL https://get.k3s.io | K3S_TOKEN=$K3S_TOKEN K3S_URL=$K3S_URL sh -
```

### 1.1 k3s 서비스 시작 실패 (Job for k3s.service failed)

```bash
# 상세 오류 로그 확인
sudo journalctl -xeu k3s.service -n 100

# 일반적인 원인 및 해결:

# 1. iptables 도구 누락 (경고이지만 문제가 될 수 있음)
sudo apt install -y iptables

# 2. 마스터 노드 접근 불가
# 네트워크 연결 확인
ping 121.88.4.53
curl -k https://121.88.4.53:6443

# 3. 토큰 또는 URL 오류
# 환경 변수 확인
env | grep K3S

# 4. k3s 서비스 설정 확인
sudo cat /etc/systemd/system/k3s.service
sudo cat /etc/systemd/system/k3s.service.env

# 5. k3s가 서버 모드로 실행되는 경우 (agent가 아님)
# 로그에서 "k3s-server-ca" 또는 "sqlite3" 메시지가 보이면 서버 모드로 실행 중
# 완전히 제거 후 환경 변수와 함께 재설치 필요
sudo /usr/local/bin/k3s-uninstall.sh
export K3S_TOKEN="<토큰>"
export K3S_URL="https://121.88.4.53:6443"
curl -sfL https://get.k3s.io | K3S_TOKEN=$K3S_TOKEN K3S_URL=$K3S_URL sh -
```

### 1.2 k3s가 서버 모드로 실행되는 문제 (Agent 모드가 아닌 경우)

로그에서 "k3s-server-ca", "sqlite3 database", "Kine available" 등의 메시지가 보이면 서버 모드로 실행되고 있습니다.

```bash
# 1. k3s 서비스 중지 및 제거
sudo systemctl stop k3s
sudo /usr/local/bin/k3s-uninstall.sh

# 2. 환경 변수 확인 (반드시 설정되어 있어야 함)
export K3S_TOKEN="K103fb127f89a3ad2d513b33b3875a6634518785b3214e44815bb31b1542e4a001b::server:2f77d67023e56c496dcacea95e51175b"
export K3S_URL="https://121.88.4.53:6443"

# 환경 변수 확인
echo "K3S_TOKEN=$K3S_TOKEN"
echo "K3S_URL=$K3S_URL"

# 3. Agent 모드로 재설치 (환경 변수와 함께)
curl -sfL https://get.k3s.io | K3S_TOKEN=$K3S_TOKEN K3S_URL=$K3S_URL sh -

export K3S_TOKEN="K103fb127f89a3ad2d513b33b3875a6634518785b3214e44815bb31b1542e4a001b::server:2f77d67023e56c496dcacea95e51175b"
export K3S_URL="https://121.88.4.53:6443"
curl -sfL https://get.k3s.io | K3S_TOKEN=$K3S_TOKEN K3S_URL=$K3S_URL INSTALL_K3S_EXEC="--with-node-id" sh -


# 4. 서비스 시작 (자동 시작되지 않은 경우)
sudo systemctl start k3s-agent
sudo systemctl enable k3s-agent

# 5. 서비스 상태 확인 (agent 모드로 실행되는지 확인)
sudo systemctl status k3s-agent
sudo journalctl -u k3s-agent -f

# 6. 서비스 파일 확인 (agent 모드인지 확인)
sudo cat /etc/systemd/system/k3s-agent.service
# agent 모드인 경우 k3s-agent.service 파일이 생성되고, ExecStart에 --agent 옵션이 있어야 함
```

### 1.3 노드 호스트명 중복 또는 패스워드 오류

로그에 "Node password rejected, duplicate hostname" 오류가 나타나는 경우:

```bash
# 1. k3s-agent 서비스 중지 및 제거
sudo systemctl stop k3s-agent
sudo /usr/local/bin/k3s-agent-uninstall.sh

# 2. 기존 노드 데이터 제거
sudo rm -rf /var/lib/rancher/k3s/agent
sudo rm -rf /etc/rancher/node

# 3. 고유한 노드 ID로 재설치 (권장)
export K3S_TOKEN="K103fb127f89a3ad2d513b33b3875a6634518785b3214e44815bb31b1542e4a001b::server:2f77d67023e56c496dcacea95e51175b"
export K3S_URL="https://121.88.4.53:6443"
curl -sfL https://get.k3s.io | K3S_TOKEN=$K3S_TOKEN K3S_URL=$K3S_URL INSTALL_K3S_EXEC="--with-node-id" sh -

# 4. 또는 호스트명을 변경하여 재설치
export K3S_TOKEN="<토큰>"
export K3S_URL="https://121.88.4.53:6443"
curl -sfL https://get.k3s.io | K3S_TOKEN=$K3S_TOKEN K3S_URL=$K3S_URL INSTALL_K3S_EXEC="--node-name bonanza-app-wsl" sh -

# 5. 서비스 시작
sudo systemctl start k3s-agent
sudo systemctl enable k3s-agent

# 6. 로그 확인
sudo journalctl -u k3s-agent -f
```

### 2. containerd 소켓을 찾을 수 없음

```bash
# 소켓 경로 찾기
sudo find /run /var/run -name "containerd.sock" 2>/dev/null

# k3s 서비스 상태 확인
sudo systemctl status k3s
sudo systemctl status k3s-agent

# 소켓 경로를 명시적으로 지정
sudo ctr --address /run/containerd/containerd.sock -n k8s.io images list
```

### 3. WSL2 메모리 부족

```powershell
# PowerShell에서 .wslconfig 수정
notepad $env:USERPROFILE\.wslconfig

# 메모리 증가 후 WSL 재시작
wsl --shutdown
wsl
```

### 4. 네트워크 연결 문제

```bash
# WSL2 네트워크 확인
ip addr show

# DNS 확인
cat /etc/resolv.conf

# 마스터 노드 연결 테스트
ping 121.88.4.53
curl -k https://121.88.4.53:6443
```

### 5. kubectl 권한 오류

```bash
# kubeconfig 파일 권한 확인
ls -la ~/.kube/config

# 권한 수정
chmod 600 ~/.kube/config

# kubeconfig 내용 확인
kubectl config view

# k3s agent 모드에서 /etc/rancher/k3s/k3s.yaml 권한 오류가 발생하는 경우
# 이는 정상입니다. agent 모드는 마스터 노드의 kubeconfig를 사용해야 합니다.
# 마스터 노드에서 kubeconfig를 복사하여 ~/.kube/config에 저장하세요.

# 마스터 노드에서 kubeconfig 복사
scp -P 22222 bonanza@121.88.4.53:/home/bonanza/.kube/config ~/.kube/config
chmod 600 ~/.kube/config

# 또는 KUBECONFIG 환경 변수 설정
export KUBECONFIG=~/.kube/config
```

### 6. TLS 인증서 오류 (x509: certificate signed by unknown authority)

마스터 노드를 재설치하거나 변경한 경우 인증서가 새로 생성되어 kubeconfig가 무효화될 수 있습니다.

```bash
# 1. 기존 kubeconfig 백업 (선택사항)
cp ~/.kube/config ~/.kube/config.backup

# 2. 마스터 노드에서 최신 kubeconfig 복사
scp -P 22222 bonanza@121.88.4.53:/home/bonanza/.kube/config ~/.kube/config

# 3. 권한 설정
chmod 600 ~/.kube/config

# 4. kubeconfig 확인
kubectl config view

# 5. 연결 테스트
kubectl get nodes

# 6. 여전히 오류가 발생하는 경우 마스터 노드에서 kubeconfig 확인
# 마스터 노드에서 실행:
# sudo cat /etc/rancher/k3s/k3s.yaml
# 또는
# cat ~/.kube/config

# 7. 마스터 노드의 kubeconfig 권한 확인 및 수정 (필요한 경우)
# 마스터 노드에서:
# sudo chmod 644 /etc/rancher/k3s/k3s.yaml
# sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
# sudo chown $USER:$USER ~/.kube/config
```

## 📋 설치 체크리스트

- [ ] WSL2 설치 및 버전 확인
- [ ] WSL2 리소스 할당 설정 (.wslconfig)
- [ ] 시스템 업데이트 완료
- [ ] k3s Agent 설치 완료
- [ ] 마스터 노드 조인 성공
- [ ] kubeconfig 설정 완료
- [ ] kubectl 명령어 작동 확인
- [ ] 워커 노드 라벨 추가 (app-server=true)
- [ ] 노드 상태 Ready 확인
- [ ] containerd 소켓 경로 확인

## 🔗 다음 단계

Kubernetes 설치가 완료되면:

1. **[노드 설정](../../node-setup.md)**: 워커 노드 라벨 추가
2. **[배포 가이드](../../README.md)**: Bonanza Index 애플리케이션 배포
3. **[이미지 로드](../../scripts/load-missing-images.sh)**: 커스텀 이미지 로드

## ⚠️ 주의사항

1. **리소스**: WSL2의 경우 충분한 메모리(최소 4GB, 권장 8GB)와 CPU를 할당해야 합니다.
2. **네트워크**: 마스터-워커 통신을 위해 양방향 네트워크 연결이 필요합니다.
3. **방화벽**: Windows 방화벽과 WSL2 네트워크 설정을 확인해야 합니다.
4. **버전**: 마스터와 워커의 Kubernetes 버전이 호환되어야 합니다.
5. **재시작**: Windows 재시작 후 WSL2가 자동으로 시작되도록 설정하는 것을 권장합니다.

## 📚 참고 자료

- [k3s 공식 문서](https://k3s.io/)
- [WSL2 공식 문서](https://docs.microsoft.com/windows/wsl/)
- [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)
- [kind 공식 문서](https://kind.sigs.k8s.io/)

