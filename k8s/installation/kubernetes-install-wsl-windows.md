# Kubernetes 설치 가이드 - WSL Windows (121.88.4.57)

이 문서는 **WSL 기반 Windows 서버 (121.88.4.57)**에 Kubernetes를 설치하는 방법을 설명합니다.

## 📋 사전 요구사항

- Windows 10/11 (WSL2 지원)
- WSL2 설치 완료
- Ubuntu 또는 Debian 배포판 (WSL2)
- 최소 4GB RAM 할당 (WSL2)
- 2개 이상의 CPU 코어 할당

## 🎯 설치 옵션

### 옵션 1: k3s in WSL2 (권장) ⭐

WSL2 내에서 직접 k3s를 설치하는 방법입니다. 가장 간단하고 안정적입니다.

#### 1.1 WSL2 환경 확인

```bash
# WSL2 터미널에서 실행 (Ubuntu)
# WSL 버전 확인
wsl --version

# WSL2 확인
wsl -l -v

# Linux 버전 확인
uname -a  # Linux 5.10+ 확인
cat /etc/os-release
```

#### 1.2 WSL2 리소스 설정 (Windows PowerShell 관리자 권한)

```powershell
# WSL2 설정 파일 생성/수정
notepad $env:USERPROFILE\.wslconfig
```

`.wslconfig` 파일 내용:
```ini
[wsl2]
memory=8GB          # 메모리 할당 (권장: 8GB+)
processors=4        # CPU 코어 수
swap=2GB            # 스왑 메모리
localhostForwarding=true
```

변경 후 WSL2 재시작:
```powershell
wsl --shutdown
# WSL2 다시 시작
```

#### 1.3 k3s 설치

**시나리오 A: 마스터 노드에 조인 (워커 노드)**

```bash
# WSL2 터미널에서 실행
# Linux 마스터 노드에서 토큰 확인 (마스터 노드에서)
# sudo cat /var/lib/rancher/k3s/server/node-token

# 토큰과 마스터 URL 설정
export K3S_TOKEN="K108ff12bdcf17f46fc62a0afeb3d4f26bf92b8b309d4f64f7e517c2696bceac5d2::server:821ba06dd321d42a7a85764f365bb5a4"
export K3S_URL="https://121.88.4.81:6443"

# k3s 설치 및 마스터에 조인
curl -sfL https://get.k3s.io | K3S_TOKEN=$K3S_TOKEN K3S_URL=$K3S_URL sh -

# kubeconfig 설정
mkdir -p ~/.kube

# 방법 1: scp로 마스터 노드에서 복사
scp bonanza@121.88.4.81:~/.kube/config ~/.kube/config

# 방법 2: 마스터 노드에서 직접 복사 (마스터 노드에서 실행)
# scp ~/.kube/config admin_star@121.88.4.57:~/.kube/config

# 방법 3: 수동 복사 (마스터 노드의 ~/.kube/config 내용을 복사하여 붙여넣기)
# nano ~/.kube/config

# kubeconfig 권한 확인
chmod 600 ~/.kube/config

# kubectl 테스트
kubectl get nodes
```

**시나리오 B: 독립 단일 노드 클러스터**

```bash
# k3s 단일 노드 클러스터 설치
curl -sfL https://get.k3s.io | sh -

# kubeconfig 설정
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config

# kubectl 별칭 설정
echo 'alias kubectl="k3s kubectl"' >> ~/.bashrc
source ~/.bashrc
```

#### 1.4 k3s 서비스 확인

```bash
# 서비스 상태 확인
sudo systemctl status k3s

# 클러스터 확인
kubectl get nodes
kubectl cluster-info
```

### 옵션 2: Docker Desktop with Kubernetes

#### 2.1 Docker Desktop 설치

```powershell
# Windows PowerShell에서 실행
# 1. Docker Desktop 다운로드 및 설치
# https://www.docker.com/products/docker-desktop

# 2. Docker Desktop 실행 후 설정:
# - Settings > Kubernetes > Enable Kubernetes 체크
# - Settings > Resources > WSL Integration > Enable integration with my default WSL distro
```

#### 2.2 WSL2에서 확인

```bash
# WSL2 터미널에서
docker --version
kubectl version --client

# Kubernetes 활성화 확인
kubectl cluster-info
kubectl get nodes
```

### 옵션 3: MicroK8s in WSL2

#### 3.1 MicroK8s 설치

```bash
# snap 설치 (WSL2 Ubuntu)
sudo apt-get update
sudo apt-get install -y snapd
sudo systemctl enable snapd
sudo systemctl start snapd

# MicroK8s 설치
sudo snap install microk8s --classic

# 그룹 추가
sudo usermod -a -G microk8s $USER
newgrp microk8s

# 필수 애드온 활성화
microk8s enable dns storage ingress

# kubectl 별칭
echo "alias kubectl='microk8s kubectl'" >> ~/.bashrc
source ~/.bashrc

# 상태 확인
microk8s status
```

### 옵션 4: kind (Kubernetes in Docker)

개발/테스트 환경에 적합합니다.

```bash
# Docker 설치 (WSL2)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Docker 서비스 시작
sudo service docker start

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

## 🔧 Windows WSL2 리소스 설정

### WSL2 메모리/CPU 할당 증가

```powershell
# Windows PowerShell에서 실행 (관리자 권한)
# WSL2 설정 파일 생성/수정
notepad $env:USERPROFILE\.wslconfig
```

`.wslconfig` 파일 내용:
```ini
[wsl2]
memory=8GB          # 메모리 할당 (권장: 8GB+, 데이터베이스 Pod를 실행하지 않으므로 4GB+도 가능)
processors=4        # CPU 코어 수
swap=2GB            # 스왑 메모리
localhostForwarding=true
```

변경 후 WSL2 재시작:
```powershell
wsl --shutdown
# WSL2 다시 시작
```

## 🔍 설치 확인

```bash
# WSL2 터미널에서
kubectl version --client --server
kubectl get nodes
kubectl cluster-info
kubectl get pods --all-namespaces

# 노드 라벨 확인
kubectl get nodes --show-labels
```

## 🔗 마스터 노드 연결 (Linux 마스터 노드와 통합)

### k3s 클러스터 조인 (Linux 마스터 노드에)

#### 1단계: Linux 마스터 노드에서 토큰 확인

```bash
# Linux 서버 (121.88.4.81)에서:
sudo cat /var/lib/rancher/k3s/server/node-token
```

#### 2단계: WSL2에서 워커로 조인

```bash
# WSL2 터미널에서:
export K3S_TOKEN="K108ff12bdcf17f46fc62a0afeb3d4f26bf92b8b309d4f64f7e517c2696bceac5d2::server:821ba06dd321d42a7a85764f365bb5a4"
export K3S_URL="https://121.88.4.81:6443"
curl -sfL https://get.k3s.io | K3S_TOKEN=$K3S_TOKEN K3S_URL=$K3S_URL sh -

# kubeconfig 복사
scp user@121.88.4.81:~/.kube/config ~/.kube/config
# 또는
# 마스터 노드의 ~/.kube/config 내용을 복사하여
# WSL2의 ~/.kube/config 파일에 붙여넣기
```

#### 3단계: 연결 확인

```bash
# 노드 확인
kubectl get nodes

# 마스터와 워커 모두 표시되어야 합니다
# 예:
# NAME           STATUS   ROLES                  AGE   VERSION
# master-node    Ready    control-plane,master   1d    v1.28.0
# wsl-worker     Ready    <none>                1h    v1.28.0
```

## 🏷️ 워커 노드 라벨 추가

```bash
# 워커 노드 이름 확인
kubectl get nodes

# 워커 노드에 라벨 추가
kubectl label nodes <워커-노드-이름> app-server=true

# 라벨 확인
kubectl get nodes --show-labels | grep app-server
```

## 🐛 문제 해결

### WSL2에서 k3s-agent가 시작되지 않는 경우

#### 1단계: 에러 로그 확인

```bash
# k3s-agent 서비스 에러 로그 확인
sudo journalctl -xeu k3s-agent.service -n 100

# 또는 최근 로그만 확인
sudo journalctl -u k3s-agent.service -n 50 --no-pager
```

#### 2단계: systemd 활성화 확인 (WSL2)

WSL2에서는 기본적으로 systemd가 비활성화되어 있을 수 있습니다:

```bash
# systemd 상태 확인
systemctl status

# systemd가 작동하지 않으면 다음 설정 필요
```

**WSL2 systemd 활성화 방법:**

1. **`/etc/wsl.conf` 파일 수정** (WSL2에서):

```bash
sudo tee /etc/wsl.conf > /dev/null <<EOF
[boot]
systemd=true
EOF
```

2. **WSL2 재시작** (Windows PowerShell에서):

```powershell
wsl --shutdown
# WSL2 다시 시작
```

#### 3단계: 네트워크 연결 확인

```bash
# 마스터 노드와의 연결 테스트
ping -c 3 121.88.4.81

# HTTPS 연결 테스트 (인증서 오류 무시)
curl -k https://121.88.4.81:6443

# 포트 접근 확인
nc -zv 121.88.4.81 6443
```

#### 4단계: 환경 변수 확인

```bash
# 토큰과 URL이 제대로 설정되었는지 확인
echo $K3S_TOKEN
echo $K3S_URL

# 다시 설정 (필요한 경우)
export K3S_TOKEN="K108ff12bdcf17f46fc62a0afeb3d4f26bf92b8b309d4f64f7e517c2696bceac5d2::server:821ba06dd321d42a7a85764f365bb5a4"
export K3S_URL="https://121.88.4.81:6443"
```

#### 5단계: k3s-agent 재시작

**문제: systemctl 명령이 멈추거나 응답하지 않는 경우**

WSL2에서 systemd가 제대로 작동하지 않을 수 있습니다. 다음 방법을 시도하세요:

**방법 A: 다른 터미널에서 프로세스 확인 및 강제 종료**

새로운 WSL2 터미널을 열고:

```bash
# k3s-agent 프로세스 확인
ps aux | grep k3s

# 프로세스 강제 종료 (PID는 위에서 확인한 값)
sudo kill -9 <PID>

# 또는 모든 k3s 프로세스 종료
sudo pkill -9 k3s
```

그 다음 원래 터미널로 돌아가서:

```bash
# systemd 재로드
sudo systemctl daemon-reload

# 서비스 재시작
sudo systemctl restart k3s-agent
```

**방법 B: service 명령 사용 (systemctl 대신)**

```bash
# service 명령 사용 (일부 경우 더 안정적)
sudo service k3s-agent stop
sudo service k3s-agent start
sudo service k3s-agent status
```

**방법 C: systemctl 타임아웃 설정**

```bash
# 타임아웃 설정 (기본 90초, 10초로 줄임)
sudo systemctl --runtime restart k3s-agent

# 또는 직접 서비스 파일 재로드 후 시작
sudo systemctl daemon-reload --no-block
sudo systemctl start k3s-agent --no-block
```

**방법 D: systemd 재시작 (최후의 수단)**

```powershell
# Windows PowerShell에서 WSL2 재시작
wsl --shutdown
# WSL2 다시 시작 후 재시도
```

**정상적인 경우:**

```bash
# k3s-agent 서비스 재시작
sudo systemctl daemon-reload
sudo systemctl restart k3s-agent

# 상태 확인
sudo systemctl status k3s-agent

# 실시간 로그 확인
sudo journalctl -u k3s-agent.service -f
```

#### 6단계: k3s-agent 환경 변수 확인 및 수정

환경 변수가 서비스에 제대로 설정되지 않았을 수 있습니다:

```bash
# 환경 파일 확인
sudo cat /etc/systemd/system/k3s-agent.service.env

# 환경 파일에 토큰과 URL이 없으면 수동으로 설정
sudo tee /etc/systemd/system/k3s-agent.service.env > /dev/null <<EOF
K3S_TOKEN=K108ff12bdcf17f46fc62a0afeb3d4f26bf92b8b309d4f64f7e517c2696bceac5d2::server:821ba06dd321d42a7a85764f365bb5a4
K3S_URL=https://121.88.4.81:6443
EOF

# 서비스 파일 확인 (환경 변수 참조 확인)
sudo cat /etc/systemd/system/k3s-agent.service

# systemd 재로드
sudo systemctl daemon-reload

# 서비스 재시작
sudo systemctl restart k3s-agent

# 상태 확인
sudo systemctl status k3s-agent
```

#### 7단계: 수동으로 k3s-agent 시작 (디버깅 및 대안)

systemctl이 작동하지 않으면 수동으로 실행할 수 있습니다:

```bash
# 1. 기존 프로세스 종료
sudo pkill -9 k3s

# 2. 서비스 파일 확인
sudo cat /etc/systemd/system/k3s-agent.service

# 3. 수동으로 실행하여 에러 확인 (foreground 모드)
sudo /usr/local/bin/k3s agent \
  --server https://121.88.4.81:6443 \
  --token "K108ff12bdcf17f46fc62a0afeb3d4f26bf92b8b309d4f64f7e517c2696bceac5d2::server:821ba06dd321d42a7a85764f365bb5a4"

# 4. 백그라운드로 실행하려면 (systemd 없이)
sudo nohup /usr/local/bin/k3s agent \
  --server https://121.88.4.81:6443 \
  --token "K108ff12bdcf17f46fc62a0afeb3d4f26bf92b8b309d4f64f7e517c2696bceac5d2::server:821ba06dd321d42a7a85764f365bb5a4" \
  > /tmp/k3s-agent.log 2>&1 &

# 5. 로그 확인
tail -f /tmp/k3s-agent.log
```

**참고:** 수동 실행은 systemd 없이도 작동하지만, WSL2 재시작 시 자동으로 시작되지 않습니다.

#### 8단계: TLS 인증서 검증 오류 해결

**에러 메시지:**
```
tls: failed to verify certificate: x509: certificate signed by unknown authority
```

이 문제는 워커 노드가 마스터 노드의 인증서를 신뢰하지 못할 때 발생합니다.

**해결 방법:**

**방법 A: 마스터 노드에서 워커 노드 확인 및 승인**

마스터 노드(121.88.4.81)에서:

```bash
# 노드 상태 확인
kubectl get nodes

# 워커 노드가 NotReady 상태라면, 인증서가 아직 동기화되지 않았을 수 있습니다
# 몇 분 기다린 후 다시 확인

# 노드 상세 정보 확인
kubectl describe node <워커-노드-이름>

# 워커 노드의 인증서 요청 확인
kubectl get csr  # Certificate Signing Requests
```

**방법 B: k3s 재설치 (인증서 자동 동기화)**

WSL2 워커 노드에서:

```bash
# 1. k3s 완전 제거
sudo /usr/local/bin/k3s-agent-uninstall.sh

# 2. 관련 파일 정리
sudo rm -rf /var/lib/rancher/k3s
sudo rm -rf /etc/rancher/k3s

# 3. 환경 변수 다시 설정
export K3S_TOKEN="K108ff12bdcf17f46fc62a0afeb3d4f26bf92b8b309d4f64f7e517c2696bceac5d2::server:821ba06dd321d42a7a85764f365bb5a4"
export K3S_URL="https://121.88.4.81:6443"

# 4. k3s 재설치 (마스터 노드 IP 직접 지정)
curl -sfL https://get.k3s.io | \
  K3S_TOKEN=$K3S_TOKEN \
  K3S_URL=$K3S_URL \
  INSTALL_K3S_EXEC="--node-external-ip 121.88.4.57" \
  sh -

# 5. 서비스 상태 확인
sudo systemctl status k3s-agent
sudo journalctl -u k3s-agent.service -f
```

**방법 C: 마스터 노드 인증서 복사 (고급)**

마스터 노드에서:

```bash
# 인증서 파일 확인
ls -la /var/lib/rancher/k3s/server/tls/
```

워커 노드로 인증서 복사 (보안 주의):

```bash
# 워커 노드에 인증서 디렉토리 생성
sudo mkdir -p /var/lib/rancher/k3s/agent/etc/certs/

# 마스터 노드의 인증서를 워커 노드로 복사 (scp 사용)
# 마스터 노드에서:
# scp /var/lib/rancher/k3s/server/tls/client-ca.crt user@121.88.4.57:/tmp/
# 워커 노드에서:
# sudo mv /tmp/client-ca.crt /var/lib/rancher/k3s/agent/etc/certs/
```

**권장:** 방법 B (재설치)가 가장 안정적이고 자동으로 인증서를 동기화합니다.

#### 9단계: iptables 설치 (필요한 경우)

```bash
# iptables 설치 (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y iptables

# 재시작
sudo systemctl restart k3s-agent
```

#### 10단계: 마스터 노드에서 최종 확인

워커 노드 조인 후, 마스터 노드(121.88.4.81)에서:

```bash
# 모든 노드 확인
kubectl get nodes

# 워커 노드가 Ready 상태인지 확인
# 예시:
# NAME              STATUS   ROLES                  AGE   VERSION
# ubuntu           Ready    control-plane,master   1d    v1.33.5+k3s1
# WIN-PC9V5HPCDGM  Ready    <none>                 10m   v1.33.5+k3s1

# 워커 노드에 라벨 추가 (app-server 라벨)
kubectl label nodes WIN-PC9V5HPCDGM app-server=true --overwrite

# 라벨 확인
kubectl get nodes --show-labels | grep app-server
```

### kubectl이 인식되지 않는 경우

```bash
# PATH 확인
echo $PATH
which kubectl

# 별칭 설정 확인
alias kubectl

# 수동으로 경로 추가
export PATH=$PATH:/usr/local/bin
```

### kubeconfig 권한 오류 해결 (워커 노드)

**에러 메시지:**
```
WARN[0000] Unable to read /etc/rancher/k3s/k3s.yaml, please start server with --write-kubeconfig-mode or --write-kubeconfig-group to modify kube config permissions
error: error loading config file "/etc/rancher/k3s/k3s.yaml": open /etc/rancher/k3s/k3s.yaml: permission denied
```

또는 `.kube` 디렉토리가 `root` 소유인 경우

**문제 확인:**

```bash
# 현재 사용자 확인
whoami

# .kube 디렉토리 권한 확인
ls -la ~/.kube

# 문제: .kube/가 root:root 소유인 경우
```

**해결 방법:**

#### 방법 1: .kube 디렉토리 소유권 변경 (권장)

```bash
# 현재 사용자 이름 확인
USER=$(whoami)

# .kube 디렉토리 및 파일 소유권 변경
sudo chown -R $USER:$USER ~/.kube

# 권한 설정
chmod 700 ~/.kube
chmod 600 ~/.kube/config

# 확인
ls -la ~/.kube
kubectl get nodes
```

#### 방법 2: 마스터 노드에서 kubeconfig 복사 (권장)

마스터 노드에서 직접 복사하면 올바른 권한으로 설정됩니다:

```bash
# 마스터 노드(121.88.4.81)에서 실행
scp ~/.kube/config bonanza@121.88.4.57:~/.kube/config

# 워커 노드에서 권한 확인 및 설정
chmod 600 ~/.kube/config
ls -la ~/.kube
```

#### 방법 3: 수동으로 디렉토리 재생성

```bash
# 기존 .kube 백업 (root 소유)
sudo mv ~/.kube ~/.kube.backup

# 새 디렉토리 생성
mkdir -p ~/.kube

# 마스터 노드에서 kubeconfig 복사
scp bonanza@121.88.4.81:~/.kube/config ~/.kube/config

# 권한 설정
chmod 700 ~/.kube
chmod 600 ~/.kube/config

# 확인
ls -la ~/.kube
kubectl get nodes
```

**권장:** 방법 1이 가장 빠르고 간단합니다. `sudo chown -R $USER:$USER ~/.kube` 명령으로 소유권을 변경하면 됩니다.

### 네트워크 연결 문제

```bash
# Windows 방화벽 확인
# Windows PowerShell에서:
# Get-NetFirewallRule | Where-Object DisplayName -like "*Kubernetes*"

# WSL2 네트워크 재설정
# PowerShell에서:
wsl --shutdown
# WSL2 다시 시작

# 마스터 노드와의 연결 테스트
ping 121.88.4.81
curl -k https://121.88.4.81:6443
```

### WSL2 리소스 부족

```bash
# 메모리 사용량 확인
free -h

# WSL2 재시작 (Windows에서)
# PowerShell에서:
wsl --shutdown
```

### Flannel Pod CrashLoopBackOff 오류

**에러 메시지:**
```
Error syncing pod, skipping" err="failed to \"StartContainer\" for \"kube-flannel\" with CrashLoopBackOff
```

WSL2에서 Flannel 네트워크 플러그인이 제대로 작동하지 않을 수 있습니다.

**해결 방법:**

#### 1단계: Flannel Pod 로그 확인

마스터 노드 또는 워커 노드에서:

```bash
# Flannel Pod 상태 확인
kubectl get pods -n kube-flannel

# Flannel Pod 로그 확인 (워커 노드의 Pod)
kubectl logs -n kube-flannel kube-flannel-ds-<pod-id> -c kube-flannel

# 또는 워커 노드에서 직접 확인
kubectl logs -n kube-flannel -l app=flannel --all-containers=true
```

#### 2단계: Flannel 설정 확인

```bash
# Flannel DaemonSet 확인
kubectl get daemonset -n kube-flannel

# Flannel ConfigMap 확인
kubectl get configmap -n kube-flannel kube-flannel-cfg -o yaml
```

#### 3단계: Flannel Pod 재시작

```bash
# Flannel Pod 삭제 (자동으로 재생성됨)
kubectl delete pods -n kube-flannel -l app=flannel

# 재시작 후 상태 확인
kubectl get pods -n kube-flannel -w
```

#### 4단계: WSL2 네트워크 설정 확인

WSL2에서 다음 설정이 필요한 경우가 있습니다:

```bash
# 네트워크 인터페이스 확인
ip addr show

# 커널 모듈 확인
lsmod | grep vxlan

# vxlan 모듈 로드 (필요한 경우)
sudo modprobe vxlan
```

#### 5단계: Flannel 삭제 후 재설치 (최후의 수단)

마스터 노드에서:

```bash
# Flannel 삭제
kubectl delete -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml

# 잠시 대기
sleep 10

# Flannel 재설치
kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml

# 상태 확인
kubectl get pods -n kube-flannel -w
```

**참고:** WSL2에서는 Flannel이 완전히 작동하지 않을 수 있습니다. 이 경우:
1. 노드가 `Ready` 상태인지만 확인하면 일단 진행 가능
2. 애플리케이션 Pod 배포 후 네트워크 문제가 발생하면 추가 조치 필요
3. 프로덕션 환경에서는 WSL2 대신 Linux 서버 사용 권장

## 📝 권장 설정

### WSL2 터미널 설정 (`.bashrc`)

```bash
# ~/.bashrc에 추가
export KUBECONFIG=~/.kube/config
alias k='kubectl'
alias kg='kubectl get'
alias kd='kubectl describe'
alias kl='kubectl logs'
alias kn='kubectl get nodes'
alias kp='kubectl get pods'
```

## 🔗 참고 자료

- [WSL2 공식 문서](https://docs.microsoft.com/en-us/windows/wsl/)
- [k3s WSL2 가이드](https://docs.k3s.io/)
- [Docker Desktop WSL2 백엔드](https://docs.docker.com/desktop/windows/wsl/)
- [kind 공식 문서](https://kind.sigs.k8s.io/)

## ⚠️ 주의사항

1. **WSL2 리소스**: 충분한 메모리와 CPU를 할당하지 않으면 Pod가 제대로 실행되지 않을 수 있습니다.
2. **네트워크**: Windows 방화벽 설정이 Kubernetes 통신을 방해할 수 있습니다.
3. **서비스 재시작**: Windows 재부팅 후 WSL2가 자동으로 시작되도록 설정하는 것이 좋습니다.
4. **마스터 연결**: 마스터 노드와 통신하려면 방화벽에서 포트 6443을 허용해야 합니다.

