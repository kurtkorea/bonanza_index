# Kubernetes 설치 가이드 - Linux (121.88.4.81)

이 문서는 **Linux 서버 (121.88.4.81)**에 Kubernetes를 설치하는 방법을 설명합니다.

## 📋 사전 요구사항

- Ubuntu 20.04+ / CentOS 7+ / RHEL 8+
- 최소 2GB RAM, 2 CPU 코어 (권장: 4GB RAM, 4 CPU 코어)
- 루트 또는 sudo 권한
- 네트워크 연결
- 방화벽 설정 권한

## 🎯 설치 옵션

### 옵션 1: k3s (경량 Kubernetes - 권장) ⭐

k3s는 프로덕션 환경에서도 사용 가능한 경량 Kubernetes 배포판입니다.

#### 1.1 k3s 마스터 노드 설치

**방법 A: 기본 설치 후 권한 설정**

```bash
# k3s 설치 (서버 모드)
curl -sfL https://get.k3s.io | sh -

# 설치 확인
sudo k3s kubectl get nodes

# kubeconfig 파일 설정
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config

# kubectl 별칭 설정 (선택사항)
echo 'alias kubectl="k3s kubectl"' >> ~/.bashrc
source ~/.bashrc
```

**방법 B: 설치 시 권한 설정 (권장)**

```bash
# k3s 설치 (서버 모드, kubeconfig 권한 자동 설정)
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--write-kubeconfig-mode 644" sh -

# 설치 확인
sudo k3s kubectl get nodes

# kubeconfig 파일 설정
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config

# kubectl 별칭 설정 (선택사항)
echo 'alias kubectl="k3s kubectl"' >> ~/.bashrc
source ~/.bashrc
```

#### 1.2 k3s 설정 및 토큰 확인

```bash
# 토큰 확인 (워커 노드 조인 시 사용)
sudo cat /var/lib/rancher/k3s/server/node-token
K108ff12bdcf17f46fc62a0afeb3d4f26bf92b8b309d4f64f7e517c2696bceac5d2::server:821ba06dd321d42a7a85764f365bb5a4

#파일권한 설정
sudo chmod 644 /etc/rancher/k3s/k3s.yaml

# 서비스 상태 확인
sudo systemctl status k3s
sudo systemctl enable k3s

# 클러스터 정보 확인
kubectl cluster-info
kubectl get nodes
```

#### 1.3 방화벽 설정

```bash
# Ubuntu/Debian
sudo ufw allow 6443/tcp    # Kubernetes API
sudo ufw allow 10250/tcp   # Kubelet API
sudo ufw allow 8472/udp   # Flannel VXLAN
sudo ufw allow 51820/udp  # Flannel Wireguard (선택사항)
sudo ufw allow 51821/udp  # Flannel Wireguard (선택사항)

# 또는 모든 트래픽 허용 (개발 환경)
# sudo ufw allow from 121.88.4.57

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=6443/tcp
sudo firewall-cmd --permanent --add-port=10250/tcp
sudo firewall-cmd --permanent --add-port=8472/udp
sudo firewall-cmd --reload
```

### 옵션 2: MicroK8s (Ubuntu 전용)

Ubuntu 서버인 경우 MicroK8s를 사용할 수 있습니다.

```bash
# MicroK8s 설치
sudo snap install microk8s --classic

# 그룹 추가 (sudo 없이 실행)
sudo usermod -a -G microk8s $USER
newgrp microk8s

# 필수 애드온 설치
microk8s enable dns storage ingress

# kubectl 별칭 설정
echo "alias kubectl='microk8s kubectl'" >> ~/.bashrc
source ~/.bashrc

# 상태 확인
microk8s status
```

### 옵션 3: kubeadm (표준 Kubernetes - 프로덕션)

#### 3.1 필수 패키지 설치

```bash
# containerd 설치
sudo apt-get update
sudo apt-get install -y containerd
sudo mkdir -p /etc/containerd
sudo containerd config default | sudo tee /etc/containerd/config.toml
sudo systemctl restart containerd
sudo systemctl enable containerd

# 쿠버네티스 리포지토리 설정
sudo apt-get install -y apt-transport-https ca-certificates curl
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/kubernetes-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://apt.kubernetes.io/ kubernetes-xenial main" | sudo tee /etc/apt/sources.list.d/kubernetes.list

# kubeadm, kubelet, kubectl 설치
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl

# swap 비활성화
sudo swapoff -a
sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab
```

#### 3.2 네트워크 설정

```bash
# 컨테이너 런타임 설정
cat <<EOF | sudo tee /etc/modules-load.d/containerd.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter

cat <<EOF | sudo tee /etc/sysctl.d/99-kubernetes-cri.conf
net.bridge.bridge-nf-call-iptables  = 1
net.ipv4.ip_forward                 = 1
net.bridge.bridge-nf-call-ip6tables = 1
EOF

sudo sysctl --system
```

#### 3.3 클러스터 초기화

```bash
# 마스터 노드 초기화
sudo kubeadm init --pod-network-cidr=10.244.0.0/16

# kubeconfig 설정
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# Pod 네트워크 설치 (Flannel)
kubectl apply -f https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml
```

## 🔧 설치 확인

```bash
# 노드 상태 확인
kubectl get nodes

# 클러스터 정보 확인
kubectl cluster-info

# 시스템 Pod 확인
kubectl get pods --all-namespaces

# 마스터 노드 라벨 확인
kubectl get nodes --show-labels | grep control-plane
```

## 📝 워커 노드 조인 토큰 (kubeadm)

```bash
# 토큰 생성 (만료된 경우)
kubeadm token create --print-join-command

# 출력된 명령을 워커 노드에서 실행
```

## 🔥 마스터 노드 특수 설정

### k3s 마스터 노드에 데이터베이스 Pod 스케줄링 허용

기본적으로 k3s는 마스터 노드에 일반 Pod를 스케줄링하지 않습니다. 데이터베이스 Pod를 마스터 노드에 배포하려면:

```bash
# k3s 설정 파일 수정
sudo vi /etc/rancher/k3s/config.yaml
```

다음 내용 추가:
```yaml
node-taint:
  - "node-role.kubernetes.io/control-plane:NoSchedule"
```

또는:

```bash
# 마스터 노드 taint 제거 (권장하지 않음, 보안상 위험)
kubectl taint nodes --all node-role.kubernetes.io/control-plane-
```

**권장 방법**: taint를 유지하고, StatefulSet/Deployment에서 `tolerations`를 추가합니다.

## 🔗 참고 자료

- [k3s 공식 문서](https://docs.k3s.io/)
- [MicroK8s 공식 문서](https://microk8s.io/docs)
- [kubeadm 공식 문서](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/)

## ⚠️ 문제 해결

### k3s가 시작되지 않는 경우

```bash
# 로그 확인
sudo journalctl -u k3s -f

# 서비스 재시작
sudo systemctl restart k3s

# 설정 파일 확인
sudo cat /etc/rancher/k3s/config.yaml
```

### 네트워크 연결 문제

```bash
# 포트 확인
sudo netstat -tlnp | grep -E "(6443|10250)"

# 방화벽 확인
sudo ufw status
# 또는
sudo firewall-cmd --list-all
```

### kubeconfig 권한 오류 해결

**에러 메시지:**
```
WARN[0000] Unable to read /etc/rancher/k3s/k3s.yaml, please start server with --write-kubeconfig-mode or --write-kubeconfig-group to modify kube config permissions
error: error loading config file "/etc/rancher/k3s/k3s.yaml": open /etc/rancher/k3s/k3s.yaml: permission denied
```

**해결 방법 1: 기존 설치에서 권한 수정 (빠른 해결)**

```bash
# kubeconfig 파일 권한 수정
sudo chmod 644 /etc/rancher/k3s/k3s.yaml

# 사용자 홈 디렉토리로 복사
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config

# 확인
kubectl get nodes
```

**해결 방법 2: k3s 재설치 (권장 - 권한 자동 설정)**

```bash
# k3s 제거
sudo /usr/local/bin/k3s-uninstall.sh

# 권한 설정 옵션과 함께 재설치
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--write-kubeconfig-mode 644" sh -

# kubeconfig 파일 설정
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config

# 확인
kubectl get nodes
```

**해결 방법 3: k3s 설정 파일 수정 (기존 설치 유지)**

```bash
# k3s 설정 파일 생성/수정
sudo mkdir -p /etc/rancher/k3s
sudo tee /etc/rancher/k3s/config.yaml > /dev/null <<EOF
write-kubeconfig-mode: "0644"
EOF

# k3s 재시작
sudo systemctl restart k3s

# kubeconfig 파일 설정
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config

# 확인
kubectl get nodes
```

**참고:** 방법 1이 가장 빠르고 간단합니다. 이미 설치가 완료된 경우 방법 1을 사용하세요.

