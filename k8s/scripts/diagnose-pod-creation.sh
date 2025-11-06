#!/bin/bash

# ContainerCreating 상태에서 멈춘 Pod 진단 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"

echo "🔍 ContainerCreating Pod 진단"
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

# 첫 번째 Pod 상세 진단
FIRST_POD=$(echo "$CREATING_PODS" | head -1)
if [ ! -z "$FIRST_POD" ]; then
    echo "📋 Pod 상세 정보: $FIRST_POD"
    echo "================================"
    echo ""
    
    # Pod describe
    echo "1️⃣  Pod 이벤트 및 상태:"
    echo "--------------------------------"
    kubectl describe pod "$FIRST_POD" -n "$NAMESPACE" 2>/dev/null | grep -A 20 "Events:" || echo "   이벤트 없음"
    echo ""
    
    # 컨테이너 상태
    echo "2️⃣  컨테이너 상태:"
    echo "--------------------------------"
    kubectl get pod "$FIRST_POD" -n "$NAMESPACE" -o jsonpath='{range .status.containerStatuses[*]}{.name}{": "}{.state.waiting.reason}{" - "}{.state.waiting.message}{"\n"}{end}' 2>/dev/null || echo "   상태 정보 없음"
    echo ""
    
    # 이미지 정보
    echo "3️⃣  이미지 정보:"
    echo "--------------------------------"
    kubectl get pod "$FIRST_POD" -n "$NAMESPACE" -o jsonpath='{range .spec.containers[*]}{.name}{": "}{.image}{" (PullPolicy: "}{.imagePullPolicy}{")\n"}{end}' 2>/dev/null || echo "   이미지 정보 없음"
    echo ""
    
    # 볼륨 마운트 확인
    echo "4️⃣  볼륨 마운트 확인:"
    echo "--------------------------------"
    kubectl get pod "$FIRST_POD" -n "$NAMESPACE" -o jsonpath='{range .spec.volumes[*]}{.name}{": "}{.configMap.name}{.persistentVolumeClaim.claimName}{.emptyDir}{"\n"}{end}' 2>/dev/null || echo "   볼륨 정보 없음"
    echo ""
    
    # 노드 리소스 확인
    NODE_NAME=$(kubectl get pod "$FIRST_POD" -n "$NAMESPACE" -o jsonpath='{.spec.nodeName}' 2>/dev/null || echo "")
    if [ ! -z "$NODE_NAME" ]; then
        echo "5️⃣  노드 리소스 ($NODE_NAME):"
        echo "--------------------------------"
        kubectl describe node "$NODE_NAME" 2>/dev/null | grep -A 10 "Allocated resources" || echo "   노드 정보 없음"
        echo ""
        
        echo "6️⃣  노드 kubelet 상태:"
        echo "--------------------------------"
        echo "   노드에서 다음 명령어로 확인:"
        echo "   sudo systemctl status k3s"
        echo "   sudo journalctl -u k3s -n 50 --no-pager"
        echo ""
    fi
    
    # 이미지 pull 상태 확인
    echo "7️⃣  이미지 정보 및 Pull 상태:"
    echo "--------------------------------"
    IMAGE=$(kubectl get pod "$FIRST_POD" -n "$NAMESPACE" -o jsonpath='{.spec.containers[0].image}' 2>/dev/null || echo "")
    IMAGE_PULL_POLICY=$(kubectl get pod "$FIRST_POD" -n "$NAMESPACE" -o jsonpath='{.spec.containers[0].imagePullPolicy}' 2>/dev/null || echo "")
    echo "   이미지: $IMAGE"
    echo "   Pull Policy: $IMAGE_PULL_POLICY"
    echo ""
    echo "   💡 이미지가 로컬에 있는지 확인:"
    echo "      docker images | grep $(echo $IMAGE | cut -d: -f1)"
    echo "      또는"
    echo "      sudo ctr -n k8s.io images list | grep $(echo $IMAGE | cut -d: -f1)"
    echo ""
fi

echo ""
echo "================================"
echo "💡 일반적인 해결 방법"
echo "================================"
echo ""
echo "1. 이미지 Pull 문제:"
echo "   - 이미지가 로컬에 있는지 확인: docker images | grep <image-name>"
echo "   - imagePullPolicy를 IfNotPresent 또는 Never로 변경"
echo ""
echo "2. 볼륨 마운트 문제:"
echo "   - ConfigMap 존재 확인: kubectl get configmap -n $NAMESPACE"
echo "   - PVC 상태 확인: kubectl get pvc -n $NAMESPACE"
echo ""
echo "3. 리소스 부족:"
echo "   - 노드 리소스 확인: kubectl describe node <node-name>"
echo "   - Pod 리소스 요청 확인: kubectl describe pod $FIRST_POD -n $NAMESPACE"
echo ""
echo "4. 강제 삭제 후 재시작:"
echo "   kubectl delete pod $FIRST_POD -n $NAMESPACE --grace-period=0 --force"
echo ""

