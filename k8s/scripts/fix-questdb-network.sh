#!/bin/bash

# QuestDB 네트워크 연결 문제 해결 스크립트

set -e

echo "🔧 QuestDB 네트워크 연결 문제 해결"
echo "================================"
echo ""

# 1. 현재 상태 확인
echo "1️⃣  현재 상태 확인:"
echo "--------------------------------"
QDB_POD=$(kubectl get pods -n bonanza-index -l app=questdb --no-headers 2>/dev/null | head -1 | awk '{print $1}' || echo "")
QDB_POD_IP=$(kubectl get pod -n bonanza-index "$QDB_POD" -o jsonpath='{.status.podIP}' 2>/dev/null || echo "")
QDB_CLUSTER_IP=$(kubectl get svc -n bonanza-index questdb-service -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")

if [ -z "$QDB_POD" ]; then
    echo "   ❌ QuestDB Pod를 찾을 수 없습니다"
    exit 1
fi

echo "   QuestDB Pod: $QDB_POD"
echo "   Pod IP: $QDB_POD_IP"
echo "   Service Cluster IP: $QDB_CLUSTER_IP"
echo ""

# 2. kube-proxy 확인 (k3s에서는 별도 Pod가 아닐 수 있음)
echo "2️⃣  kube-proxy 확인:"
echo "--------------------------------"
KUBE_PROXY_PODS=$(kubectl get pods -n kube-system -l k8s-app=kube-proxy --no-headers 2>/dev/null | wc -l || echo "0")
if [ "$KUBE_PROXY_PODS" -eq 0 ]; then
    echo "   ℹ️  kube-proxy Pod가 없습니다 (k3s에서는 내장 컴포넌트로 실행될 수 있음)"
    echo "   k3s 프로세스 확인:"
    echo "   # 마스터 노드: ps aux | grep k3s | grep -v grep"
    echo "   # 워커 노드: ps aux | grep k3s-agent | grep -v grep"
else
    echo "   kube-proxy Pod:"
    kubectl get pods -n kube-system -l k8s-app=kube-proxy
fi
echo ""

# 3. flannel 확인
echo "3️⃣  flannel 확인:"
echo "--------------------------------"
FLANNEL_PODS=$(kubectl get pods -n kube-flannel --no-headers 2>/dev/null | wc -l || echo "0")
if [ "$FLANNEL_PODS" -eq 0 ]; then
    echo "   ❌ flannel Pod를 찾을 수 없습니다"
    echo "   flannel 설치: kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml"
    exit 1
else
    echo "   flannel Pod 상태:"
    kubectl get pods -n kube-flannel
    FLANNEL_READY=$(kubectl get pods -n kube-flannel --no-headers 2>/dev/null | grep -c "Running" || echo "0")
    if [ "$FLANNEL_READY" -lt 2 ]; then
        echo "   ⚠️  일부 flannel Pod가 Running 상태가 아닙니다"
    fi
fi
echo ""

# 4. 노드 간 네트워크 확인
echo "4️⃣  노드 간 네트워크 확인:"
echo "--------------------------------"
NODES=$(kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}{end}' 2>/dev/null || echo "")
if [ ! -z "$NODES" ]; then
    echo "   노드 목록:"
    echo "$NODES" | while read NODE IP; do
        if [ ! -z "$NODE" ] && [ ! -z "$IP" ]; then
            echo "   - $NODE: $IP"
        fi
    done
else
    echo "   ⚠️  노드 정보를 가져올 수 없습니다"
fi
echo ""

# 5. 해결 방법 제시
echo "================================"
echo "💡 해결 방법"
echo "================================"
echo ""

# 옵션 1: NodePort 사용 (임시 해결책)
echo "옵션 1: NodePort 사용 (가장 빠른 해결책)"
echo "--------------------------------"
echo "QuestDB Service는 이미 NodePort로 설정되어 있습니다 (포트: 30812)"
echo ""
echo "ConfigMap 수정:"
echo "   kubectl patch configmap bonanza-common-config -n bonanza-index --type merge -p '{\"data\":{\"QDB_HOST\":\"121.88.4.53\",\"QDB_PORT\":\"30812\"}}'"
echo ""
read -p "NodePort를 사용하도록 ConfigMap을 수정하시겠습니까? (y/N): " USE_NODEPORT
if [[ "$USE_NODEPORT" =~ ^[Yy]$ ]]; then
    kubectl patch configmap bonanza-common-config -n bonanza-index --type merge -p '{"data":{"QDB_HOST":"121.88.4.53","QDB_PORT":"30812"}}'
    echo "   ✅ ConfigMap 수정 완료"
    echo ""
    echo "   관련 Pod 재시작 필요:"
    echo "   kubectl delete pods -n bonanza-index -l app=telegram-log"
    echo "   kubectl delete pods -n bonanza-index -l app=orderbook-collector"
    echo "   # 기타 QuestDB를 사용하는 Pod들"
    exit 0
fi
echo ""

# 옵션 2: 네트워크 문제 해결
echo "옵션 2: 네트워크 문제 해결"
echo "--------------------------------"
echo "1. flannel 재시작:"
echo "   kubectl delete pods -n kube-flannel --all"
echo ""
read -p "flannel Pod를 재시작하시겠습니까? (y/N): " RESTART_FLANNEL
if [[ "$RESTART_FLANNEL" =~ ^[Yy]$ ]]; then
    kubectl delete pods -n kube-flannel --all
    echo "   ✅ flannel Pod 재시작 중..."
    echo "   잠시 대기 후: kubectl get pods -n kube-flannel"
fi
echo ""

echo "2. 노드 간 네트워크 연결 확인:"
echo "   ⚠️  마스터 노드에서 워커 노드로 ping이 실패합니다"
echo "   이는 QuestDB Service 연결 실패의 근본 원인입니다"
echo ""
echo "   원인:"
echo "   - 워커 노드 IP (172.24.246.189)는 WSL2 내부 IP입니다"
echo "   - 마스터 노드에서 직접 접근이 불가능할 수 있습니다"
echo "   - flannel이 제대로 작동하려면 노드 간 네트워크 연결이 필요합니다"
echo ""
echo "   해결 방법:"
echo "   방법 1: NodePort 사용 (권장 - 가장 빠른 해결책)"
echo "   - QuestDB Service는 이미 NodePort 30812로 설정되어 있습니다"
echo "   - 마스터 노드의 공인 IP (121.88.4.53)를 통해 접근 가능"
echo ""
echo "   방법 2: WSL2 네트워크 설정"
echo "   - Windows 방화벽에서 WSL2 네트워크 허용"
echo "   - 마스터 노드에서 워커 노드의 공인 IP로 접근 시도"
echo ""
echo "   방법 3: VPN 또는 네트워크 라우팅 설정"
echo "   - 두 노드가 같은 네트워크에 있도록 설정"
echo ""

echo "3. k3s 재시작 (최후의 수단):"
echo "   # 마스터 노드:"
echo "   sudo systemctl restart k3s"
echo ""
echo "   # 워커 노드:"
echo "   sudo systemctl restart k3s-agent"
echo ""

echo "4. flannel 네트워크 설정 확인:"
echo "   kubectl get configmap -n kube-flannel kube-flannel-cfg -o yaml"
echo "   # Network가 10.42.0.0/16인지 확인"
echo ""

