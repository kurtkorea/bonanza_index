# Kubernetes 설치 가이드

이 디렉토리에는 Bonanza Index 프로젝트를 위해 각 서버에 Kubernetes를 설치하는 방법이 설명되어 있습니다.

## 📋 서버 구성

- **마스터 노드** (121.88.4.81 - Linux): Kubernetes 마스터 노드 + QuestDB, Redis, MariaDB Pod 실행
- **워커 노드** (121.88.4.57 - Windows WSL): 모든 애플리케이션 Pod 실행

## 📁 설치 가이드

### Linux 서버 (마스터 노드) - 121.88.4.81

👉 **[Linux Kubernetes 설치 가이드](./kubernetes-install-linux.md)**

- k3s (권장): 경량 Kubernetes
- kubeadm: 표준 Kubernetes
- MicroK8s: Ubuntu 전용

### Windows WSL 서버 (워커 노드) - 121.88.4.57

👉 **[WSL Windows Kubernetes 설치 가이드](./kubernetes-install-wsl-windows.md)**

- k3s in WSL2 (권장)
- Docker Desktop with Kubernetes
- MicroK8s in WSL2
- kind: 개발/테스트용

## 🚀 빠른 설치

### 시나리오 1: Linux 마스터 + Windows 워커

#### 1단계: Linux 마스터 노드에 k3s 설치

```bash
# Linux 서버 (121.88.4.81)에서 실행
curl -sfL https://get.k3s.io | sh -

# 토큰 확인 (워커 노드 조인 시 사용)
sudo cat /var/lib/rancher/k3s/server/node-token

# kubeconfig 설정
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config
```

#### 2단계: Windows WSL2 워커 노드에 k3s 설치 및 조인

```bash
# WSL2 터미널에서 실행
# 토큰과 마스터 노드 URL 설정
export K3S_TOKEN="<마스터에서_확인한_토큰>"
export K3S_URL="https://121.88.4.81:6443"

# k3s 설치 및 마스터에 조인
curl -sfL https://get.k3s.io | K3S_TOKEN=$K3S_TOKEN K3S_URL=$K3S_URL sh -

# kubeconfig 설정
mkdir -p ~/.kube
scp user@121.88.4.81:~/.kube/config ~/.kube/config
# 또는 수동으로 kubeconfig 복사
```

### 시나리오 2: 각각 독립 클러스터

각 서버에 독립적인 단일 노드 클러스터를 설치할 수도 있습니다.

## 📋 설치 체크리스트

### Linux 마스터 노드 (121.88.4.81)

- [ ] Linux OS 확인 (Ubuntu/CentOS/RHEL)
- [ ] Kubernetes 설치 (k3s 권장)
- [ ] 방화벽 포트 오픈 (6443, 10250 등)
- [ ] 클러스터 상태 확인
- [ ] 토큰 생성 및 보관

### Windows WSL2 워커 노드 (121.88.4.57)

- [ ] WSL2 설치 확인
- [ ] WSL2 리소스 할당 설정
- [ ] Kubernetes 설치 (k3s 권장)
- [ ] 마스터 노드 조인 또는 독립 설치
- [ ] kubectl 설치 및 설정

## 🔍 설치 후 확인

```bash
# 클러스터 정보 확인
kubectl cluster-info

# 노드 확인
kubectl get nodes -o wide

# 모든 노드가 Ready 상태인지 확인
kubectl get nodes

# 마스터 노드 라벨 확인
kubectl get nodes --show-labels | grep control-plane

# 워커 노드 확인
kubectl get nodes --show-labels | grep app-server
```

## 🔗 다음 단계

Kubernetes 설치가 완료되면:

1. **[노드 설정](../node-setup.md)**: 워커 노드에 라벨 추가
2. **[배포 가이드](../README.md)**: Bonanza Index 애플리케이션 배포

## ⚠️ 주의사항

1. **네트워크**: 마스터-워커 통신을 위해 양방향 네트워크 연결이 필요합니다.
2. **방화벽**: 필요한 포트(6443, 10250 등)가 열려 있어야 합니다.
3. **리소스**: WSL2의 경우 충분한 메모리와 CPU를 할당해야 합니다.
4. **버전**: 마스터와 워커의 Kubernetes 버전이 호환되어야 합니다.

