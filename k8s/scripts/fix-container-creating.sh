#!/bin/bash

# ContainerCreating 상태에서 멈춘 Pod 문제 해결 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"

echo "🔧 ContainerCreating Pod 문제 해결"
echo "================================"
echo ""

# ContainerCreating 상태인 Pod 찾기
CREATING_PODS=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Pending --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null | grep -v "^$" || echo "")

if [ -z "$CREATING_PODS" ]; then
    echo "✅ ContainerCreating 상태인 Pod가 없습니다"
    exit 0
fi

echo "⚠️  ContainerCreating 상태인 Pod:"
echo "$CREATING_PODS" | while read -r pod; do
    if [ ! -z "$pod" ]; then
        echo "   - $pod"
    fi
done
echo ""

echo "해결 방법 선택:"
echo "   1) Pod 강제 삭제 후 재생성"
echo "   2) 노드 kubelet 재시작 (마스터 노드에서 실행 필요)"
echo "   3) 이미지 수동 Pull"
echo "   4) 진단만 수행"
echo ""
read -p "선택하세요 (1-4): " CHOICE

case $CHOICE in
    1)
        echo ""
        echo "🗑️  Pod 강제 삭제 중..."
        for pod in $CREATING_PODS; do
            if [ ! -z "$pod" ]; then
                echo "  - $pod 삭제 중..."
                kubectl delete pod "$pod" -n "$NAMESPACE" --grace-period=0 --force 2>/dev/null || echo "    ⚠️  삭제 실패"
            fi
        done
        echo ""
        echo "✅ Pod 삭제 완료. Deployment가 자동으로 새 Pod를 생성합니다."
        echo "   잠시 후 상태 확인: kubectl get pods -n $NAMESPACE"
        ;;
    2)
        echo ""
        echo "⚠️  이 작업은 마스터 노드에서 직접 실행해야 합니다."
        echo ""
        echo "마스터 노드에서 다음 명령어를 실행하세요:"
        echo "   sudo systemctl restart k3s"
        echo "   sudo systemctl status k3s"
        echo ""
        echo "또는 kubelet 로그 확인:"
        echo "   sudo journalctl -u k3s -n 100 --no-pager | grep -i error"
        ;;
    3)
        echo ""
        echo "📥 이미지 수동 Pull:"
        FIRST_POD=$(echo "$CREATING_PODS" | head -1)
        if [ ! -z "$FIRST_POD" ]; then
            IMAGE=$(kubectl get pod "$FIRST_POD" -n "$NAMESPACE" -o jsonpath='{.spec.containers[0].image}' 2>/dev/null || echo "")
            if [ ! -z "$IMAGE" ]; then
                echo "   이미지: $IMAGE"
                echo ""
                echo "마스터 노드에서 다음 명령어를 실행하세요:"
                echo "   docker pull $IMAGE"
                echo "   또는"
                echo "   sudo ctr -n k8s.io images pull $IMAGE"
                echo ""
                echo "이미지 로드 후 Pod를 삭제하면 자동으로 재생성됩니다:"
                echo "   kubectl delete pod $FIRST_POD -n $NAMESPACE --grace-period=0 --force"
            fi
        fi
        ;;
    4)
        echo ""
        echo "🔍 진단 정보:"
        FIRST_POD=$(echo "$CREATING_PODS" | head -1)
        if [ ! -z "$FIRST_POD" ]; then
            echo ""
            echo "Pod 이벤트:"
            kubectl get events -n "$NAMESPACE" --field-selector involvedObject.name="$FIRST_POD" --sort-by='.lastTimestamp' | tail -10
            echo ""
            echo "노드 상태:"
            NODE_NAME=$(kubectl get pod "$FIRST_POD" -n "$NAMESPACE" -o jsonpath='{.spec.nodeName}' 2>/dev/null || echo "")
            if [ ! -z "$NODE_NAME" ]; then
                kubectl describe node "$NODE_NAME" | grep -A 5 "Conditions:" || true
            fi
        fi
        ;;
    *)
        echo "❌ 잘못된 선택입니다"
        exit 1
        ;;
esac

echo ""
echo "================================"
echo "✅ 작업 완료"
echo "================================"
echo ""

