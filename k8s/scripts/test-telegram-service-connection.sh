#!/bin/bash

# telegram-log-service 연결 테스트 스크립트

echo "🔍 telegram-log-service 연결 테스트"
echo "================================"
echo ""

# Pod 찾기
POD_NAME=${1:-$(kubectl get pods -n bonanza-index -l app=orderbook-collector --no-headers 2>/dev/null | head -1 | awk '{print $1}' || echo "")}

if [ -z "$POD_NAME" ]; then
    echo "❌ orderbook-collector Pod를 찾을 수 없습니다"
    echo ""
    echo "사용법: $0 [POD_NAME]"
    exit 1
fi

echo "테스트 Pod: $POD_NAME"
echo ""

# Service 확인
echo "1️⃣  telegram-log-service 확인:"
echo "--------------------------------"
SERVICE_INFO=$(kubectl get svc -n bonanza-index telegram-log-service 2>/dev/null || echo "")
if [ -z "$SERVICE_INFO" ]; then
    echo "   ❌ telegram-log-service를 찾을 수 없습니다"
    exit 1
else
    echo "$SERVICE_INFO"
    SERVICE_IP=$(kubectl get svc -n bonanza-index telegram-log-service -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
    SERVICE_PORT=$(kubectl get svc -n bonanza-index telegram-log-service -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "")
    echo ""
    echo "   Cluster IP: $SERVICE_IP"
    echo "   Port: $SERVICE_PORT"
fi
echo ""

# DNS 조회 테스트
echo "2️⃣  DNS 조회 테스트:"
echo "--------------------------------"
echo "   telegram-log-service:"
DNS_RESULT=$(kubectl exec -n bonanza-index "$POD_NAME" -- sh -c "getent hosts telegram-log-service 2>&1" 2>/dev/null || echo "FAIL")
if [[ "$DNS_RESULT" == *"telegram-log-service"* ]]; then
    echo "      ✅ $DNS_RESULT"
else
    echo "      ❌ DNS 조회 실패: $DNS_RESULT"
fi
echo ""

echo "   telegram-log-service.bonanza-index.svc.cluster.local:"
DNS_RESULT_FQDN=$(kubectl exec -n bonanza-index "$POD_NAME" -- sh -c "getent hosts telegram-log-service.bonanza-index.svc.cluster.local 2>&1" 2>/dev/null || echo "FAIL")
if [[ "$DNS_RESULT_FQDN" == *"telegram-log-service"* ]]; then
    echo "      ✅ $DNS_RESULT_FQDN"
else
    echo "      ❌ DNS 조회 실패: $DNS_RESULT_FQDN"
fi
echo ""

# 포트 연결 테스트
echo "3️⃣  포트 연결 테스트:"
echo "--------------------------------"
echo "   Service 이름으로 연결 테스트 (telegram-log-service:3109):"
CONN_TEST=$(kubectl exec -n bonanza-index "$POD_NAME" -- sh -c "timeout 3 nc -w 1 telegram-log-service 3109 2>&1 && echo 'SUCCESS' || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$CONN_TEST" == *"SUCCESS"* ]]; then
    echo "      ✅ 연결 성공"
else
    echo "      ❌ 연결 실패: $CONN_TEST"
fi
echo ""

if [ ! -z "$SERVICE_IP" ] && [ ! -z "$SERVICE_PORT" ]; then
    echo "   Service Cluster IP로 연결 테스트 ($SERVICE_IP:$SERVICE_PORT):"
    CLUSTER_IP_TEST=$(kubectl exec -n bonanza-index "$POD_NAME" -- sh -c "timeout 3 nc -w 1 $SERVICE_IP $SERVICE_PORT 2>&1 && echo 'SUCCESS' || echo 'FAIL'" 2>/dev/null || echo "FAIL")
    if [[ "$CLUSTER_IP_TEST" == *"SUCCESS"* ]]; then
        echo "      ✅ 연결 성공"
    else
        echo "      ❌ 연결 실패: $CLUSTER_IP_TEST"
    fi
    echo ""
fi

# HTTP 연결 테스트
echo "4️⃣  HTTP 연결 테스트:"
echo "--------------------------------"
echo "   GET http://telegram-log-service:3109/health:"
HTTP_TEST=$(kubectl exec -n bonanza-index "$POD_NAME" -- sh -c "wget -q -O- --timeout=3 http://telegram-log-service:3109/health 2>&1 || curl -s --max-time 3 http://telegram-log-service:3109/health 2>&1 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$HTTP_TEST" == *"ok"* ]] || [[ "$HTTP_TEST" == *"status"* ]]; then
    echo "      ✅ HTTP 연결 성공: $HTTP_TEST"
else
    echo "      ❌ HTTP 연결 실패: $HTTP_TEST"
fi
echo ""

# telegram-log Pod 확인
echo "5️⃣  telegram-log Pod 확인:"
echo "--------------------------------"
TELEGRAM_POD=$(kubectl get pods -n bonanza-index -l app=telegram-log --no-headers 2>/dev/null | head -1 | awk '{print $1}' || echo "")
if [ -z "$TELEGRAM_POD" ]; then
    echo "   ⚠️  telegram-log Pod를 찾을 수 없습니다"
else
    POD_STATUS=$(kubectl get pod -n bonanza-index "$TELEGRAM_POD" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
    echo "   Pod: $TELEGRAM_POD"
    echo "   상태: $POD_STATUS"
    if [ "$POD_STATUS" = "Running" ]; then
        echo "   ✅ telegram-log Pod 실행 중"
    else
        echo "   ⚠️  telegram-log Pod가 Running 상태가 아닙니다"
    fi
fi
echo ""

# 요약
echo "================================"
echo "💡 요약"
echo "================================"
echo ""
if [[ "$DNS_RESULT" == *"telegram-log-service"* ]] && [[ "$CONN_TEST" == *"SUCCESS"* ]]; then
    echo "✅ telegram-log-service 연결 정상"
else
    echo "❌ telegram-log-service 연결 실패"
    echo ""
    echo "해결 방법:"
    echo "1. telegram-log Pod 재시작:"
    if [ ! -z "$TELEGRAM_POD" ]; then
        echo "   kubectl delete pod -n bonanza-index $TELEGRAM_POD"
    else
        echo "   kubectl delete pods -n bonanza-index -l app=telegram-log"
    fi
    echo ""
    echo "2. Service 확인:"
    echo "   kubectl get svc -n bonanza-index telegram-log-service"
    echo "   kubectl get endpoints -n bonanza-index telegram-log-service"
fi
echo ""

