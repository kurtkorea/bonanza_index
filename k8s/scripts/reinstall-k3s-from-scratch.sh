#!/bin/bash

# k3s 완전 제거 후 재설치 스크립트
# 처음부터 깨끗하게 설치

set -e

echo "🔄 k3s 완전 제거 후 재설치"
echo "================================"
echo ""
echo "⚠️  주의: 이 작업은 모든 k3s 데이터를 삭제합니다!"
echo "   - 모든 Pod, Service, Deployment가 삭제됩니다"
echo "   - PV 데이터는 보존됩니다 (별도 삭제 필요)"
echo ""
read -p "정말 처음부터 다시 설치하시겠습니까? (yes를 입력하세요): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "   취소되었습니다"
    exit 0
fi

echo ""
echo "================================"
echo "1️⃣  마스터 노드 제거"
echo "================================"
echo ""
echo "마스터 노드(bonanza-master)에서 다음 명령어를 실행하세요:"
echo ""
echo "1. k3s 중지 및 제거:"
echo "   sudo systemctl stop k3s"
echo "   sudo /usr/local/bin/k3s-killall.sh"
echo "   sudo /usr/local/bin/k3s-uninstall.sh"
echo ""
echo "2. k3s 데이터 삭제 (선택사항):"
echo "   sudo rm -rf /var/lib/rancher/k3s"
echo "   sudo rm -rf /etc/rancher/k3s"
echo ""
read -p "마스터 노드에서 제거를 완료하셨나요? (y/N): " MASTER_DONE
if [[ ! "$MASTER_DONE" =~ ^[Yy]$ ]]; then
    echo "   마스터 노드 제거를 먼저 완료하세요"
    exit 1
fi

echo ""
echo "================================"
echo "2️⃣  워커 노드 제거"
echo "================================"
echo ""
echo "워커 노드(bonanza-app-wsl)에서 다음 명령어를 실행하세요:"
echo ""
echo "1. k3s agent 중지 및 제거:"
echo "   sudo systemctl stop k3s-agent"
echo "   sudo /usr/local/bin/k3s-agent-killall.sh"
echo "   sudo /usr/local/bin/k3s-agent-uninstall.sh"
echo ""
echo "2. k3s 데이터 삭제 (선택사항):"
echo "   sudo rm -rf /var/lib/rancher/k3s"
echo "   sudo rm -rf /etc/rancher/k3s"
echo ""
read -p "워커 노드에서 제거를 완료하셨나요? (y/N): " WORKER_DONE
if [[ ! "$WORKER_DONE" =~ ^[Yy]$ ]]; then
    echo "   워커 노드 제거를 먼저 완료하세요"
    exit 1
fi

echo ""
echo "================================"
echo "3️⃣  마스터 노드 재설치"
echo "================================"
echo ""
echo "마스터 노드(bonanza-master)에서 다음 명령어를 실행하세요:"
echo ""
echo "1. k3s 설치:"
echo "   curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--node-name bonanza-master" sh -"
echo ""
echo "2. 설치 확인:"
echo "   sudo systemctl status k3s"
echo "   kubectl get nodes"
echo ""
echo "3. kubeconfig 설정:"
echo "   mkdir -p ~/.kube"
echo "   sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config"
echo "   sudo chown \$(whoami):\$(whoami) ~/.kube/config"
echo "   또는: sudo chown bonanza:bonanza ~/.kube/config"
echo ""
echo "4. 노드 라벨 설정 (선택사항):"
echo "   # 먼저 노드 이름 확인"
echo "   kubectl get nodes"
echo "   # 노드 라벨 추가 (실제 노드 이름 사용)"
echo "   kubectl label node <노드이름> node-role.kubernetes.io/control-plane=true --overwrite"
echo "   kubectl label node <노드이름> node-role.kubernetes.io/master=true --overwrite"
echo ""
read -p "마스터 노드 재설치를 완료하셨나요? (y/N): " MASTER_INSTALLED
if [[ ! "$MASTER_INSTALLED" =~ ^[Yy]$ ]]; then
    echo "   마스터 노드 재설치를 먼저 완료하세요"
    exit 1
fi

echo ""
echo "================================"
echo "4️⃣  워커 노드 재설치"
echo "================================"
echo ""
echo "워커 노드(bonanza-app-wsl)에서 다음 명령어를 실행하세요:"
echo ""
echo "1. 마스터 노드에서 토큰 확인:"
echo "   # 마스터 노드에서 실행"
echo "   sudo cat /var/lib/rancher/k3s/server/node-token"
echo ""
echo "2. 호스트명 설정 (필수 - sudo 오류 방지):"
echo "   sudo hostnamectl set-hostname bonanza-worker"
echo "   sudo bash -c 'echo \"127.0.0.1 bonanza-worker\" >> /etc/hosts'"
echo ""
echo "3. 환경 변수 설정:"
echo "   export K3S_TOKEN=<위에서 확인한 토큰>"
echo "   export K3S_URL=https://121.88.4.53:6443"
echo ""
echo "4. k3s agent 설치 (노드 이름: bonanza-worker):"
echo "   curl -sfL https://get.k3s.io | K3S_TOKEN=\$K3S_TOKEN K3S_URL=\$K3S_URL INSTALL_K3S_EXEC=\"--with-node-id --node-name bonanza-worker\" sh -"
echo ""
echo "5. kubeconfig 복사 (마스터 노드에서):"
echo "   # 마스터 노드에서 실행"
echo "   scp ~/.kube/config bonanza@172.24.246.189:~/.kube/config"
echo ""
echo "   # 워커 노드에서 실행"
echo "   chmod 600 ~/.kube/config"
echo ""
read -p "워커 노드 재설치를 완료하셨나요? (y/N): " WORKER_INSTALLED
if [[ ! "$WORKER_INSTALLED" =~ ^[Yy]$ ]]; then
    echo "   워커 노드 재설치를 먼저 완료하세요"
    exit 1
fi

echo ""
echo "================================"
echo "5️⃣  설치 확인"
echo "================================"
echo ""
echo "현재 위치에서 확인:"
echo ""
echo "1. 노드 확인:"
kubectl get nodes -o wide
echo ""

echo "2. flannel 확인:"
kubectl get pods -n kube-system -l app=flannel
echo ""

echo "3. 모든 시스템 Pod 확인:"
kubectl get pods -n kube-system
echo ""

echo "================================"
echo "6️⃣  라벨 설정"
echo "================================"
echo ""
echo "워커 노드에 app-server 라벨 추가:"
WORKER_NODE=$(kubectl get nodes -o jsonpath='{range .items[?(@.metadata.labels.node-role\.kubernetes\.io/control-plane!="true")]}{.metadata.name}{"\n"}{end}' | head -1)
if [ ! -z "$WORKER_NODE" ]; then
    echo "   워커 노드: $WORKER_NODE"
    echo "   kubectl label node $WORKER_NODE app-server=true"
    echo ""
    read -p "라벨을 추가하시겠습니까? (y/N): " ADD_LABEL
    if [[ "$ADD_LABEL" =~ ^[Yy]$ ]]; then
        kubectl label node "$WORKER_NODE" app-server=true --overwrite
        echo "   ✅ 라벨 추가 완료"
    fi
else
    echo "   ⚠️  워커 노드를 찾을 수 없습니다"
    echo "   노드가 추가된 후 다음 명령어로 라벨을 추가하세요:"
    echo "   kubectl label node bonanza-worker app-server=true"
fi

echo ""
echo "================================"
echo "✅ 재설치 완료"
echo "================================"
echo ""
echo "다음 단계:"
echo "1. 네임스페이스 생성: kubectl apply -f k8s/namespace.yaml"
echo "2. ConfigMap/Secret 생성: kubectl apply -f k8s/configmap-common.yaml"
echo "3. 스토리지 클래스 생성: kubectl apply -f k8s/storageclass-*.yaml"
echo "4. 데이터베이스 배포: kubectl apply -f k8s/questdb/ k8s/redis/ k8s/mariadb/"
echo "5. 애플리케이션 배포: kubectl apply -f k8s/telegram-log/ k8s/orderbook-collector/ 등"
echo ""

