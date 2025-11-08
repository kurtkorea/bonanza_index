# k3s 완전 재설치 가이드

처음부터 깨끗하게 k3s를 재설치하는 방법입니다.

## ⚠️ 주의사항

- **모든 Pod, Service, Deployment가 삭제됩니다**
- **PV(PersistentVolume) 데이터는 별도로 백업/삭제해야 합니다**
- **현재 실행 중인 모든 서비스가 중단됩니다**

## 📋 재설치 순서

### 1. 마스터 노드 제거

마스터 노드(bonanza-master)에서 실행:

```bash
# k3s 중지 및 제거
sudo systemctl stop k3s
sudo /usr/local/bin/k3s-killall.sh
sudo /usr/local/bin/k3s-uninstall.sh

# 데이터 삭제 (선택사항)
sudo rm -rf /var/lib/rancher/k3s
sudo rm -rf /etc/rancher/k3s
```

### 2. 워커 노드 제거

워커 노드(bonanza-app-wsl)에서 실행:

```bash
# k3s agent 중지 및 제거
sudo systemctl stop k3s-agent
sudo /usr/local/bin/k3s-agent-killall.sh
sudo /usr/local/bin/k3s-agent-uninstall.sh

# 데이터 삭제 (선택사항)
sudo rm -rf /var/lib/rancher/k3s
sudo rm -rf /etc/rancher/k3s
```

### 3. 마스터 노드 재설치

마스터 노드(bonanza-master)에서 실행:

```bash
# k3s 설치
curl -sfL https://get.k3s.io | sh -

# 설치 확인
sudo systemctl status k3s
kubectl get nodes

# kubeconfig 설정
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(whoami):$(whoami) ~/.kube/config

# 노드 라벨 설정 (선택사항)
# 먼저 노드 이름 확인
kubectl get nodes

# 노드 라벨 추가 (노드 이름에 맞게 변경)
kubectl label node <노드이름> node-role.kubernetes.io/control-plane=true --overwrite
kubectl label node <노드이름> node-role.kubernetes.io/master=true --overwrite

# 예시: 노드 이름이 main-node인 경우
# kubectl label node main-node node-role.kubernetes.io/control-plane=true --overwrite
# kubectl label node main-node node-role.kubernetes.io/master=true --overwrite
```

### 4. 워커 노드 재설치

**4-1. 마스터 노드에서 토큰 확인:**
```bash
sudo cat /var/lib/rancher/k3s/server/node-token
```

**4-2. 워커 노드에서 환경 변수 설정:**
```bash
export K3S_TOKEN=<위에서 확인한 토큰>
export K3S_URL=https://121.88.4.53:6443
```

**4-3. 워커 노드 호스트명 설정 (필수):**
```bash
# 현재 호스트명 확인
hostname

# 호스트명을 bonanza-worker로 변경
sudo hostnamectl set-hostname bonanza-worker

# /etc/hosts 파일 수정 (중요!)
sudo nano /etc/hosts
# 또는
sudo bash -c 'echo "127.0.0.1 bonanza-worker" >> /etc/hosts'

# /etc/hosts 파일 확인
cat /etc/hosts
# 127.0.0.1 bonanza-worker 라인이 있어야 합니다
```

**4-4. 워커 노드에서 k3s agent 설치 (노드 이름: bonanza-worker):**
```bash
# k3s agent 설치 시 노드 이름을 bonanza-worker로 지정
curl -sfL https://get.k3s.io | K3S_TOKEN=$K3S_TOKEN K3S_URL=$K3S_URL INSTALL_K3S_EXEC="--node-name bonanza-worker" sh -
```
```

**4-5. kubeconfig 복사:**
```bash
# 마스터 노드에서 실행
scp ~/.kube/config bonanza@172.24.246.189:~/.kube/config

# 워커 노드에서 실행
chmod 600 ~/.kube/config
```

### 5. 설치 확인

```bash
# 노드 확인
kubectl get nodes -o wide

# flannel 확인 (자동 설치됨)
kubectl get pods -n kube-system -l app=flannel

# 모든 시스템 Pod 확인
kubectl get pods -n kube-system
```

### 6. 워커 노드 라벨 설정

```bash
kubectl label node bonanza-worker app-server=true
```

## 🚀 배포 순서

재설치 후 다음 순서로 배포:

1. 네임스페이스: `kubectl apply -f k8s/namespace.yaml`
2. ConfigMap/Secret: `kubectl apply -f k8s/configmap-common.yaml k8s/secret.yaml`
3. 스토리지 클래스: `kubectl apply -f k8s/storageclass-*.yaml`
4. 데이터베이스: `kubectl apply -f k8s/questdb/ k8s/redis/ k8s/mariadb/`
5. 애플리케이션: `kubectl apply -f k8s/telegram-log/ k8s/orderbook-collector/` 등

## 💡 자동화 스크립트

간단한 스크립트로 안내를 받을 수 있습니다:

```bash
cd k8s/scriptsc
chmod +x reinstall-k3s-from-scratch.sh
./reinstall-k3s-from-scratch.sh
```

이 스크립트는 단계별로 안내하며, 각 단계를 수동으로 실행해야 합니다.

## ✅ 재설치 후 확인 사항

- [ ] 노드가 모두 Ready 상태인가?
- [ ] flannel Pod가 모든 노드에서 Running인가?
- [ ] Service 이름으로 Pod 간 통신이 가능한가?
- [ ] 워커 노드에 `app-server=true` 라벨이 있는가?

## 🔍 문제 해결

재설치 후에도 문제가 있으면:

1. flannel 확인: `kubectl get pods -n kube-system -l app=flannel`
2. 노드 상태: `kubectl get nodes -o wide`
3. 네트워크 테스트: `kubectl run test --image=busybox --rm -it -- ping <다른-노드-IP>`

