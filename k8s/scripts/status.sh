#!/bin/bash

# 스크립트 디렉토리에서 kubeconfig 설정 스크립트 로드
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/kubeconfig-setup.sh" ]; then
    source "$SCRIPT_DIR/kubeconfig-setup.sh"
    if ! setup_kubeconfig; then
        exit 1
    fi
else
    # kubeconfig-setup.sh가 없는 경우 직접 설정
    K3S_CONFIG="/etc/rancher/k3s/k3s.yaml"
    USER_CONFIG="$HOME/.kube/config"
    
    if [ -f "$K3S_CONFIG" ]; then
        mkdir -p "$HOME/.kube"
        if [ ! -f "$USER_CONFIG" ]; then
            sudo cp "$K3S_CONFIG" "$USER_CONFIG"
            sudo chown "$(whoami):$(whoami)" "$USER_CONFIG"
        fi
        export KUBECONFIG="$USER_CONFIG"
    elif [ -f "$USER_CONFIG" ]; then
        export KUBECONFIG="$USER_CONFIG"
    else
        echo "⚠️  kubeconfig를 찾을 수 없습니다"
        echo "   sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config"
        echo "   sudo chown \$USER:\$USER ~/.kube/config"
        exit 1
    fi
    
    if ! kubectl cluster-info &>/dev/null 2>&1; then
        echo "❌ Kubernetes 클러스터에 연결할 수 없습니다"
        exit 1
    fi
fi

echo "🚀 Bonanza Index 배포 상태"
echo "================================"
echo ""

#echo "📦 Pod 상태:"
#kubectl get pods -n bonanza-index
#echo ""

echo "💾 PVC-STORAGE 상태:"
kubectl get pvc -n bonanza-index
echo ""

echo "🔍 서비스 상태:"
kubectl get svc -n bonanza-index
echo ""

#echo "📍 노드별 배치:"
#kubectl get pods -n bonanza-index -o wide --sort-by=.spec.nodeName
#echo ""

echo "🗄️  데이터베이스 Pod (마스터):"
kubectl get pods -n bonanza-index -o wide | grep -E "(questdb|redis|mariadb|nginx)" || echo "데이터베이스 Pod 없음"
echo ""


echo ""
echo "🔧 애플리케이션 Pod (워커):"
kubectl get pods -n bonanza-index -o wide | grep -vE "(questdb|redis|mariadb|nginx)" || echo "애플리케이션 Pod 없음"
echo ""

#echo "📡 Ingress 상태:"
#kubectl get ingress -n bonanza-index 2>/dev/null || echo "Ingress 없음"
#echo ""

# 문제가 있는 Pod 확인
#FAILING_PODS=$(kubectl get pods -n bonanza-index --field-selector=status.phase!=Running,status.phase!=Succeeded -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
#if [ ! -z "$FAILING_PODS" ]; then
#    echo "⚠️  문제가 있는 Pod:"
#    kubectl get pods -n bonanza-index --field-selector=status.phase!=Running,status.phase!=Succeeded
#    echo ""
#    echo "💡 문제 진단:"
#    echo "  kubectl describe pod <pod-name> -n bonanza-index"
#    echo "  kubectl logs <pod-name> -n bonanza-index"
#else
#    echo "✅ 모든 Pod가 정상적으로 실행 중입니다!"
#fi
#echo ""
