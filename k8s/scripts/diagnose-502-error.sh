#!/bin/bash

# nginx 502 Bad Gateway 에러 진단 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"

echo "🔍 nginx 502 Bad Gateway 에러 진단"
echo "================================"
echo ""

# nginx Pod 확인
NGINX_POD=$(kubectl get pods -n "$NAMESPACE" -l app=nginx -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$NGINX_POD" ]; then
    echo "❌ nginx Pod를 찾을 수 없습니다"
    exit 1
fi

echo "✅ nginx Pod: $NGINX_POD"
echo ""

# index-calc-fe Pod 확인
echo "1️⃣  index-calc-fe Pod 상태:"
echo "--------------------------------"
INDEX_FE_POD=$(kubectl get pods -n "$NAMESPACE" -l app=index-calc-fe -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -z "$INDEX_FE_POD" ]; then
    echo "   ❌ index-calc-fe Pod를 찾을 수 없습니다"
    echo ""
    echo "   💡 Pod 상태 확인:"
    kubectl get pods -n "$NAMESPACE" -l app=index-calc-fe
else
    POD_STATUS=$(kubectl get pod "$INDEX_FE_POD" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
    POD_READY=$(kubectl get pod "$INDEX_FE_POD" -n "$NAMESPACE" -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "Unknown")
    POD_NODE=$(kubectl get pod "$INDEX_FE_POD" -n "$NAMESPACE" -o jsonpath='{.spec.nodeName}' 2>/dev/null || echo "Unknown")
    
    echo "   Pod: $INDEX_FE_POD"
    echo "   상태: $POD_STATUS"
    echo "   Ready: $POD_READY"
    echo "   노드: $POD_NODE"
    
    if [ "$POD_STATUS" != "Running" ] || [ "$POD_READY" != "true" ]; then
        echo ""
        echo "   ⚠️  Pod가 Ready 상태가 아닙니다"
        echo "   상세 정보:"
        kubectl describe pod "$INDEX_FE_POD" -n "$NAMESPACE" | grep -A 10 "Events:" || true
    fi
fi
echo ""

# index-calc-fe-service 확인
echo "2️⃣  index-calc-fe-service 상태:"
echo "--------------------------------"
SERVICE_INFO=$(kubectl get svc index-calc-fe-service -n "$NAMESPACE" -o jsonpath='{.spec.clusterIP}{"\t"}{.spec.ports[0].port}' 2>/dev/null || echo "")
if [ -z "$SERVICE_INFO" ]; then
    echo "   ❌ index-calc-fe-service를 찾을 수 없습니다"
else
    CLUSTER_IP=$(echo "$SERVICE_INFO" | cut -f1)
    PORT=$(echo "$SERVICE_INFO" | cut -f2)
    echo "   Service: index-calc-fe-service"
    echo "   Cluster IP: $CLUSTER_IP"
    echo "   Port: $PORT"
    echo ""
    
    # Endpoints 확인
    ENDPOINTS=$(kubectl get endpoints index-calc-fe-service -n "$NAMESPACE" -o jsonpath='{.subsets[0].addresses[*].ip}' 2>/dev/null || echo "")
    if [ -z "$ENDPOINTS" ]; then
        echo "   ❌ Service Endpoints가 없습니다 (Pod가 Ready 상태가 아닐 수 있음)"
    else
        echo "   ✅ Endpoints: $ENDPOINTS"
    fi
fi
echo ""

# nginx에서 DNS 조회 테스트
echo "3️⃣  nginx Pod에서 DNS 조회 테스트:"
echo "--------------------------------"
echo "   index-calc-fe-service DNS 조회:"
DNS_RESULT=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "getent hosts index-calc-fe-service.bonanza-index.svc.cluster.local 2>&1" 2>/dev/null || echo "FAIL")
if [[ "$DNS_RESULT" == *"FAIL"* ]] || [ -z "$DNS_RESULT" ]; then
    echo "   ❌ DNS 조회 실패"
else
    echo "   ✅ DNS 조회 성공: $DNS_RESULT"
fi
echo ""

# nginx에서 직접 연결 테스트
echo "4️⃣  nginx Pod에서 index-calc-fe-service 연결 테스트:"
echo "--------------------------------"
if [ ! -z "$CLUSTER_IP" ] && [ ! -z "$PORT" ]; then
    echo "   Service Cluster IP로 연결 테스트 ($CLUSTER_IP:$PORT):"
    CONN_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 nc -w 1 $CLUSTER_IP $PORT 2>&1 && echo 'SUCCESS' || echo 'FAIL'" 2>/dev/null || echo "FAIL")
    if [[ "$CONN_TEST" == *"SUCCESS"* ]]; then
        echo "   ✅ 연결 성공"
    else
        echo "   ❌ 연결 실패"
        echo ""
        # Pod IP로 직접 연결 테스트
        if [ ! -z "$INDEX_FE_POD" ]; then
            POD_IP=$(kubectl get pod "$INDEX_FE_POD" -n "$NAMESPACE" -o jsonpath='{.status.podIP}' 2>/dev/null || echo "")
            if [ ! -z "$POD_IP" ]; then
                echo "   Pod IP로 직접 연결 테스트 ($POD_IP:80):"
                POD_CONN_TEST=$(kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- sh -c "timeout 3 nc -w 1 $POD_IP 80 2>&1 && echo 'SUCCESS' || echo 'FAIL'" 2>/dev/null || echo "FAIL")
                if [[ "$POD_CONN_TEST" == *"SUCCESS"* ]]; then
                    echo "   ✅ Pod IP 직접 연결 성공"
                    echo "   💡 Service Cluster IP 연결 문제 (네트워크 라우팅 이슈)"
                else
                    echo "   ❌ Pod IP 직접 연결도 실패"
                    echo "   💡 Pod 내부 애플리케이션 문제 또는 네트워크 문제"
                fi
            fi
        fi
    fi
fi
echo ""

# 노드 정보 확인
NGINX_NODE=$(kubectl get pod "$NGINX_POD" -n "$NAMESPACE" -o jsonpath='{.spec.nodeName}' 2>/dev/null || echo "Unknown")
INDEX_FE_NODE=$(kubectl get pod "$INDEX_FE_POD" -n "$NAMESPACE" -o jsonpath='{.spec.nodeName}' 2>/dev/null || echo "Unknown")

echo "5️⃣  노드 정보:"
echo "--------------------------------"
echo "   nginx Pod 노드: $NGINX_NODE"
echo "   index-calc-fe Pod 노드: $INDEX_FE_NODE"
if [ "$NGINX_NODE" != "$INDEX_FE_NODE" ]; then
    echo "   ⚠️  다른 노드에 있습니다 (마스터-워커 간 네트워크 연결 필요)"
fi
echo ""

# flannel 상태 확인
echo "6️⃣  flannel 네트워크 상태:"
echo "--------------------------------"
FLANNEL_PODS=$(kubectl get pods -n kube-flannel --no-headers 2>/dev/null | wc -l || echo "0")
if [ "$FLANNEL_PODS" -eq 0 ]; then
    echo "   ❌ flannel Pod를 찾을 수 없습니다"
    echo "   flannel 설치 필요: kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml"
else
    echo "   flannel Pod 상태:"
    kubectl get pods -n kube-flannel -o wide
    echo ""
    
    # 각 노드의 flannel Pod 상태 확인
    FLANNEL_ERRORS=$(kubectl get pods -n kube-flannel --no-headers 2>/dev/null | grep -v "Running" | wc -l || echo "0")
    if [ "$FLANNEL_ERRORS" -gt 0 ]; then
        echo "   ⚠️  일부 flannel Pod가 Running 상태가 아닙니다:"
        kubectl get pods -n kube-flannel --no-headers | grep -v "Running"
    fi
fi
echo ""

# nginx error.log 확인
echo "7️⃣  nginx error.log 최근 에러:"
echo "--------------------------------"
kubectl exec "$NGINX_POD" -n "$NAMESPACE" -- tail -n 30 /var/log/nginx/error.log 2>/dev/null | grep -i "502\|bad gateway\|upstream\|connect\|timeout" | tail -10 || echo "   최근 502 관련 에러 없음"
echo ""

# 해결 방법 제시
echo "================================"
echo "💡 해결 방법"
echo "================================"
echo ""

if [ -z "$INDEX_FE_POD" ]; then
    echo "1. index-calc-fe Pod가 없습니다."
    echo "   배포 확인: kubectl get deployment index-calc-fe -n $NAMESPACE"
    echo "   Pod 재시작: kubectl delete pod -n $NAMESPACE -l app=index-calc-fe"
    echo "   또는 재배포: ./k8s/scripts/deploy-worker.sh"
elif [ "$POD_STATUS" != "Running" ] || [ "$POD_READY" != "true" ]; then
    echo "1. index-calc-fe Pod가 Ready 상태가 아닙니다."
    echo "   Pod 로그 확인: kubectl logs $INDEX_FE_POD -n $NAMESPACE"
    echo "   Pod 상세 정보: kubectl describe pod $INDEX_FE_POD -n $NAMESPACE"
    echo ""
    echo "2. Pod 재시작:"
    echo "   kubectl delete pod $INDEX_FE_POD -n $NAMESPACE"
elif [ -z "$ENDPOINTS" ]; then
    echo "1. Service Endpoints가 없습니다."
    echo "   Pod가 Ready 상태인지 확인: kubectl get pod $INDEX_FE_POD -n $NAMESPACE"
    echo "   Readiness probe 확인: kubectl describe pod $INDEX_FE_POD -n $NAMESPACE | grep -A 5 readiness"
elif [ "$NGINX_NODE" != "$INDEX_FE_NODE" ]; then
    echo "1. ⚠️  마스터-워커 노드 간 네트워크 연결 문제입니다."
    echo ""
    echo "   원인:"
    echo "   - nginx Pod는 마스터 노드 ($NGINX_NODE)에 있습니다"
    echo "   - index-calc-fe Pod는 워커 노드 ($INDEX_FE_NODE)에 있습니다"
    echo "   - 마스터에서 워커로의 네트워크 연결이 실패하고 있습니다"
    echo ""
    echo "   해결 방법:"
    echo ""
    echo "   방법 1: flannel 네트워크 재시작 (권장)"
    echo "   kubectl delete pods -n kube-flannel --all"
    echo "   # 잠시 대기 후 확인: kubectl get pods -n kube-flannel"
    echo ""
    echo "   방법 2: nginx를 워커 노드로 이동 (nodeSelector 수정)"
    echo "   # nginx deployment.yaml의 nodeSelector를 app-server: \"true\"로 변경"
    echo "   # 또는 index-calc-fe를 마스터 노드로 이동 (권장하지 않음)"
    echo ""
    echo "   방법 3: 노드 간 네트워크 연결 확인"
    echo "   # 마스터 노드에서: ping <워커-노드-IP>"
    echo "   # 워커 노드에서: ping 121.88.4.53"
    echo "   # flannel 로그 확인: kubectl logs -n kube-flannel -l app=flannel"
else
    echo "1. 네트워크 연결 문제일 수 있습니다."
    echo "   같은 노드에 있지만 연결이 실패합니다"
    echo "   flannel 네트워크 상태 확인: kubectl get pods -n kube-flannel"
fi

echo ""
echo "2. nginx ConfigMap 확인:"
echo "   kubectl get configmap nginx-config -n $NAMESPACE -o yaml | grep -A 5 'frontend_upstream'"
echo ""
echo "3. nginx Pod 재시작:"
echo "   kubectl delete pod $NGINX_POD -n $NAMESPACE"
echo ""

