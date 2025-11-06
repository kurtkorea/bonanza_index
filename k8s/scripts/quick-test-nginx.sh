#!/bin/bash

# nginx 외부 접근 빠른 테스트

set -e

echo "🔍 nginx 외부 접근 빠른 테스트"
echo "================================"
echo ""

MASTER_IP="121.88.4.53"
WORKER_IP="121.88.4.57"
NODEPORT="30076"

echo "1. 마스터 노드 접근 테스트:"
echo "   curl -v --connect-timeout 5 http://$MASTER_IP:$NODEPORT/ 2>&1 | head -20"
echo ""
curl -v --connect-timeout 5 http://$MASTER_IP:$NODEPORT/ 2>&1 | head -20
echo ""

echo "2. HTTP 상태 코드 확인:"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://$MASTER_IP:$NODEPORT/ 2>&1 || echo "FAIL")
echo "   HTTP 응답 코드: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ 성공! 브라우저에서 접근 가능합니다:"
    echo "   http://$MASTER_IP:$NODEPORT/"
elif [ "$HTTP_CODE" = "502" ]; then
    echo "⚠️  502 Bad Gateway - nginx는 실행 중이지만 백엔드 연결 실패"
    echo "   ./diagnose-502-error.sh 실행 권장"
elif [[ "$HTTP_CODE" == *"000"* ]] || [ "$HTTP_CODE" = "FAIL" ]; then
    echo "❌ 연결 실패 - 방화벽 또는 네트워크 문제"
    echo ""
    echo "   확인 사항:"
    echo "   1. 방화벽 확인: sudo firewall-cmd --list-ports"
    echo "   2. 포트 열기: sudo firewall-cmd --add-port=$NODEPORT/tcp --permanent && sudo firewall-cmd --reload"
    echo "   3. nginx Service 확인: kubectl get svc nginx-service -n bonanza-index"
else
    echo "⚠️  HTTP 응답 코드: $HTTP_CODE"
fi

echo ""
echo "================================"
echo "✅ 테스트 완료"
echo "================================"

