#!/bin/bash

# 백엔드 서버 상태 확인 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"

echo "🔍 백엔드 서버 상태 확인"
echo "================================"
echo ""

# index-endpoint Pod 찾기
ENDPOINT_POD=$(kubectl get pods -n "$NAMESPACE" -l app=index-endpoint -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$ENDPOINT_POD" ]; then
    echo "❌ index-endpoint Pod를 찾을 수 없습니다"
    exit 1
fi

echo "📋 Pod: $ENDPOINT_POD"
echo ""

# 1. 서버 시작 메시지 확인
echo "1️⃣  서버 시작 메시지 확인:"
echo "--------------------------------"
kubectl logs "$ENDPOINT_POD" -n "$NAMESPACE" --tail=100 2>/dev/null | grep -E "서버 실행|STOMP|WebSocket|SERVER_PORT|listen|초기화 완료" || echo "   서버 시작 메시지를 찾을 수 없습니다"
echo ""

# 2. 최근 에러 확인
echo "2️⃣  최근 에러 확인:"
echo "--------------------------------"
kubectl logs "$ENDPOINT_POD" -n "$NAMESPACE" --tail=50 2>/dev/null | grep -i "error\|fail\|exception" | tail -10 || echo "   최근 에러 없음"
echo ""

# 3. 포트 리스닝 확인
echo "3️⃣  포트 3009 리스닝 확인:"
echo "--------------------------------"
LISTENING=$(kubectl exec "$ENDPOINT_POD" -n "$NAMESPACE" -- sh -c "netstat -tlnp 2>/dev/null | grep :3009 || ss -tlnp 2>/dev/null | grep :3009 || echo 'NOT_FOUND'" 2>/dev/null || echo "NOT_FOUND")
if [[ "$LISTENING" == *"NOT_FOUND"* ]] || [ -z "$LISTENING" ]; then
    echo "   ❌ 포트 3009에서 리스닝하지 않습니다"
else
    echo "   ✅ 포트 3009 리스닝 중:"
    echo "   $LISTENING"
fi
echo ""

# 4. 프로세스 확인
echo "4️⃣  Node.js 프로세스 확인:"
echo "--------------------------------"
PROCESSES=$(kubectl exec "$ENDPOINT_POD" -n "$NAMESPACE" -- sh -c "ps aux | grep node | grep -v grep || echo 'NOT_FOUND'" 2>/dev/null || echo "NOT_FOUND")
if [[ "$PROCESSES" == *"NOT_FOUND"* ]] || [ -z "$PROCESSES" ]; then
    echo "   ❌ Node.js 프로세스를 찾을 수 없습니다"
else
    echo "   ✅ Node.js 프로세스 실행 중:"
    echo "   $PROCESSES" | head -3
fi
echo ""

# 5. 전체 로그 확인 (최근 20줄)
echo "5️⃣  최근 로그 (전체):"
echo "--------------------------------"
kubectl logs "$ENDPOINT_POD" -n "$NAMESPACE" --tail=20 2>/dev/null || echo "   로그를 가져올 수 없습니다"
echo ""

echo "================================"
echo "💡 해결 방법"
echo "================================"
echo ""

if [[ "$LISTENING" == *"NOT_FOUND"* ]]; then
    echo "1. 서버가 포트 3009에서 리스닝하지 않습니다."
    echo "   - 서버가 제대로 시작되지 않았을 수 있습니다"
    echo "   - Pod 로그를 확인하여 초기화 에러가 있는지 확인하세요"
    echo "   - Pod 재시작: kubectl delete pod $ENDPOINT_POD -n $NAMESPACE"
    echo ""
fi

echo "2. Pod 로그 전체 확인:"
echo "   kubectl logs $ENDPOINT_POD -n $NAMESPACE --tail=100"
echo ""
echo "3. Pod 상세 정보 확인:"
echo "   kubectl describe pod $ENDPOINT_POD -n $NAMESPACE"
echo ""

echo "================================"
echo "✅ 확인 완료"
echo "================================"
echo ""

