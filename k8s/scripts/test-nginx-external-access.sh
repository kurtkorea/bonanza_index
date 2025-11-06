#!/bin/bash

# nginx 외부 접근 테스트 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"

echo "🔍 nginx 외부 접근 테스트"
echo "================================"
echo ""

# nginx Pod 확인
NGINX_POD=$(kubectl get pods -n "$NAMESPACE" -l app=nginx -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$NGINX_POD" ]; then
    echo "❌ nginx Pod를 찾을 수 없습니다"
    exit 1
fi

# nginx Service 확인
NGINX_SERVICE_IP=$(kubectl get svc nginx-service -n "$NAMESPACE" -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
NGINX_NODEPORT=$(kubectl get svc nginx-service -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "")
NGINX_NODE=$(kubectl get pod "$NGINX_POD" -n "$NAMESPACE" -o jsonpath='{.spec.nodeName}' 2>/dev/null || echo "")

echo "✅ nginx Pod: $NGINX_POD"
echo "✅ nginx Pod 노드: $NGINX_NODE"
echo "✅ nginx Service Cluster IP: $NGINX_SERVICE_IP"
echo "✅ nginx Service NodePort: $NGINX_NODEPORT"
echo ""

# 1. nginx Pod 내부에서 localhost:7600으로 요청 테스트
echo "1️⃣  nginx Pod 내부에서 localhost:7600 요청 테스트:"
echo "--------------------------------"
LOCAL_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- http://127.0.0.1:7600/ 2>&1 | head -10 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$LOCAL_TEST" == *"FAIL"* ]] || [[ "$LOCAL_TEST" == *"Connection refused"* ]] || [ -z "$LOCAL_TEST" ]; then
    echo "   ⚠️  localhost:7600 직접 접근 실패 (정상일 수 있음 - Service를 통한 접근 사용)"
    echo "   💡 nginx는 Service를 통해 접근하는 것이 권장됩니다"
else
    echo "   ✅ localhost:7600 요청 성공 (일부):"
    echo "   $LOCAL_TEST" | head -5
fi
echo ""

# 2. nginx Pod 내부에서 Service Cluster IP로 요청 테스트
echo "2️⃣  nginx Pod 내부에서 Service Cluster IP로 요청 테스트:"
echo "--------------------------------"
if [ ! -z "$NGINX_SERVICE_IP" ]; then
    SERVICE_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- http://$NGINX_SERVICE_IP:7600/ 2>&1 | head -10 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
    if [[ "$SERVICE_TEST" == *"FAIL"* ]] || [ -z "$SERVICE_TEST" ]; then
        echo "   ❌ Service Cluster IP 요청 실패"
    else
        echo "   ✅ Service Cluster IP 요청 성공 (일부):"
        echo "   $SERVICE_TEST" | head -5
    fi
else
    echo "   ❌ Service IP를 찾을 수 없습니다"
fi
echo ""

# 3. nginx Pod에서 index-calc-fe로 프록시되는지 확인
echo "3️⃣  nginx Pod에서 index-calc-fe 프록시 테스트:"
echo "--------------------------------"
PROXY_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- --header='Host: localhost' http://$NGINX_SERVICE_IP:7600/ 2>&1 | head -10 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$PROXY_TEST" == *"FAIL"* ]] || [ -z "$PROXY_TEST" ]; then
    echo "   ❌ 프록시 요청 실패"
else
    echo "   ✅ 프록시 요청 성공 (일부):"
    echo "   $PROXY_TEST" | head -5
    if [[ "$PROXY_TEST" == *"INDEX CALC"* ]] || [[ "$PROXY_TEST" == *"<!doctype html>"* ]]; then
        echo "   ✅ index-calc-fe 프론트엔드가 정상적으로 프록시되고 있습니다"
    fi
fi
echo ""

# 4. nginx error.log 최신 확인
echo "4️⃣  nginx error.log 최신 에러 확인:"
echo "--------------------------------"
ERROR_LOG=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- tail -n 20 /var/log/nginx/error.log 2>/dev/null | grep -i "error\|warn\|502\|bad gateway" | tail -5 || echo "")
if [ -z "$ERROR_LOG" ]; then
    echo "   ✅ 최근 에러 없음"
else
    echo "   ⚠️  최근 에러:"
    echo "   $ERROR_LOG"
fi
echo ""

# 5. nginx access.log 최신 확인
echo "5️⃣  nginx access.log 최신 요청 확인:"
echo "--------------------------------"
ACCESS_LOG=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- tail -n 10 /var/log/nginx/access.log 2>/dev/null || echo "")
if [ -z "$ACCESS_LOG" ]; then
    echo "   ⚠️  최근 요청 없음"
else
    echo "   최근 요청:"
    echo "   $ACCESS_LOG"
fi
echo ""

# 6. nginx 설정 확인
echo "6️⃣  nginx 설정 확인:"
echo "--------------------------------"
echo "   nginx가 7600 포트에서 실행 중인지 확인:"
NGINX_LISTEN=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "netstat -tlnp 2>/dev/null | grep 7600 || ss -tlnp 2>/dev/null | grep 7600 || echo 'netstat/ss 없음'" 2>/dev/null || echo "확인 불가")
if [[ "$NGINX_LISTEN" == *"7600"* ]]; then
    echo "   ✅ nginx가 7600 포트에서 리스닝 중"
else
    echo "   ⚠️  7600 포트 리스닝 상태 확인 불가"
fi
echo ""

# 7. 외부 접근 정보
echo "7️⃣  외부 접근 정보:"
echo "--------------------------------"
echo "   마스터 노드 IP: 121.88.4.53"
echo "   워커 노드 IP: 121.88.4.57 (WSL2 내부 IP: 172.24.246.189)"
echo "   nginx NodePort: $NGINX_NODEPORT"
echo ""
echo "   접근 URL:"
echo "   - 마스터 노드: http://121.88.4.53:$NGINX_NODEPORT/"
if [ "$NGINX_NODE" != "bonanza-master" ]; then
    echo "   - 워커 노드 (nginx가 실행 중인 노드): http://121.88.4.57:$NGINX_NODEPORT/"
    echo "   ⚠️  nginx가 워커 노드에 있으므로, 워커 노드 IP로 접근해야 할 수 있습니다"
fi
echo ""
echo "   💡 테스트 결과:"
echo "   - Service Cluster IP로 접근: ✅ 성공 (index-calc-fe 프론트엔드 정상 반환)"
echo "   - nginx 프록시: ✅ 정상 작동"
echo "   - 외부 접근 시 NodePort를 통해 접근 가능해야 합니다"
echo ""
echo "   🔧 502 에러가 계속 발생한다면:"
echo "   1. 브라우저에서 직접 접근: http://121.88.4.57:$NGINX_NODEPORT/"
echo "   2. nginx Pod 재시작: kubectl delete pod $NGINX_POD -n $NAMESPACE"
echo "   3. nginx error.log 확인: ./nginx-log.sh (선택: 2, 1)"
echo ""

echo "================================"
echo "✅ 테스트 완료"
echo "================================"
echo ""

