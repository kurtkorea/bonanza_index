#!/bin/bash

# 프론트엔드 WebSocket 연결 테스트 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"
NGINX_NODEPORT="30076"
MASTER_IP="121.88.4.57"

echo "🔍 프론트엔드 WebSocket 연결 테스트"
echo "================================"
echo ""

# 1. nginx를 통한 /ws/info 테스트
echo "1️⃣  nginx를 통한 /proxy/rest/ws/info 테스트:"
echo "--------------------------------"
INFO_RESPONSE=$(curl -s "http://${MASTER_IP}:${NGINX_NODEPORT}/proxy/rest/ws/info?t=$(date +%s)" 2>&1 || echo "FAIL")
if [[ "$INFO_RESPONSE" == *"websocket"* ]] || [[ "$INFO_RESPONSE" == *"websocket":true* ]]; then
    echo "   ✅ /ws/info 응답 성공:"
    echo "   $INFO_RESPONSE" | head -3
else
    echo "   ❌ /ws/info 응답 실패:"
    echo "   $INFO_RESPONSE"
fi
echo ""

# 2. index-endpoint Pod 로그에서 최근 연결 확인
echo "2️⃣  최근 WebSocket 연결 상태:"
echo "--------------------------------"
ENDPOINT_POD=$(kubectl get pods -n "$NAMESPACE" -l app=index-endpoint -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ ! -z "$ENDPOINT_POD" ]; then
    echo "   최근 연결/구독 로그:"
    kubectl logs "$ENDPOINT_POD" -n "$NAMESPACE" --tail=20 2>/dev/null | grep -E "Client connected|Client subscribed|Client disconnected" | tail -5 || echo "   관련 로그 없음"
else
    echo "   ⚠️  index-endpoint Pod를 찾을 수 없습니다"
fi
echo ""

# 3. nginx error.log 확인
echo "3️⃣  nginx error.log 최근 에러:"
echo "--------------------------------"
NGINX_POD=$(kubectl get pods -n "$NAMESPACE" -l app=nginx -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ ! -z "$NGINX_POD" ]; then
    kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- tail -n 20 /var/log/nginx/error.log 2>/dev/null | grep -i "ws\|websocket\|proxy" | tail -5 || echo "   최근 WebSocket 관련 에러 없음"
else
    echo "   ⚠️  nginx Pod를 찾을 수 없습니다"
fi
echo ""

echo "================================"
echo "💡 확인 사항"
echo "================================"
echo ""
echo "1. 브라우저 개발자 도구에서 확인:"
echo "   - Network 탭 → WS 필터 → /proxy/rest/ws 경로 확인"
echo "   - 연결이 '101 Switching Protocols'로 업그레이드되는지 확인"
echo "   - Messages 탭에서 메시지 송수신 확인"
echo ""
echo "2. 애플리케이션 동작 확인:"
echo "   - WebSocket을 통해 데이터가 수신되는지 확인"
echo "   - 브라우저 콘솔에서 WebSocket 관련 에러 확인"
echo ""
echo "3. SockJS 동작:"
echo "   - SockJS는 여러 전송 방식을 시도합니다"
echo "   - 일부 방식이 실패해도 다른 방식으로 자동 재시도합니다"
echo "   - 최종적으로 연결이 성공하면 정상입니다"
echo ""

echo "================================"
echo "✅ 테스트 완료"
echo "================================"
echo ""

