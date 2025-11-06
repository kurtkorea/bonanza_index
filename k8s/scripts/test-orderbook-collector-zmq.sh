#!/bin/bash

# orderbook-collector-service ZMQ 연결 테스트 스크립트

echo "🔍 orderbook-collector-service ZMQ 연결 테스트"
echo "================================"
echo ""

# Pod 찾기
POD_NAME=${1:-$(kubectl get pods -n bonanza-index -l app=orderbook-storage-worker --no-headers 2>/dev/null | head -1 | awk '{print $1}' || echo "")}

if [ -z "$POD_NAME" ]; then
    echo "❌ orderbook-storage-worker Pod를 찾을 수 없습니다"
    echo ""
    echo "사용법: $0 [POD_NAME]"
    exit 1
fi

echo "테스트 Pod: $POD_NAME"
echo ""

# Service 확인
echo "1️⃣  orderbook-collector-service 확인:"
echo "--------------------------------"
SERVICE_INFO=$(kubectl get svc -n bonanza-index orderbook-collector-service 2>/dev/null || echo "")
if [ -z "$SERVICE_INFO" ]; then
    echo "   ❌ orderbook-collector-service를 찾을 수 없습니다"
    exit 1
else
    echo "$SERVICE_INFO"
    SERVICE_IP=$(kubectl get svc -n bonanza-index orderbook-collector-service -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
    SERVICE_PORT=$(kubectl get svc -n bonanza-index orderbook-collector-service -o jsonpath='{.spec.ports[?(@.name=="zmq")].port}' 2>/dev/null || echo "")
    if [ -z "$SERVICE_PORT" ]; then
        SERVICE_PORT="5557"
    fi
    echo ""
    echo "   Cluster IP: $SERVICE_IP"
    echo "   ZMQ Port: $SERVICE_PORT"
fi
echo ""

# DNS 조회 테스트
echo "2️⃣  DNS 조회 테스트:"
echo "--------------------------------"
echo "   orderbook-collector-service:"
DNS_RESULT=$(kubectl exec -n bonanza-index "$POD_NAME" -- sh -c "getent hosts orderbook-collector-service 2>&1" 2>/dev/null || echo "FAIL")
if [[ "$DNS_RESULT" == *"orderbook-collector-service"* ]]; then
    echo "      ✅ $DNS_RESULT"
else
    echo "      ❌ DNS 조회 실패: $DNS_RESULT"
fi
echo ""

echo "   orderbook-collector-service.bonanza-index.svc.cluster.local:"
DNS_RESULT_FQDN=$(kubectl exec -n bonanza-index "$POD_NAME" -- sh -c "getent hosts orderbook-collector-service.bonanza-index.svc.cluster.local 2>&1" 2>/dev/null || echo "FAIL")
if [[ "$DNS_RESULT_FQDN" == *"orderbook-collector-service"* ]]; then
    echo "      ✅ $DNS_RESULT_FQDN"
else
    echo "      ❌ DNS 조회 실패: $DNS_RESULT_FQDN"
fi
echo ""

# 포트 연결 테스트 (ZMQ는 TCP 소켓)
echo "3️⃣  TCP 포트 연결 테스트 (ZMQ 5557):"
echo "--------------------------------"
echo "   Service 이름으로 연결 테스트 (orderbook-collector-service:5557):"
CONN_TEST=$(kubectl exec -n bonanza-index "$POD_NAME" -- sh -c "timeout 3 nc -w 1 orderbook-collector-service 5557 2>&1 && echo 'SUCCESS' || echo 'FAIL'" 2>/dev/null || echo "FAIL")
if [[ "$CONN_TEST" == *"SUCCESS"* ]]; then
    echo "      ✅ 연결 성공"
elif [[ "$CONN_TEST" == *"refused"* ]]; then
    echo "      ⚠️  연결 거부됨 (서비스가 실행 중이지 않을 수 있음): $CONN_TEST"
else
    echo "      ❌ 연결 실패: $CONN_TEST"
fi
echo ""

if [ ! -z "$SERVICE_IP" ]; then
    echo "   Service Cluster IP로 연결 테스트 ($SERVICE_IP:5557):"
    CLUSTER_IP_TEST=$(kubectl exec -n bonanza-index "$POD_NAME" -- sh -c "timeout 3 nc -w 1 $SERVICE_IP 5557 2>&1 && echo 'SUCCESS' || echo 'FAIL'" 2>/dev/null || echo "FAIL")
    if [[ "$CLUSTER_IP_TEST" == *"SUCCESS"* ]]; then
        echo "      ✅ 연결 성공"
    elif [[ "$CLUSTER_IP_TEST" == *"refused"* ]]; then
        echo "      ⚠️  연결 거부됨 (서비스가 실행 중이지 않을 수 있음): $CLUSTER_IP_TEST"
    else
        echo "      ❌ 연결 실패: $CLUSTER_IP_TEST"
    fi
    echo ""
fi

# orderbook-collector Pod 확인
echo "4️⃣  orderbook-collector Pod 확인:"
echo "--------------------------------"
COLLECTOR_POD=$(kubectl get pods -n bonanza-index -l app=orderbook-collector --no-headers 2>/dev/null | head -1 | awk '{print $1}' || echo "")
if [ -z "$COLLECTOR_POD" ]; then
    echo "   ⚠️  orderbook-collector Pod를 찾을 수 없습니다"
else
    POD_STATUS=$(kubectl get pod -n bonanza-index "$COLLECTOR_POD" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
    POD_IP=$(kubectl get pod -n bonanza-index "$COLLECTOR_POD" -o jsonpath='{.status.podIP}' 2>/dev/null || echo "")
    echo "   Pod: $COLLECTOR_POD"
    echo "   상태: $POD_STATUS"
    echo "   Pod IP: $POD_IP"
    if [ "$POD_STATUS" = "Running" ]; then
        echo "   ✅ orderbook-collector Pod 실행 중"
    else
        echo "   ⚠️  orderbook-collector Pod가 Running 상태가 아닙니다"
    fi
    
    # Pod IP로 직접 연결 테스트
    if [ ! -z "$POD_IP" ]; then
        echo ""
        echo "   Pod IP로 직접 연결 테스트 ($POD_IP:5557):"
        POD_IP_TEST=$(kubectl exec -n bonanza-index "$POD_NAME" -- sh -c "timeout 3 nc -w 1 $POD_IP 5557 2>&1 && echo 'SUCCESS' || echo 'FAIL'" 2>/dev/null || echo "FAIL")
        if [[ "$POD_IP_TEST" == *"SUCCESS"* ]]; then
            echo "      ✅ 연결 성공"
        elif [[ "$POD_IP_TEST" == *"refused"* ]]; then
            echo "      ⚠️  연결 거부됨 (ZMQ 서버가 포트 5557에서 리스닝하지 않을 수 있음)"
        else
            echo "      ❌ 연결 실패: $POD_IP_TEST"
        fi
    fi
fi
echo ""

# Service Endpoints 확인
echo "5️⃣  Service Endpoints 확인:"
echo "--------------------------------"
ENDPOINTS=$(kubectl get endpoints -n bonanza-index orderbook-collector-service 2>/dev/null || echo "")
if [ -z "$ENDPOINTS" ]; then
    echo "   ⚠️  Endpoints를 찾을 수 없습니다"
else
    echo "$ENDPOINTS"
    ENDPOINT_COUNT=$(kubectl get endpoints -n bonanza-index orderbook-collector-service -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null | wc -w || echo "0")
    if [ "$ENDPOINT_COUNT" -eq 0 ]; then
        echo ""
        echo "   ⚠️  Endpoints에 IP가 없습니다 (Pod가 Ready 상태가 아닐 수 있음)"
    else
        echo ""
        echo "   ✅ Endpoints 존재 ($ENDPOINT_COUNT개)"
    fi
fi
echo ""

# 요약
echo "================================"
echo "💡 요약"
echo "================================"
echo ""
if [[ "$DNS_RESULT" == *"orderbook-collector-service"* ]]; then
    echo "✅ DNS 조회: 정상"
else
    echo "❌ DNS 조회: 실패"
fi

if [[ "$CONN_TEST" == *"SUCCESS"* ]]; then
    echo "✅ TCP 연결: 정상"
elif [[ "$CONN_TEST" == *"refused"* ]]; then
    echo "⚠️  TCP 연결: 거부됨 (ZMQ 서버 확인 필요)"
else
    echo "❌ TCP 연결: 실패"
fi
echo ""
echo "ZMQ 연결이 실패하는 경우:"
echo "1. orderbook-collector Pod가 포트 5557에서 ZMQ를 리스닝하는지 확인"
echo "2. Pod 재시작: kubectl delete pod -n bonanza-index $COLLECTOR_POD"
echo "3. Service 확인: kubectl get svc -n bonanza-index orderbook-collector-service"
echo "4. 로그 확인: kubectl logs -n bonanza-index $COLLECTOR_POD | grep -i zmq"
echo ""

