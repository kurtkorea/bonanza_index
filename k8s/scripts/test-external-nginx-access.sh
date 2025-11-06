#!/bin/bash

# 외부에서 nginx 접근 테스트 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"

echo "🔍 외부에서 nginx 접근 테스트"
echo "================================"
echo ""

# nginx Service 정보 확인
NGINX_NODEPORT=$(kubectl get svc nginx-service -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "")
NGINX_NODE=$(kubectl get pods -n "$NAMESPACE" -l app=nginx -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || echo "")

if [ -z "$NGINX_NODEPORT" ]; then
    echo "❌ nginx Service NodePort를 찾을 수 없습니다"
    exit 1
fi

echo "✅ nginx NodePort: $NGINX_NODEPORT"
echo "✅ nginx Pod 노드: $NGINX_NODE"
echo ""

# 노드 IP 확인
MASTER_IP="121.88.4.53"
WORKER_IP="121.88.4.57"

echo "📋 접근 가능한 URL:"
echo "--------------------------------"
echo "   마스터 노드: http://$MASTER_IP:$NGINX_NODEPORT/"
echo "   워커 노드: http://$WORKER_IP:$NGINX_NODEPORT/"
echo ""

# NodePort Service 상태 확인
echo "0️⃣  nginx Service NodePort 상태 확인:"
echo "--------------------------------"
SERVICE_INFO=$(kubectl get svc nginx-service -n "$NAMESPACE" -o jsonpath='{.spec.type}{"\t"}{.spec.ports[0].nodePort}{"\t"}{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
echo "   Service 타입 및 NodePort:"
kubectl get svc nginx-service -n "$NAMESPACE" -o wide
echo ""

# 1. 마스터 노드에서 curl 테스트
echo "1️⃣  마스터 노드에서 외부 접근 테스트:"
echo "--------------------------------"
echo "   마스터 노드 ($MASTER_IP:$NGINX_NODEPORT) 접근 테스트:"
MASTER_TEST=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://$MASTER_IP:$NGINX_NODEPORT/ 2>&1)
MASTER_EXIT=$?

if [ "$MASTER_EXIT" -ne 0 ] || [[ "$MASTER_TEST" == *"000"* ]] || [[ "$MASTER_TEST" == *"FAIL"* ]]; then
    echo "   ❌ 연결 실패"
    echo "   오류 상세:"
    curl -v --connect-timeout 5 http://$MASTER_IP:$NGINX_NODEPORT/ 2>&1 | grep -E "Connected|Connection|timeout|refused|Failed" | head -3 || echo "   연결 시도 실패"
    echo ""
    echo "   💡 가능한 원인:"
    echo "   - 방화벽이 포트 $NGINX_NODEPORT를 차단하고 있음"
    echo "   - NodePort가 제대로 설정되지 않음"
    echo "   - 네트워크 라우팅 문제"
elif [ "$MASTER_TEST" = "200" ]; then
    echo "   ✅ HTTP 200 응답 성공"
    echo ""
    echo "   응답 내용 일부:"
    curl -s --connect-timeout 5 http://$MASTER_IP:$NGINX_NODEPORT/ 2>/dev/null | head -5 || echo "   응답 확인 실패"
elif [[ "$MASTER_TEST" =~ ^[0-9]{3}$ ]]; then
    echo "   ⚠️  HTTP 응답 코드: $MASTER_TEST"
    if [ "$MASTER_TEST" = "502" ]; then
        echo "   💡 502 Bad Gateway - nginx는 실행 중이지만 백엔드 연결 실패"
    fi
else
    echo "   ⚠️  예상치 못한 응답: $MASTER_TEST"
fi
echo ""

# 2. 워커 노드에서 curl 테스트 (가능한 경우)
echo "2️⃣  워커 노드에서 외부 접근 테스트:"
echo "--------------------------------"
echo "   워커 노드 ($WORKER_IP:$NGINX_NODEPORT) 접근 테스트:"
WORKER_TEST=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://$WORKER_IP:$NGINX_NODEPORT/ 2>&1)
WORKER_EXIT=$?

if [ "$WORKER_EXIT" -ne 0 ] || [[ "$WORKER_TEST" == *"000"* ]] || [[ "$WORKER_TEST" == *"FAIL"* ]]; then
    echo "   ❌ 연결 실패"
    echo "   오류 상세:"
    curl -v --connect-timeout 5 http://$WORKER_IP:$NGINX_NODEPORT/ 2>&1 | grep -E "Connected|Connection|timeout|refused|Failed" | head -3 || echo "   연결 시도 실패"
    echo ""
    echo "   💡 워커 노드는 WSL2이므로:"
    echo "   - Windows 방화벽이 포트를 차단할 수 있음"
    echo "   - WSL2 네트워크 설정 문제일 수 있음"
    echo "   - 마스터 노드 IP로 접근하는 것이 더 안정적일 수 있음"
elif [ "$WORKER_TEST" = "200" ]; then
    echo "   ✅ HTTP 200 응답 성공"
    echo ""
    echo "   응답 내용 일부:"
    curl -s --connect-timeout 5 http://$WORKER_IP:$NGINX_NODEPORT/ 2>/dev/null | head -5 || echo "   응답 확인 실패"
elif [[ "$WORKER_TEST" =~ ^[0-9]{3}$ ]]; then
    echo "   ⚠️  HTTP 응답 코드: $WORKER_TEST"
    if [ "$WORKER_TEST" = "502" ]; then
        echo "   💡 502 Bad Gateway - nginx는 실행 중이지만 백엔드 연결 실패"
    fi
else
    echo "   ⚠️  예상치 못한 응답: $WORKER_TEST"
fi
echo ""

# 3. nginx Pod에서 직접 요청 테스트
echo "3️⃣  nginx Pod 내부에서 직접 요청 테스트:"
echo "--------------------------------"
NGINX_POD=$(kubectl get pods -n "$NAMESPACE" -l app=nginx -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ ! -z "$NGINX_POD" ]; then
    NGINX_SERVICE_IP=$(kubectl get svc nginx-service -n "$NAMESPACE" -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
    if [ ! -z "$NGINX_SERVICE_IP" ]; then
        POD_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 wget -q -O- http://$NGINX_SERVICE_IP:7600/ 2>&1 | head -3 || echo 'FAIL'" 2>/dev/null || echo "FAIL")
        if [[ "$POD_TEST" == *"<!doctype html>"* ]] || [[ "$POD_TEST" == *"INDEX CALC"* ]]; then
            echo "   ✅ Pod 내부 요청 성공 (index-calc-fe 프론트엔드 반환)"
        else
            echo "   ⚠️  Pod 내부 요청 결과: $POD_TEST"
        fi
    fi
fi
echo ""

# 4. 최근 access.log 확인
echo "4️⃣  최근 nginx access.log 확인:"
echo "--------------------------------"
if [ ! -z "$NGINX_POD" ]; then
    ACCESS_LOG=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- tail -n 5 /var/log/nginx/access.log 2>/dev/null || echo "")
    if [ ! -z "$ACCESS_LOG" ]; then
        echo "   최근 요청:"
        echo "$ACCESS_LOG" | while read -r line; do
            if [ ! -z "$line" ]; then
                echo "   $line"
            fi
        done
    else
        echo "   최근 요청 없음"
    fi
fi
echo ""

# 5. NodePort 포트 확인
echo "5️⃣  NodePort 포트 상태 확인:"
echo "--------------------------------"
echo "   마스터 노드에서 포트 $NGINX_NODEPORT 리스닝 확인:"
if command -v netstat >/dev/null 2>&1; then
    MASTER_PORT=$(netstat -tlnp 2>/dev/null | grep ":$NGINX_NODEPORT " || echo "")
elif command -v ss >/dev/null 2>&1; then
    MASTER_PORT=$(ss -tlnp 2>/dev/null | grep ":$NGINX_NODEPORT " || echo "")
else
    MASTER_PORT=""
fi

if [ ! -z "$MASTER_PORT" ]; then
    echo "   ✅ 포트 $NGINX_NODEPORT가 리스닝 중입니다"
    echo "   $MASTER_PORT" | head -1
else
    echo "   ⚠️  포트 $NGINX_NODEPORT 리스닝 상태 확인 불가"
    echo "   💡 kube-proxy가 NodePort를 처리합니다"
fi
echo ""

# 6. 해결 방법 제시
echo "================================"
echo "💡 해결 방법"
echo "================================"
echo ""

if [[ "$MASTER_TEST" =~ ^200$ ]] || [[ "$WORKER_TEST" =~ ^200$ ]]; then
    echo "✅ 외부 접근이 정상적으로 작동하고 있습니다!"
    echo ""
    echo "   브라우저에서 접근:"
    if [ "$MASTER_TEST" = "200" ]; then
        echo "   - http://$MASTER_IP:$NGINX_NODEPORT/"
    fi
    if [ "$WORKER_TEST" = "200" ]; then
        echo "   - http://$WORKER_IP:$NGINX_NODEPORT/"
    fi
    echo ""
    echo "   💡 여전히 502 에러가 발생한다면:"
    echo "   1. 브라우저 캐시 삭제 (Ctrl+Shift+Delete)"
    echo "   2. 시크릿 모드에서 접근 시도"
    echo "   3. 다른 브라우저에서 접근 시도"
elif [ "$MASTER_TEST" = "502" ] || [ "$WORKER_TEST" = "502" ]; then
    echo "⚠️  502 Bad Gateway 에러가 발생하고 있습니다"
    echo ""
    echo "   원인: nginx는 실행 중이지만 index-calc-fe에 연결하지 못하고 있습니다"
    echo ""
    echo "   해결 방법:"
    echo "   1. index-calc-fe Pod 상태 확인:"
    echo "      kubectl get pods -n $NAMESPACE -l app=index-calc-fe"
    echo ""
    echo "   2. index-calc-fe Pod 재시작:"
    echo "      kubectl delete pod -n $NAMESPACE -l app=index-calc-fe"
    echo ""
    echo "   3. nginx Pod 재시작:"
    echo "      kubectl delete pod $NGINX_POD -n $NAMESPACE"
    echo ""
    echo "   4. 상세 진단:"
    echo "      ./diagnose-502-error.sh"
elif [[ "$MASTER_TEST" == *"000"* ]] || [[ "$MASTER_TEST" == *"FAIL"* ]] || [[ "$WORKER_TEST" == *"000"* ]] || [[ "$WORKER_TEST" == *"FAIL"* ]]; then
    echo "❌ 외부 접근이 실패하고 있습니다"
    echo ""
    echo "   원인:"
    echo "   - 방화벽이 NodePort ($NGINX_NODEPORT)를 차단하고 있을 수 있습니다"
    echo "   - 네트워크 연결 문제"
    echo "   - kube-proxy가 NodePort를 제대로 처리하지 못할 수 있습니다"
    echo ""
    echo "   해결 방법:"
    echo ""
    echo "   1. 방화벽 확인 (포트 $NGINX_NODEPORT 열기):"
    echo "      # 마스터 노드에서:"
    echo "      sudo firewall-cmd --list-ports  # 또는 ufw status"
    echo "      sudo firewall-cmd --add-port=$NGINX_NODEPORT/tcp --permanent"
    echo "      sudo firewall-cmd --reload"
    echo ""
    echo "   2. nginx Service 확인:"
    echo "      kubectl get svc nginx-service -n $NAMESPACE -o yaml"
    echo ""
    echo "   3. kube-proxy 상태 확인 (k3s에서는 내장):"
    echo "      kubectl get pods -n kube-system | grep proxy"
    echo ""
    echo "   4. nginx Pod 상태 확인:"
    echo "      kubectl get pods -n $NAMESPACE -l app=nginx -o wide"
    echo ""
    echo "   5. Pod 내부에서는 정상 작동하므로, 외부 접근만 문제입니다"
    echo "      브라우저에서 직접 접근 시도: http://$MASTER_IP:$NGINX_NODEPORT/"
    echo ""
    echo "   6. 대안: LoadBalancer 또는 Ingress 사용 고려"
else
    echo "⚠️  외부 접근 테스트 결과를 확인하세요"
    echo ""
    echo "   마스터 노드 응답: $MASTER_TEST"
    echo "   워커 노드 응답: $WORKER_TEST"
    echo ""
    echo "   💡 Pod 내부에서는 정상 작동하므로, 외부 접근 설정을 확인하세요"
fi

echo ""
echo "================================"
echo "✅ 테스트 완료"
echo "================================"
echo ""

