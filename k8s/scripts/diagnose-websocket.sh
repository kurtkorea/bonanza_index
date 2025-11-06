#!/bin/bash

# WebSocket/SockJS 연결 진단 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"

echo "🔍 WebSocket/SockJS 연결 진단"
echo "================================"
echo ""

# 1. index-endpoint Pod 확인
echo "1️⃣  index-endpoint Pod 상태:"
echo "--------------------------------"
ENDPOINT_POD=$(kubectl get pods -n "$NAMESPACE" -l app=index-endpoint -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$ENDPOINT_POD" ]; then
    echo "   ❌ index-endpoint Pod를 찾을 수 없습니다"
    exit 1
fi

POD_STATUS=$(kubectl get pod "$ENDPOINT_POD" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
POD_READY=$(kubectl get pod "$ENDPOINT_POD" -n "$NAMESPACE" -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "Unknown")
POD_NODE=$(kubectl get pod "$ENDPOINT_POD" -n "$NAMESPACE" -o jsonpath='{.spec.nodeName}' 2>/dev/null || echo "Unknown")

echo "   Pod: $ENDPOINT_POD"
echo "   상태: $POD_STATUS"
echo "   Ready: $POD_READY"
echo "   노드: $POD_NODE"
echo ""

# 2. index-endpoint-service 확인
echo "2️⃣  index-endpoint-service 상태:"
echo "--------------------------------"
SERVICE_IP=$(kubectl get svc index-endpoint-service -n "$NAMESPACE" -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
SERVICE_PORT=$(kubectl get svc index-endpoint-service -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "")

if [ -z "$SERVICE_IP" ]; then
    echo "   ❌ index-endpoint-service를 찾을 수 없습니다"
    exit 1
fi

echo "   Service: index-endpoint-service"
echo "   Cluster IP: $SERVICE_IP"
echo "   Port: $SERVICE_PORT"
echo ""

# Endpoints 확인
ENDPOINTS=$(kubectl get endpoints index-endpoint-service -n "$NAMESPACE" -o jsonpath='{.subsets[0].addresses[*].ip}' 2>/dev/null || echo "")
if [ -z "$ENDPOINTS" ]; then
    echo "   ❌ Service Endpoints가 없습니다"
else
    echo "   ✅ Endpoints: $ENDPOINTS"
fi
echo ""

# 3. nginx Pod 확인
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

# 4. nginx WebSocket 설정 확인
echo "4️⃣  nginx WebSocket 설정 확인:"
echo "--------------------------------"
WS_CONFIG=$(kubectl get configmap nginx-config -n "$NAMESPACE" -o jsonpath='{.data.default\.conf}' 2>/dev/null | grep -A 20 "/proxy/rest/ws" || echo "")
if [ -z "$WS_CONFIG" ]; then
    echo "   ❌ /proxy/rest/ws 설정을 찾을 수 없습니다"
else
    echo "   ✅ WebSocket 설정 존재"
    echo "$WS_CONFIG" | head -10
fi
echo ""

# 5. 백엔드 WebSocket 엔드포인트 테스트
echo "5️⃣  백엔드 WebSocket 엔드포인트 테스트:"
echo "--------------------------------"
echo "   Pod 내부에서 /ws/info 테스트 (SockJS info endpoint):"
INFO_TEST=$(kubectl exec "$ENDPOINT_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- http://localhost:3009/ws/info 2>&1 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$INFO_TEST" == *"FAIL"* ]] || [ -z "$INFO_TEST" ]; then
    echo "   ❌ /ws/info 엔드포인트 접근 실패"
else
    echo "   ✅ /ws/info 응답:"
    echo "   $INFO_TEST" | head -5
fi
echo ""

echo "   Service를 통한 /ws/info 테스트:"
SERVICE_INFO_TEST=$(kubectl exec "$ENDPOINT_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- http://$SERVICE_IP:$SERVICE_PORT/ws/info 2>&1 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$SERVICE_INFO_TEST" == *"FAIL"* ]] || [ -z "$SERVICE_INFO_TEST" ]; then
    echo "   ❌ Service를 통한 /ws/info 접근 실패"
else
    echo "   ✅ Service를 통한 /ws/info 응답:"
    echo "   $SERVICE_INFO_TEST" | head -5
fi
echo ""

# 6. nginx를 통한 WebSocket 연결 테스트
echo "6️⃣  nginx를 통한 WebSocket 연결 테스트:"
echo "--------------------------------"
echo "   nginx Pod에서 /proxy/rest/ws/info 테스트:"
NGINX_INFO_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- http://localhost:7600/proxy/rest/ws/info 2>&1 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$NGINX_INFO_TEST" == *"FAIL"* ]] || [ -z "$NGINX_INFO_TEST" ]; then
    echo "   ❌ nginx를 통한 /proxy/rest/ws/info 접근 실패"
else
    echo "   ✅ nginx를 통한 /proxy/rest/ws/info 응답:"
    echo "   $NGINX_INFO_TEST" | head -5
fi
echo ""

# 7. 백엔드 로그 확인
echo "7️⃣  index-endpoint 최근 로그 (WebSocket 관련):"
echo "--------------------------------"
kubectl logs "$ENDPOINT_POD" -n "$NAMESPACE" --tail=50 2>/dev/null | grep -i "websocket\|sockjs\|stomp\|connected\|disconnected" | tail -10 || echo "   WebSocket 관련 로그 없음"
echo ""

# 8. nginx error.log 확인
echo "8️⃣  nginx error.log 최근 에러 (WebSocket 관련):"
echo "--------------------------------"
kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- tail -n 30 /var/log/nginx/error.log 2>/dev/null | grep -i "websocket\|upgrade\|proxy" | tail -10 || echo "   WebSocket 관련 에러 없음"
echo ""

# 9. 해결 방법 제시
echo "================================"
echo "💡 해결 방법"
echo "================================"
echo ""

if [[ "$INFO_TEST" == *"FAIL"* ]]; then
    echo "1. 백엔드 WebSocket 서버가 시작되지 않았을 수 있습니다."
    echo "   Pod 로그 확인: kubectl logs $ENDPOINT_POD -n $NAMESPACE"
    echo "   Pod 재시작: kubectl delete pod $ENDPOINT_POD -n $NAMESPACE"
elif [[ "$NGINX_INFO_TEST" == *"FAIL"* ]]; then
    echo "1. nginx WebSocket 프록시 설정 문제일 수 있습니다."
    echo "   nginx ConfigMap 확인: kubectl get configmap nginx-config -n $NAMESPACE -o yaml"
    echo "   nginx Pod 재시작: kubectl delete pod $NGINX_POD -n $NAMESPACE"
else
    echo "1. 연결은 성공했지만 데이터가 오지 않는 경우:"
    echo "   - 백엔드에서 메시지를 발행하는지 확인"
    echo "   - 프론트엔드 구독(subscribe)이 올바른지 확인"
    echo "   - 브라우저 개발자 도구의 Network 탭에서 WebSocket 연결 확인"
fi

echo ""
echo "2. 상세 로그 확인:"
echo "   백엔드: kubectl logs $ENDPOINT_POD -n $NAMESPACE --tail=100"
echo "   nginx: ./nginx-log.sh (선택: 2, 1)"
echo ""

echo "================================"
echo "✅ 진단 완료"
echo "================================"
echo ""

