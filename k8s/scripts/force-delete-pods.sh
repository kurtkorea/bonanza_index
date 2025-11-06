#!/bin/bash

# Terminating 상태에서 멈춘 Pod를 강제 삭제하는 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "🔧 Terminating Pod 강제 삭제"
echo "================================"
echo ""

# Namespace 확인
NAMESPACE="bonanza-index"

# Terminating 상태인 Pod 찾기
TERMINATING_PODS=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase!=Running,status.phase!=Succeeded --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null | grep -v "^$" || echo "")

if [ -z "$TERMINATING_PODS" ]; then
    echo "✅ Terminating 상태인 Pod가 없습니다"
    exit 0
fi

echo "⚠️  Terminating 상태인 Pod:"
echo "$TERMINATING_PODS" | while read -r pod; do
    if [ ! -z "$pod" ]; then
        STATUS=$(kubectl get pod "$pod" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
        echo "   - $pod ($STATUS)"
    fi
done
echo ""

read -p "이 Pod들을 강제 삭제하시겠습니까? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ 삭제가 취소되었습니다."
    exit 0
fi

echo ""
echo "🗑️  Pod 강제 삭제 중..."
echo ""

for pod in $TERMINATING_PODS; do
    if [ ! -z "$pod" ]; then
        echo "  - $pod 강제 삭제 중..."
        kubectl delete pod "$pod" -n "$NAMESPACE" --grace-period=0 --force 2>/dev/null || echo "    ⚠️  삭제 실패 (이미 삭제되었을 수 있음)"
    fi
done

echo ""
echo "⏳ 삭제 완료 대기 중 (3초)..."
sleep 3

echo ""
echo "📦 남아있는 Pod 확인:"
REMAINING=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase!=Running,status.phase!=Succeeded --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null | grep -v "^$" || echo "")
if [ -z "$REMAINING" ]; then
    echo "  ✅ 모든 Pod가 정상적으로 삭제되었습니다"
else
    echo "  ⚠️  여전히 남아있는 Pod:"
    echo "$REMAINING" | while read -r pod; do
        if [ ! -z "$pod" ]; then
            kubectl get pod "$pod" -n "$NAMESPACE" 2>/dev/null || true
        fi
    done
    echo ""
    echo "💡 여전히 삭제되지 않는다면 노드를 확인하세요:"
    echo "   kubectl get nodes"
    echo "   kubectl describe pod <pod-name> -n $NAMESPACE"
fi

echo ""
echo "================================"
echo "✅ 강제 삭제 완료"
echo "================================"
echo ""

