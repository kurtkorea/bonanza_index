#!/bin/bash

# WebSocket 500 에러 진단 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"

echo "🔍 WebSocket 500 에러 진단"
echo "================================"
echo ""

# nginx Pod 확인
NGINX_POD=$(kubectl get pods -n "$NAMESPACE" -l app=nginx -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$NGINX_POD" ]; then
    echo "❌ nginx Pod를 찾을 수 없습니다"
    exit 1
fi

# index-endpoint Pod 확인
ENDPOINT_POD=$(kubectl get pods -n "$NAMESPACE" -l app=index-endpoint -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$ENDPOINT_POD" ]; then
    echo "❌ index-endpoint Pod를 찾을 수 없습니다"
    exit 1
fi

echo "✅ nginx Pod: $NGINX_POD"
echo "✅ index-endpoint Pod: $ENDPOINT_POD"
echo ""

# 1. nginx error.log 최근 에러 확인
echo "1️⃣  nginx error.log 최근 에러:"
echo "--------------------------------"
kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- tail -n 30 /var/log/nginx/error.log 2>/dev/null | grep -i "500\|error\|proxy\|ws" | tail -15 || echo "   최근 에러 없음"
echo ""

# 2. nginx access.log 최근 요청 확인
echo "2️⃣  nginx access.log 최근 요청 (/proxy/rest/ws):"
echo "--------------------------------"
kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- tail -n 20 /var/log/nginx/access.log 2>/dev/null | grep "/proxy/rest/ws" | tail -10 || echo "   최근 요청 없음"
echo ""

# 3. 백엔드 직접 테스트
echo "3️⃣  백엔드 /ws/info 직접 테스트:"
echo "--------------------------------"
SERVICE_IP=$(kubectl get svc index-endpoint-service -n "$NAMESPACE" -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
if [ ! -z "$SERVICE_IP" ]; then
    echo "   Service Cluster IP로 테스트 ($SERVICE_IP:3009/ws/info):"
    BACKEND_TEST=$(kubectl exec "$ENDPOINT_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- http://$SERVICE_IP:3009/ws/info 2>&1 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
    if [[ "$BACKEND_TEST" == *"FAIL"* ]] || [ -z "$BACKEND_TEST" ]; then
        echo "   ❌ 백엔드 직접 접근 실패"
    else
        echo "   ✅ 백엔드 직접 접근 성공:"
        echo "   $BACKEND_TEST" | head -3
    fi
fi
echo ""

# 4. nginx를 통한 테스트
echo "4️⃣  nginx를 통한 /proxy/rest/ws/info 테스트:"
echo "--------------------------------"
NGINX_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- 'http://localhost:7600/proxy/rest/ws/info?t=1234567890' 2>&1 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$NGINX_TEST" == *"FAIL"* ]] || [ -z "$NGINX_TEST" ]; then
    echo "   ❌ nginx를 통한 접근 실패"
    echo "   오류 상세:"
    kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "wget -O- 'http://localhost:7600/proxy/rest/ws/info?t=1234567890' 2>&1" 2>/dev/null | tail -5 || echo "   확인 불가"
else
    echo "   ✅ nginx를 통한 접근 성공:"
    echo "   $NGINX_TEST" | head -3
fi
echo ""

# 5. 백엔드 로그 확인
echo "5️⃣  index-endpoint 최근 로그:"
echo "--------------------------------"
kubectl logs "$ENDPOINT_POD" -n "$NAMESPACE" --tail=30 2>/dev/null | tail -15 || echo "   로그 없음"
echo ""

# 6. nginx 설정 확인
echo "6️⃣  nginx WebSocket 설정 확인:"
echo "--------------------------------"
WS_CONFIG=$(kubectl get configmap nginx-config -n "$NAMESPACE" -o jsonpath='{.data.default\.conf}' 2>/dev/null | grep -A 25 "/proxy/rest/ws" || echo "")
if [ ! -z "$WS_CONFIG" ]; then
    echo "$WS_CONFIG" | head -20
else
    echo "   ❌ 설정을 찾을 수 없습니다"
fi
echo ""

# 7. 해결 방법 제시
echo "================================"
echo "💡 해결 방법"
echo "================================"
echo ""

if [[ "$NGINX_TEST" == *"500"* ]] || [[ "$NGINX_TEST" == *"Internal Server Error"* ]]; then
    echo "1. 500 Internal Server Error가 발생하고 있습니다."
    echo "   - 백엔드에서 오류가 발생했을 수 있습니다"
    echo "   - nginx rewrite 규칙이 올바르지 않을 수 있습니다"
    echo ""
    echo "2. 백엔드 로그 확인:"
    echo "   kubectl logs $ENDPOINT_POD -n $NAMESPACE --tail=50"
    echo ""
    echo "3. nginx 설정 확인:"
    echo "   kubectl get configmap nginx-config -n $NAMESPACE -o yaml | grep -A 30 '/proxy/rest/ws'"
    echo ""
    echo "4. nginx Pod 재시작:"
    echo "   kubectl delete pod $NGINX_POD -n $NAMESPACE"
elif [[ "$NGINX_TEST" == *"FAIL"* ]]; then
    echo "1. nginx를 통한 접근이 실패하고 있습니다."
    echo "   - DNS 해결 문제일 수 있습니다"
    echo "   - 네트워크 연결 문제일 수 있습니다"
    echo ""
    echo "2. nginx error.log 확인:"
    echo "   ./nginx-log.sh (선택: 2, 1)"
    echo ""
    echo "3. nginx 설정 재적용:"
    echo "   kubectl apply -f k8s/nginx/configmap.yaml"
    echo "   kubectl delete pod $NGINX_POD -n $NAMESPACE"
else
    echo "1. 연결은 성공했지만 500 에러가 발생하는 경우:"
    echo "   - 백엔드 애플리케이션 오류일 수 있습니다"
    echo "   - 백엔드 로그를 확인하세요"
fi

echo ""
echo "================================"
echo "✅ 진단 완료"
echo "================================"
echo ""

