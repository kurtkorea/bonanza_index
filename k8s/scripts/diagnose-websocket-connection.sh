#!/bin/bash

# WebSocket 연결 진단 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"

echo "🔍 WebSocket 연결 진단"
echo "================================"
echo ""

# 1. index-endpoint Pod 상태 확인
echo "1️⃣  index-endpoint Pod 상태:"
echo "--------------------------------"
ENDPOINT_POD=$(kubectl get pods -n "$NAMESPACE" -l app=index-endpoint -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$ENDPOINT_POD" ]; then
    echo "   ❌ index-endpoint Pod를 찾을 수 없습니다"
    exit 1
fi
POD_STATUS=$(kubectl get pod "$ENDPOINT_POD" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
POD_READY=$(kubectl get pod "$ENDPOINT_POD" -n "$NAMESPACE" -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "Unknown")
echo "   Pod: $ENDPOINT_POD"
echo "   상태: $POD_STATUS"
echo "   Ready: $POD_READY"
if [ "$POD_STATUS" != "Running" ] || [ "$POD_READY" != "true" ]; then
    echo "   ⚠️  Pod가 Ready 상태가 아닙니다"
fi
echo ""

# 2. 백엔드 /ws/info 엔드포인트 테스트
echo "2️⃣  백엔드 /ws/info 엔드포인트 테스트:"
echo "--------------------------------"
INFO_RESPONSE=$(kubectl exec "$ENDPOINT_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- http://localhost:3009/ws/info 2>&1 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$INFO_RESPONSE" == *"websocket"* ]] || [[ "$INFO_RESPONSE" == *"websocket":true* ]]; then
    echo "   ✅ /ws/info 응답 성공:"
    echo "   $INFO_RESPONSE" | head -3
else
    echo "   ❌ /ws/info 응답 실패:"
    echo "   $INFO_RESPONSE"
fi
echo ""

# 3. nginx Pod 상태 확인
echo "3️⃣  nginx Pod 상태:"
echo "--------------------------------"
NGINX_POD=$(kubectl get pods -n "$NAMESPACE" -l app=nginx -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$NGINX_POD" ]; then
    echo "   ❌ nginx Pod를 찾을 수 없습니다"
    exit 1
fi
NGINX_STATUS=$(kubectl get pod "$NGINX_POD" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
echo "   Pod: $NGINX_POD"
echo "   상태: $NGINX_STATUS"
echo ""

# 4. nginx를 통한 /proxy/rest/ws/info 테스트
echo "4️⃣  nginx를 통한 /proxy/rest/ws/info 테스트:"
echo "--------------------------------"
NGINX_INFO=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- 'http://localhost:7600/proxy/rest/ws/info?t=1234567890' 2>&1 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$NGINX_INFO" == *"websocket"* ]] || [[ "$NGINX_INFO" == *"websocket":true* ]]; then
    echo "   ✅ nginx를 통한 /ws/info 응답 성공:"
    echo "   $NGINX_INFO" | head -3
else
    echo "   ❌ nginx를 통한 /ws/info 응답 실패:"
    echo "   $NGINX_INFO"
fi
echo ""

# 5. nginx error.log 확인
echo "5️⃣  nginx error.log 최근 에러:"
echo "--------------------------------"
kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- tail -n 20 /var/log/nginx/error.log 2>/dev/null | grep -i "ws\|websocket\|proxy\|error" | tail -10 || echo "   최근 에러 없음"
echo ""

# 6. 백엔드 로그 확인
echo "6️⃣  index-endpoint 최근 로그:"
echo "--------------------------------"
kubectl logs "$ENDPOINT_POD" -n "$NAMESPACE" --tail=30 2>/dev/null | grep -i "websocket\|sockjs\|connected\|error" | tail -10 || echo "   관련 로그 없음"
echo ""

# 7. Service Endpoints 확인
echo "7️⃣  index-endpoint-service Endpoints:"
echo "--------------------------------"
ENDPOINTS=$(kubectl get endpoints index-endpoint-service -n "$NAMESPACE" -o jsonpath='{.subsets[0].addresses[*].ip}' 2>/dev/null || echo "")
if [ -z "$ENDPOINTS" ]; then
    echo "   ❌ Endpoints가 없습니다 (Pod가 Ready 상태가 아닐 수 있음)"
else
    echo "   ✅ Endpoints: $ENDPOINTS"
fi
echo ""

echo "================================"
echo "💡 해결 방법"
echo "================================"
echo ""

if [ "$POD_STATUS" != "Running" ] || [ "$POD_READY" != "true" ]; then
    echo "1. index-endpoint Pod가 Ready 상태가 아닙니다."
    echo "   Pod 로그 확인: kubectl logs $ENDPOINT_POD -n $NAMESPACE"
    echo "   Pod 재시작: kubectl delete pod $ENDPOINT_POD -n $NAMESPACE"
    echo ""
fi

if [[ "$INFO_RESPONSE" == *"FAIL"* ]]; then
    echo "2. 백엔드 /ws/info 엔드포인트에 접근할 수 없습니다."
    echo "   백엔드 서버가 제대로 시작되었는지 확인하세요."
    echo "   Pod 로그 확인: kubectl logs $ENDPOINT_POD -n $NAMESPACE"
    echo ""
fi

if [[ "$NGINX_INFO" == *"FAIL"* ]]; then
    echo "3. nginx를 통한 /ws/info 접근에 문제가 있습니다."
    echo "   nginx 설정 확인: kubectl get configmap nginx-config -n $NAMESPACE -o yaml"
    echo "   nginx error.log 확인: kubectl exec $NGINX_POD -n $NAMESPACE -- tail -50 /var/log/nginx/error.log"
    echo "   nginx Pod 재시작: kubectl delete pod $NGINX_POD -n $NAMESPACE"
    echo ""
fi

echo "================================"
echo "✅ 진단 완료"
echo "================================"
echo ""

