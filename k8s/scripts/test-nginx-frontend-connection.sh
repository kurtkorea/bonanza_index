#!/bin/bash

# nginx에서 index-calc-fe 연결 테스트 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"

echo "🔍 nginx → index-calc-fe 연결 테스트"
echo "================================"
echo ""

# nginx Pod 확인
NGINX_POD=$(kubectl get pods -n "$NAMESPACE" -l app=nginx -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$NGINX_POD" ]; then
    echo "❌ nginx Pod를 찾을 수 없습니다"
    exit 1
fi

# index-calc-fe Pod 확인
INDEX_FE_POD=$(kubectl get pods -n "$NAMESPACE" -l app=index-calc-fe -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$INDEX_FE_POD" ]; then
    echo "❌ index-calc-fe Pod를 찾을 수 없습니다"
    exit 1
fi

echo "✅ nginx Pod: $NGINX_POD"
echo "✅ index-calc-fe Pod: $INDEX_FE_POD"
echo ""

# index-calc-fe Pod IP 확인
INDEX_FE_POD_IP=$(kubectl get pod "$INDEX_FE_POD" -n "$NAMESPACE" -o jsonpath='{.status.podIP}' 2>/dev/null || echo "")
echo "📋 index-calc-fe Pod IP: $INDEX_FE_POD_IP"
echo ""

# Service Cluster IP 확인
SERVICE_IP=$(kubectl get svc index-calc-fe-service -n "$NAMESPACE" -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
echo "📋 index-calc-fe-service Cluster IP: $SERVICE_IP"
echo ""

# 1. nginx Pod에서 index-calc-fe Pod IP로 직접 연결 테스트
echo "1️⃣  nginx Pod → index-calc-fe Pod IP 직접 연결 테스트:"
echo "--------------------------------"
if [ ! -z "$INDEX_FE_POD_IP" ]; then
    echo "   Pod IP ($INDEX_FE_POD_IP:80) 연결 테스트:"
    CONN_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 nc -w 1 $INDEX_FE_POD_IP 80 2>&1 && echo 'SUCCESS' || echo 'FAIL'" 2>/dev/null || echo "FAIL")
    if [[ "$CONN_TEST" == *"SUCCESS"* ]]; then
        echo "   ✅ 연결 성공"
    else
        echo "   ❌ 연결 실패: $CONN_TEST"
    fi
    
    echo ""
    echo "   HTTP 응답 테스트:"
    HTTP_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- http://$INDEX_FE_POD_IP:80 2>&1 | head -5 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
    if [[ "$HTTP_TEST" == *"FAIL"* ]] || [ -z "$HTTP_TEST" ]; then
        echo "   ❌ HTTP 응답 실패"
    else
        echo "   ✅ HTTP 응답 성공 (일부):"
        echo "   $HTTP_TEST" | head -3
    fi
else
    echo "   ❌ Pod IP를 찾을 수 없습니다"
fi
echo ""

# 2. nginx Pod에서 Service Cluster IP로 연결 테스트
echo "2️⃣  nginx Pod → index-calc-fe-service Cluster IP 연결 테스트:"
echo "--------------------------------"
if [ ! -z "$SERVICE_IP" ]; then
    echo "   Service IP ($SERVICE_IP:80) 연결 테스트:"
    CONN_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 nc -w 1 $SERVICE_IP 80 2>&1 && echo 'SUCCESS' || echo 'FAIL'" 2>/dev/null || echo "FAIL")
    if [[ "$CONN_TEST" == *"SUCCESS"* ]]; then
        echo "   ✅ 연결 성공"
    else
        echo "   ❌ 연결 실패: $CONN_TEST"
    fi
    
    echo ""
    echo "   HTTP 응답 테스트:"
    HTTP_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- http://$SERVICE_IP:80 2>&1 | head -5 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
    if [[ "$HTTP_TEST" == *"FAIL"* ]] || [ -z "$HTTP_TEST" ]; then
        echo "   ❌ HTTP 응답 실패"
    else
        echo "   ✅ HTTP 응답 성공 (일부):"
        echo "   $HTTP_TEST" | head -3
    fi
else
    echo "   ❌ Service IP를 찾을 수 없습니다"
fi
echo ""

# 3. nginx Pod에서 Service DNS로 연결 테스트
echo "3️⃣  nginx Pod → index-calc-fe-service DNS 연결 테스트:"
echo "--------------------------------"
echo "   Service DNS (index-calc-fe-service.bonanza-index.svc.cluster.local:80) 연결 테스트:"
DNS_CONN_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 nc -w 1 index-calc-fe-service.bonanza-index.svc.cluster.local 80 2>&1 && echo 'SUCCESS' || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$DNS_CONN_TEST" == *"SUCCESS"* ]]; then
    echo "   ✅ 연결 성공"
else
    echo "   ❌ 연결 실패: $DNS_CONN_TEST"
fi

echo ""
echo "   HTTP 응답 테스트:"
DNS_HTTP_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- http://index-calc-fe-service.bonanza-index.svc.cluster.local:80 2>&1 | head -5 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$DNS_HTTP_TEST" == *"FAIL"* ]] || [ -z "$DNS_HTTP_TEST" ]; then
    echo "   ❌ HTTP 응답 실패"
else
    echo "   ✅ HTTP 응답 성공 (일부):"
    echo "   $DNS_HTTP_TEST" | head -3
fi
echo ""

# 4. index-calc-fe Pod 내부에서 직접 응답 테스트
echo "4️⃣  index-calc-fe Pod 내부 응답 테스트:"
echo "--------------------------------"
echo "   Pod 내부에서 localhost:80 응답 테스트:"
POD_HTTP_TEST=$(kubectl exec "$INDEX_FE_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- http://localhost:80 2>&1 | head -5 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$POD_HTTP_TEST" == *"FAIL"* ]] || [ -z "$POD_HTTP_TEST" ]; then
    echo "   ❌ Pod 내부 HTTP 응답 실패"
    echo "   💡 index-calc-fe Pod의 nginx가 실행되지 않았을 수 있습니다"
else
    echo "   ✅ Pod 내부 HTTP 응답 성공 (일부):"
    echo "   $POD_HTTP_TEST" | head -3
fi
echo ""

# 5. nginx Pod에서 실제 프록시 요청 테스트
echo "5️⃣  nginx Pod에서 프록시 요청 테스트:"
echo "--------------------------------"
echo "   nginx 내부에서 index-calc-fe-service로 프록시 요청:"
NGINX_PROXY_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- --header='Host: localhost' http://index-calc-fe-service.bonanza-index.svc.cluster.local:80 2>&1 | head -5 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$NGINX_PROXY_TEST" == *"FAIL"* ]] || [ -z "$NGINX_PROXY_TEST" ]; then
    echo "   ❌ 프록시 요청 실패"
else
    echo "   ✅ 프록시 요청 성공 (일부):"
    echo "   $NGINX_PROXY_TEST" | head -3
fi
echo ""

# 6. nginx 설정 확인
echo "6️⃣  nginx 설정 확인:"
echo "--------------------------------"
echo "   nginx ConfigMap의 frontend_upstream 설정:"
kubectl get configmap nginx-config -n "$NAMESPACE" -o jsonpath='{.data.default\.conf}' 2>/dev/null | grep -A 10 "frontend_upstream" || echo "   설정을 찾을 수 없습니다"
echo ""

echo "================================"
echo "✅ 연결 테스트 완료"
echo "================================"
echo ""

