#!/bin/bash

# 워커 노드용 리소스 삭제 스크립트
# deploy-worker.sh에서 배포한 리소스들을 삭제합니다

set -e

# 스크립트 디렉토리에서 상위 디렉토리(k8s/)로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "🗑️  Bonanza Index 워커 노드 리소스 삭제"
echo "================================"
echo ""

# 워커 노드 확인
WORKER_NODES=$(kubectl get nodes -l app-server=true --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null)
if [ -z "$WORKER_NODES" ]; then
    echo "⚠️  app-server=true 라벨을 가진 워커 노드를 찾을 수 없습니다"
    echo ""
    echo "사용 가능한 노드:"
    kubectl get nodes --show-labels
    echo ""
    echo "💡 워커 노드에 라벨 추가:"
    echo "   kubectl label nodes <node-name> app-server=true --overwrite"
    exit 1
fi

echo "✅ 워커 노드 발견:"
echo "$WORKER_NODES" | while read -r node; do
    NODE_IP=$(kubectl get node "$node" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "")
    echo "   - $node ($NODE_IP)"
done
echo ""

# 현재 배포 상태 확인
echo "📊 워커 노드 배포 상태:"
echo "================================"
echo ""

echo "📦 워커 노드 Pod 상태:"
WORKER_NODE_LIST=$(kubectl get nodes -l app-server=true --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null)
if [ ! -z "$WORKER_NODE_LIST" ]; then
    echo "$WORKER_NODE_LIST" | while read -r node; do
        if [ ! -z "$node" ]; then
            echo ""
            echo "노드: $node"
            kubectl get pods -n bonanza-index -o wide --field-selector=spec.nodeName=$node 2>/dev/null || echo "  Pod 없음"
        fi
    done
else
    echo "워커 노드를 찾을 수 없습니다"
fi

echo ""
echo "🔍 애플리케이션 서비스 상태:"
kubectl get svc -n bonanza-index 2>/dev/null | grep -E "(index|orderbook|ticker|telegram)" || echo "서비스가 없습니다"

echo ""
echo "📡 Ingress 상태:"
kubectl get ingress -n bonanza-index 2>/dev/null || echo "Ingress 없음"

echo ""
echo "================================"
echo "⚠️  삭제 대상 리소스"
echo "================================"
echo ""
echo "다음 리소스들이 삭제됩니다:"
echo "  📦 Deployment:"
echo "    - index-endpoint"
echo "    - index-calculator"
echo "    - orderbook-collector"
echo "    - ticker-collector"
echo "    - orderbook-storage-worker"
echo "    - ticker-storage-worker"
echo "    - orderbook-aggregator"
echo "    - telegram-log"
echo "    - index-calc-fe"
echo ""
echo "  🔍 Service:"
echo "    - index-endpoint-service"
echo "    - index-calculator-service"
echo "    - orderbook-collector-service"
echo "    - ticker-collector-service"
echo "    - orderbook-storage-worker-service"
echo "    - ticker-storage-worker-service"
echo "    - orderbook-aggregator-service (없을 수 있음)"
echo "    - telegram-log-service"
echo "    - index-calc-fe-service"
echo ""
echo "  📡 Ingress:"
echo "    - bonanza-index-ingress"
echo ""
echo "⚠️  주의사항:"
echo "  - 마스터 노드의 리소스(데이터베이스, Nginx)는 유지됩니다"
echo "  - Namespace는 삭제하지 않습니다"
echo "  - ConfigMap 'bonanza-common-config'는 유지됩니다"
echo "  - Secret 'bonanza-secrets'는 유지됩니다"
echo ""

# 삭제 확인
read -p "정말 삭제하시겠습니까? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ 삭제가 취소되었습니다."
    exit 0
fi

echo ""
echo "⏳ 삭제 시작..."
echo ""

# Deployment 삭제
echo "🗑️  Deployment 삭제 중..."
kubectl delete deployment index-endpoint -n bonanza-index --ignore-not-found=true
kubectl delete deployment index-calculator -n bonanza-index --ignore-not-found=true
kubectl delete deployment orderbook-collector -n bonanza-index --ignore-not-found=true
kubectl delete deployment ticker-collector -n bonanza-index --ignore-not-found=true
kubectl delete deployment orderbook-storage-worker -n bonanza-index --ignore-not-found=true
kubectl delete deployment ticker-storage-worker -n bonanza-index --ignore-not-found=true
kubectl delete deployment orderbook-aggregator -n bonanza-index --ignore-not-found=true
kubectl delete deployment telegram-log -n bonanza-index --ignore-not-found=true
kubectl delete deployment index-calc-fe -n bonanza-index --ignore-not-found=true
echo "  ✅ Deployment 삭제 완료"

# Service 삭제
echo ""
echo "🗑️  Service 삭제 중..."
kubectl delete service index-endpoint-service -n bonanza-index --ignore-not-found=true
kubectl delete service index-calculator-service -n bonanza-index --ignore-not-found=true
kubectl delete service orderbook-collector-service -n bonanza-index --ignore-not-found=true
kubectl delete service ticker-collector-service -n bonanza-index --ignore-not-found=true
kubectl delete service orderbook-storage-worker-service -n bonanza-index --ignore-not-found=true
kubectl delete service ticker-storage-worker-service -n bonanza-index --ignore-not-found=true
kubectl delete service orderbook-aggregator-service -n bonanza-index --ignore-not-found=true
kubectl delete service telegram-log-service -n bonanza-index --ignore-not-found=true
kubectl delete service index-calc-fe-service -n bonanza-index --ignore-not-found=true
echo "  ✅ Service 삭제 완료"

# Ingress 삭제
echo ""
echo "🗑️  Ingress 삭제 중..."
kubectl delete ingress -n bonanza-index --all --ignore-not-found=true
echo "  ✅ Ingress 삭제 완료"

echo ""
echo "⏳ 리소스 정리 대기 중 (5초)..."
for i in {5..1}; do
    echo -ne "⏳ 남은 시간: ${i}초\r"
    sleep 1
done
echo -ne "⏳ 대기 종료          \n"

echo ""
echo "✅ 워커 노드 리소스 삭제 상태 확인"
echo "================================"
echo ""

echo "📦 워커 노드 Pod 상태:"
WORKER_NODE_LIST=$(kubectl get nodes -l app-server=true --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null)
if [ ! -z "$WORKER_NODE_LIST" ]; then
    WORKER_PODS=""
    echo "$WORKER_NODE_LIST" | while read -r node; do
        if [ ! -z "$node" ]; then
            NODE_PODS=$(kubectl get pods -n bonanza-index --field-selector=spec.nodeName=$node -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")
            if [ ! -z "$NODE_PODS" ]; then
                WORKER_PODS="$WORKER_PODS $NODE_PODS"
            fi
        fi
    done
    
    if [ -z "$WORKER_PODS" ]; then
        echo "  ✅ 워커 노드에 Pod가 없습니다"
    else
        echo "  ⚠️  남아있는 Pod:"
        echo "$WORKER_NODE_LIST" | while read -r node; do
            if [ ! -z "$node" ]; then
                kubectl get pods -n bonanza-index --field-selector=spec.nodeName=$node 2>/dev/null || true
            fi
        done
    fi
else
    echo "  워커 노드를 찾을 수 없습니다"
fi

echo ""
echo "🔍 서비스 상태:"
WORKER_SVC=$(kubectl get svc -n bonanza-index -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | grep -E "(index|orderbook|ticker|telegram)" || echo "")
if [ -z "$WORKER_SVC" ]; then
    echo "  ✅ 워커 노드 서비스가 모두 삭제되었습니다"
else
    echo "  ⚠️  남아있는 서비스:"
    kubectl get svc -n bonanza-index | grep -E "(index|orderbook|ticker|telegram)"
fi

echo ""
echo "📡 Ingress 상태:"
INGRESS=$(kubectl get ingress -n bonanza-index -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")
if [ -z "$INGRESS" ]; then
    echo "  ✅ Ingress가 삭제되었습니다"
else
    echo "  ⚠️  남아있는 Ingress:"
    kubectl get ingress -n bonanza-index
fi

echo ""
echo "================================"
echo "✅ 워커 노드 리소스 삭제 완료!"
echo "================================"
echo ""
echo "💡 참고사항:"
echo "  - 마스터 노드의 리소스(QuestDB, Redis, MariaDB, Nginx)는 유지됩니다"
echo "  - Namespace 'bonanza-index'는 유지됩니다"
echo "  - ConfigMap 'bonanza-common-config'는 유지됩니다"
echo "  - Secret 'bonanza-secrets'는 유지됩니다"
echo ""
echo "💡 마스터 노드 리소스도 삭제하려면:"
echo "  ./k8s/scripts/delete-master.sh"
echo ""
echo "💡 전체 시스템 재배포:"
echo "  ./k8s/scripts/deploy-master.sh"
echo "  ./k8s/scripts/deploy-worker.sh"
echo ""


