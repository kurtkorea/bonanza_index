#!/bin/bash

# 외부 DNS 조회 문제 해결 스크립트

set -e

echo "🔧 외부 DNS 조회 문제 해결"
echo "================================"
echo ""

# 1. CoreDNS 확인
echo "1️⃣  CoreDNS 확인:"
echo "--------------------------------"
COREDNS_POD=$(kubectl get pods -n kube-system -l k8s-app=kube-dns --no-headers 2>/dev/null | head -1 | awk '{print $1}' || echo "")
if [ -z "$COREDNS_POD" ]; then
    echo "   ❌ CoreDNS Pod를 찾을 수 없습니다"
    exit 1
fi

echo "   CoreDNS Pod: $COREDNS_POD"
COREDNS_STATUS=$(kubectl get pod -n kube-system "$COREDNS_POD" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
echo "   상태: $COREDNS_STATUS"
echo ""

# 2. CoreDNS ConfigMap 확인
echo "2️⃣  CoreDNS ConfigMap 확인:"
echo "--------------------------------"
COREDNS_CONFIG=$(kubectl get configmap -n kube-system coredns -o jsonpath='{.data.Corefile}' 2>/dev/null || echo "")
if [ -z "$COREDNS_CONFIG" ]; then
    echo "   ❌ CoreDNS ConfigMap을 찾을 수 없습니다"
else
    echo "$COREDNS_CONFIG" | grep -A 5 "forward"
    if echo "$COREDNS_CONFIG" | grep -q "forward . 8.8.8.8"; then
        echo "   ✅ 외부 DNS 전달 설정이 있습니다"
    else
        echo "   ⚠️  외부 DNS 전달 설정이 없습니다"
    fi
fi
echo ""

# 3. CoreDNS ConfigMap 적용
echo "3️⃣  CoreDNS ConfigMap 적용:"
echo "--------------------------------"
if [ -f "k8s/kube-system/coredns-configmap.yaml" ]; then
    echo "   ConfigMap 파일 적용:"
    kubectl apply -f k8s/kube-system/coredns-configmap.yaml
    echo "   ✅ ConfigMap 적용 완료"
else
    echo "   ⚠️  ConfigMap 파일을 찾을 수 없습니다"
    echo "   수동으로 적용:"
    echo "   kubectl apply -f k8s/kube-system/coredns-configmap.yaml"
fi
echo ""

# 4. CoreDNS Pod 재시작
echo "4️⃣  CoreDNS Pod 재시작:"
echo "--------------------------------"
read -p "CoreDNS Pod를 재시작하시겠습니까? (y/N): " RESTART_COREDNS
if [[ "$RESTART_COREDNS" =~ ^[Yy]$ ]]; then
    kubectl delete pods -n kube-system -l k8s-app=kube-dns
    echo "   ✅ CoreDNS Pod 재시작 중..."
    echo "   잠시 대기 중..."
    sleep 10
    echo "   CoreDNS Pod 상태:"
    kubectl get pods -n kube-system -l k8s-app=kube-dns
fi
echo ""

# 5. 테스트 Pod에서 DNS 조회 테스트
echo "5️⃣  테스트 Pod에서 외부 DNS 조회:"
echo "--------------------------------"
TEST_POD=$(kubectl get pods -n bonanza-index --field-selector=status.phase=Running --no-headers 2>/dev/null | head -1 | awk '{print $1}' || echo "")
if [ ! -z "$TEST_POD" ]; then
    echo "   테스트 Pod: $TEST_POD"
    echo ""
    
    echo "   📡 api.upbit.com DNS 조회:"
    DNS_RESULT=$(kubectl exec -n bonanza-index "$TEST_POD" -- sh -c "getent hosts api.upbit.com 2>&1" 2>/dev/null || echo "FAIL")
    if [[ "$DNS_RESULT" == *"api.upbit.com"* ]] || [[ "$DNS_RESULT" == *"104.16."* ]] || [[ "$DNS_RESULT" == *"104.17."* ]]; then
        echo "      ✅ $DNS_RESULT"
    else
        echo "      ❌ DNS 조회 실패: $DNS_RESULT"
    fi
    
    echo ""
    echo "   📡 www.google.com DNS 조회 (테스트):"
    DNS_GOOGLE=$(kubectl exec -n bonanza-index "$TEST_POD" -- sh -c "getent hosts www.google.com 2>&1" 2>/dev/null || echo "FAIL")
    if [[ "$DNS_GOOGLE" == *"www.google.com"* ]]; then
        echo "      ✅ $DNS_GOOGLE"
    else
        echo "      ❌ DNS 조회 실패: $DNS_GOOGLE"
    fi
else
    echo "   ⚠️  테스트할 실행 중인 Pod를 찾을 수 없습니다"
fi
echo ""

# 6. 해결 방법 제시
echo "================================"
echo "💡 추가 해결 방법"
echo "================================"
echo ""
echo "1. CoreDNS 로그 확인:"
echo "   kubectl logs -n kube-system $COREDNS_POD | tail -50"
echo ""
echo "2. Pod의 DNS 설정 확인:"
if [ ! -z "$TEST_POD" ]; then
    echo "   kubectl exec -n bonanza-index $TEST_POD -- cat /etc/resolv.conf"
fi
echo ""
echo "3. CoreDNS Service 확인:"
echo "   kubectl get svc -n kube-system kube-dns"
echo ""
echo "4. 애플리케이션 Pod 재시작:"
echo "   kubectl delete pods -n bonanza-index -l app=telegram-log"
echo "   kubectl delete pods -n bonanza-index -l app=orderbook-collector"
echo "   kubectl delete pods -n bonanza-index -l app=ticker-collector"
echo ""

