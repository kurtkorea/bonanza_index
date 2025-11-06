#!/bin/bash

# 워커 노드 DNS 문제 진단 스크립트

echo "🔍 워커 노드 DNS 문제 진단"
echo "================================"
echo ""

# 워커 노드 확인
WORKER_NODE=$(kubectl get nodes -l app-server=true --no-headers 2>/dev/null | head -1 | awk '{print $1}' || echo "")
if [ -z "$WORKER_NODE" ]; then
    echo "❌ 워커 노드를 찾을 수 없습니다"
    exit 1
fi

WORKER_IP=$(kubectl get node "$WORKER_NODE" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "")
echo "워커 노드: $WORKER_NODE ($WORKER_IP)"
echo ""

# CoreDNS Service IP
COREDNS_IP=$(kubectl get svc -n kube-system kube-dns -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
echo "CoreDNS Service IP: $COREDNS_IP"
echo ""

# 워커 노드에 있는 Pod 확인
echo "워커 노드에 있는 Pod:"
kubectl get pods -n bonanza-index --field-selector=spec.nodeName=$WORKER_NODE --no-headers | awk '{print "  - " $1 " (" $3 ")"}'
echo ""

# 워커 노드 Pod에서 DNS 테스트
TEST_POD=$(kubectl get pods -n bonanza-index --field-selector=spec.nodeName=$WORKER_NODE,status.phase=Running --no-headers 2>/dev/null | head -1 | awk '{print $1}' || echo "")
if [ ! -z "$TEST_POD" ]; then
    echo "테스트 Pod: $TEST_POD"
    echo ""
    
    echo "📋 DNS 설정:"
    kubectl exec -n bonanza-index "$TEST_POD" -- cat /etc/resolv.conf 2>/dev/null || echo "   ❌ DNS 설정 확인 실패"
    echo ""
    
    echo "📡 CoreDNS 연결 테스트:"
    echo "   CoreDNS Service IP로 연결 테스트..."
    kubectl exec -n bonanza-index "$TEST_POD" -- sh -c "nc -zv $COREDNS_IP 53 2>&1" 2>/dev/null || echo "   ❌ CoreDNS 연결 실패"
    echo ""
    
    echo "📡 외부 DNS 조회 테스트:"
    echo "   api.upbit.com:"
    kubectl exec -n bonanza-index "$TEST_POD" -- sh -c "getent hosts api.upbit.com 2>&1" 2>/dev/null | head -1 || echo "   ❌ 실패"
    echo ""
else
    echo "⚠️  워커 노드에서 실행 중인 Pod를 찾을 수 없습니다"
    echo "   CrashLoopBackOff 상태의 Pod들:"
    kubectl get pods -n bonanza-index --field-selector=spec.nodeName=$WORKER_NODE --no-headers | grep -i "crashloop\|error" | awk '{print "  - " $1}'
fi
echo ""

# 해결 방법
echo "================================"
echo "💡 해결 방법"
echo "================================"
echo ""
echo "1. 워커 노드에서 마스터 노드로 네트워크 연결 확인:"
echo "   # 워커 노드에서 실행"
echo "   ping 121.88.4.53"
echo "   telnet 121.88.4.53 6443"
echo ""
echo "2. flannel 네트워크 확인:"
echo "   kubectl get pods -n kube-flannel -o wide"
echo "   # 워커 노드에 flannel Pod가 Running 상태인지 확인"
echo ""
echo "3. CoreDNS가 워커 노드에서 접근 가능한지 확인:"
echo "   # 워커 노드에서 실행"
echo "   curl http://$COREDNS_IP:8080/health 2>/dev/null || echo 'CoreDNS health check 실패'"
echo ""
echo "4. 워커 노드의 k3s-agent 재시작:"
echo "   # 워커 노드에서 실행"
echo "   sudo systemctl restart k3s-agent"
echo ""

