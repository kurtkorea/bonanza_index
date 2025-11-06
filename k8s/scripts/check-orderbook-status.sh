#!/bin/bash

# orderbook-collector 상태 확인 스크립트

echo "🔍 orderbook-collector 상태 확인"
echo "================================"
echo ""

# Pod 확인
POD=$(kubectl get pods -n bonanza-index -l app=orderbook-collector --no-headers 2>/dev/null | head -1 | awk '{print $1}' || echo "")
if [ -z "$POD" ]; then
    echo "❌ orderbook-collector Pod를 찾을 수 없습니다"
    exit 1
fi

echo "Pod: $POD"
echo ""

# Pod 상태
STATUS=$(kubectl get pod -n bonanza-index "$POD" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
echo "상태: $STATUS"
echo ""

# DNS 설정 확인
echo "📋 DNS 설정 확인:"
echo "--------------------------------"
kubectl exec -n bonanza-index "$POD" -- cat /etc/resolv.conf 2>/dev/null || echo "   ❌ DNS 설정 확인 실패"
echo ""

# CoreDNS Service 확인
COREDNS_IP=$(kubectl get svc -n kube-system kube-dns -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
echo "CoreDNS Service IP: $COREDNS_IP"
echo ""

# DNS 테스트 (여러 방법)
echo "📡 DNS 조회 테스트:"
echo "--------------------------------"
echo "1. getent hosts api.upbit.com:"
kubectl exec -n bonanza-index "$POD" -- sh -c "getent hosts api.upbit.com 2>&1" 2>/dev/null | head -1 || echo "   ❌ 실패"
echo ""

echo "2. nslookup api.upbit.com (가능한 경우):"
kubectl exec -n bonanza-index "$POD" -- sh -c "nslookup api.upbit.com 2>&1 | head -3" 2>/dev/null || echo "   ⚠️  nslookup 없음"
echo ""

echo "3. CoreDNS 직접 조회 테스트:"
if [ ! -z "$COREDNS_IP" ]; then
    kubectl exec -n bonanza-index "$POD" -- sh -c "dig @$COREDNS_IP api.upbit.com +short 2>&1 | head -1" 2>/dev/null || echo "   ⚠️  dig 없음"
else
    echo "   ⚠️  CoreDNS IP를 찾을 수 없음"
fi
echo ""

echo "4. ws-api.bithumb.com:"
kubectl exec -n bonanza-index "$POD" -- sh -c "getent hosts ws-api.bithumb.com 2>&1" 2>/dev/null | head -1 || echo "   ❌ 실패"
echo ""

# 최근 로그 확인
echo "📋 최근 로그 (외부 API 연결 상태):"
echo "--------------------------------"
kubectl logs -n bonanza-index "$POD" --tail=30 2>/dev/null | grep -E "UPBIT|BITHUMB|COINONE|KORBIT|WebSocket|error|EAI_AGAIN" | tail -10 || echo "   로그 없음"
echo ""

# 전체 에러 확인
echo "📋 전체 에러 확인:"
echo "--------------------------------"
ERROR_COUNT=$(kubectl logs -n bonanza-index "$POD" --tail=100 2>/dev/null | grep -c "EAI_AGAIN" || echo "0")
if [ "$ERROR_COUNT" -eq 0 ]; then
    echo "   ✅ DNS 에러 없음"
else
    echo "   ⚠️  DNS 에러 $ERROR_COUNT개 발견"
fi
echo ""

