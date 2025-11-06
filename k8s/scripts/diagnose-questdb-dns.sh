#!/bin/bash

# QuestDB Service DNS 문제 진단 스크립트

set -e

echo "🔍 QuestDB Service DNS 문제 진단"
echo "================================"
echo ""

# 1. CoreDNS 확인
echo "1️⃣  CoreDNS 확인:"
echo "--------------------------------"
COREDNS_PODS=$(kubectl get pods -n kube-system -l k8s-app=kube-dns --no-headers 2>/dev/null | wc -l)
if [ "$COREDNS_PODS" -eq 0 ]; then
    echo "   ❌ CoreDNS Pod를 찾을 수 없습니다"
else
    echo "   CoreDNS Pod 상태:"
    kubectl get pods -n kube-system -l k8s-app=kube-dns
    echo ""
    COREDNS_READY=$(kubectl get pods -n kube-system -l k8s-app=kube-dns --no-headers 2>/dev/null | grep -c "Running" || echo "0")
    if [ "$COREDNS_READY" -eq 0 ]; then
        echo "   ⚠️  CoreDNS Pod가 Running 상태가 아닙니다"
    else
        echo "   ✅ CoreDNS Pod 실행 중"
    fi
fi
echo ""

# 2. CoreDNS Service 확인
echo "2️⃣  CoreDNS Service 확인:"
echo "--------------------------------"
COREDNS_SVC=$(kubectl get svc -n kube-system kube-dns -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
if [ -z "$COREDNS_SVC" ]; then
    echo "   ❌ CoreDNS Service를 찾을 수 없습니다"
else
    echo "   CoreDNS Cluster IP: $COREDNS_SVC"
    echo "   ✅ CoreDNS Service 존재"
fi
echo ""

# 3. QuestDB Service 확인
echo "3️⃣  QuestDB Service 확인:"
echo "--------------------------------"
QDB_SVC=$(kubectl get svc -n bonanza-index questdb-service 2>/dev/null || echo "")
if [ -z "$QDB_SVC" ]; then
    echo "   ❌ questdb-service를 찾을 수 없습니다"
    echo "   Service 생성: kubectl apply -f k8s/questdb/service.yaml"
else
    echo "   QuestDB Service:"
    kubectl get svc -n bonanza-index questdb-service
    echo ""
    QDB_CLUSTER_IP=$(kubectl get svc -n bonanza-index questdb-service -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
    echo "   Cluster IP: $QDB_CLUSTER_IP"
    echo "   ✅ questdb-service 존재"
fi
echo ""

# 4. QuestDB Pod 확인
echo "4️⃣  QuestDB Pod 확인:"
echo "--------------------------------"
QDB_POD=$(kubectl get pods -n bonanza-index -l app=questdb --no-headers 2>/dev/null | head -1 | awk '{print $1}' || echo "")
if [ -z "$QDB_POD" ]; then
    echo "   ❌ QuestDB Pod를 찾을 수 없습니다"
else
    echo "   QuestDB Pod: $QDB_POD"
    QDB_STATUS=$(kubectl get pod -n bonanza-index "$QDB_POD" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
    echo "   상태: $QDB_STATUS"
    if [ "$QDB_STATUS" = "Running" ]; then
        echo "   ✅ QuestDB Pod 실행 중"
    else
        echo "   ⚠️  QuestDB Pod가 Running 상태가 아닙니다"
    fi
fi
echo ""

# 5. QuestDB Endpoints 확인
echo "5️⃣  QuestDB Endpoints 확인:"
echo "--------------------------------"
QDB_ENDPOINTS=$(kubectl get endpoints -n bonanza-index questdb-service 2>/dev/null || echo "")
if [ -z "$QDB_ENDPOINTS" ]; then
    echo "   ❌ Endpoints를 찾을 수 없습니다"
else
    echo "$QDB_ENDPOINTS"
    ENDPOINT_COUNT=$(kubectl get endpoints -n bonanza-index questdb-service -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null | wc -w || echo "0")
    if [ "$ENDPOINT_COUNT" -eq 0 ]; then
        echo "   ⚠️  Endpoints에 IP가 없습니다 (Pod가 Ready 상태가 아닐 수 있음)"
    else
        echo "   ✅ Endpoints 존재"
    fi
fi
echo ""

# 6. 테스트 Pod에서 DNS 조회
echo "6️⃣  테스트 Pod에서 DNS 조회:"
echo "--------------------------------"
# 실행 중인 Pod 찾기 (worker pod)
TEST_POD=$(kubectl get pods -n bonanza-index --field-selector=status.phase=Running --no-headers 2>/dev/null | grep -v questdb | head -1 | awk '{print $1}' || echo "")
if [ -z "$TEST_POD" ]; then
    echo "   ⚠️  테스트할 실행 중인 Pod를 찾을 수 없습니다"
else
    echo "   테스트 Pod: $TEST_POD"
    echo ""
    
    # DNS 설정 확인
    echo "   📋 DNS 설정 (/etc/resolv.conf):"
    kubectl exec -n bonanza-index "$TEST_POD" -- cat /etc/resolv.conf 2>/dev/null || echo "   ❌ Pod 접근 실패"
    echo ""
    
    # DNS 조회 테스트
    echo "   📡 DNS 조회 테스트:"
    echo "   - questdb-service:"
    DNS_RESULT=$(kubectl exec -n bonanza-index "$TEST_POD" -- sh -c "getent hosts questdb-service 2>&1" 2>/dev/null || echo "FAIL")
    if [[ "$DNS_RESULT" == *"questdb-service"* ]]; then
        echo "      ✅ $DNS_RESULT"
    else
        echo "      ❌ DNS 조회 실패: $DNS_RESULT"
    fi
    
    echo "   - questdb-service.bonanza-index.svc.cluster.local:"
    DNS_RESULT_FQDN=$(kubectl exec -n bonanza-index "$TEST_POD" -- sh -c "getent hosts questdb-service.bonanza-index.svc.cluster.local 2>&1" 2>/dev/null || echo "FAIL")
    if [[ "$DNS_RESULT_FQDN" == *"questdb-service"* ]]; then
        echo "      ✅ $DNS_RESULT_FQDN"
    else
        echo "      ❌ DNS 조회 실패: $DNS_RESULT_FQDN"
    fi
    echo ""
    
    # 포트 연결 테스트
    if [ ! -z "$QDB_CLUSTER_IP" ]; then
        echo "   📡 포트 연결 테스트 ($QDB_CLUSTER_IP:8812):"
        CONN_TEST=$(kubectl exec -n bonanza-index "$TEST_POD" -- sh -c "timeout 3 nc -w 1 $QDB_CLUSTER_IP 8812 2>&1 && echo 'SUCCESS' || echo 'FAIL'" 2>/dev/null || echo "FAIL")
        if [[ "$CONN_TEST" == *"SUCCESS"* ]]; then
            echo "      ✅ 연결 성공"
        else
            echo "      ❌ 연결 실패"
            echo ""
            # QuestDB Pod IP로 직접 연결 테스트
            if [ ! -z "$QDB_POD" ]; then
                QDB_POD_IP=$(kubectl get pod -n bonanza-index "$QDB_POD" -o jsonpath='{.status.podIP}' 2>/dev/null || echo "")
                if [ ! -z "$QDB_POD_IP" ]; then
                    echo "   📡 QuestDB Pod IP 직접 연결 테스트 ($QDB_POD_IP:8812):"
                    POD_CONN_TEST=$(kubectl exec -n bonanza-index "$TEST_POD" -- sh -c "timeout 3 nc -w 1 $QDB_POD_IP 8812 2>&1 && echo 'SUCCESS' || echo 'FAIL'" 2>/dev/null || echo "FAIL")
                    if [[ "$POD_CONN_TEST" == *"SUCCESS"* ]]; then
                        echo "      ✅ Pod IP 직접 연결 성공"
                        echo "      💡 Service Cluster IP 연결 문제 (네트워크 라우팅 이슈)"
                    else
                        echo "      ❌ Pod IP 직접 연결도 실패"
                        echo "      💡 네트워크 문제 (flannel 또는 kube-proxy 이슈)"
                    fi
                fi
            fi
        fi
    fi
fi
echo ""

# 7. flannel 확인
echo "7️⃣  flannel 네트워크 확인:"
echo "--------------------------------"
FLANNEL_PODS=$(kubectl get pods -n kube-flannel --no-headers 2>/dev/null | wc -l || echo "0")
if [ "$FLANNEL_PODS" -eq 0 ]; then
    echo "   ⚠️  flannel Pod를 찾을 수 없습니다"
    echo "   flannel 설치: kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml"
else
    echo "   flannel Pod 상태:"
    kubectl get pods -n kube-flannel
    echo ""
    FLANNEL_READY=$(kubectl get pods -n kube-flannel --no-headers 2>/dev/null | grep -c "Running" || echo "0")
    if [ "$FLANNEL_READY" -eq 0 ]; then
        echo "   ⚠️  flannel Pod가 Running 상태가 아닙니다"
    else
        echo "   ✅ flannel Pod 실행 중"
    fi
fi
echo ""

# 8. 노드 간 네트워크 확인
echo "8️⃣  노드 간 네트워크 확인:"
echo "--------------------------------"
NODES=$(kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}{end}' 2>/dev/null || echo "")
if [ ! -z "$NODES" ]; then
    echo "   노드 목록:"
    echo "$NODES" | while read NODE IP; do
        if [ ! -z "$NODE" ] && [ ! -z "$IP" ]; then
            echo "   - $NODE: $IP"
        fi
    done
    echo ""
    echo "   💡 노드 간 네트워크 연결 테스트는 각 노드에서 직접 실행해야 합니다:"
    echo "      ping <다른-노드-IP>"
else
    echo "   ⚠️  노드 정보를 가져올 수 없습니다"
fi
echo ""

# 9. kube-proxy 확인
echo "9️⃣  kube-proxy 확인:"
echo "--------------------------------"
KUBE_PROXY_PODS=$(kubectl get pods -n kube-system -l k8s-app=kube-proxy --no-headers 2>/dev/null | wc -l || echo "0")
if [ "$KUBE_PROXY_PODS" -eq 0 ]; then
    echo "   ⚠️  kube-proxy Pod를 찾을 수 없습니다"
else
    echo "   kube-proxy Pod 상태:"
    kubectl get pods -n kube-system -l k8s-app=kube-proxy
    echo ""
    KUBE_PROXY_READY=$(kubectl get pods -n kube-system -l k8s-app=kube-proxy --no-headers 2>/dev/null | grep -c "Running" || echo "0")
    if [ "$KUBE_PROXY_READY" -eq 0 ]; then
        echo "   ⚠️  kube-proxy Pod가 Running 상태가 아닙니다"
    else
        echo "   ✅ kube-proxy Pod 실행 중"
    fi
fi
echo ""

# 10. 해결 방법 제시
echo "================================"
echo "💡 해결 방법"
echo "================================"
echo ""
if [ ! -z "$QDB_POD" ]; then
    QDB_POD_IP=$(kubectl get pod -n bonanza-index "$QDB_POD" -o jsonpath='{.status.podIP}' 2>/dev/null || echo "")
    if [ ! -z "$QDB_POD_IP" ]; then
        echo "⚠️  Service Cluster IP 연결이 실패하는 경우, 임시 해결책:"
        echo ""
        echo "   ConfigMap에서 QDB_HOST를 Pod IP로 변경:"
        echo "   kubectl patch configmap bonanza-common-config -n bonanza-index --type merge -p '{\"data\":{\"QDB_HOST\":\"$QDB_POD_IP\"}}'"
        echo ""
        echo "   또는 NodePort 사용 (마스터 노드 IP: 121.88.4.53, 포트: 30812):"
        echo "   kubectl patch configmap bonanza-common-config -n bonanza-index --type merge -p '{\"data\":{\"QDB_HOST\":\"121.88.4.53\",\"QDB_PORT\":\"30812\"}}'"
        echo ""
    fi
fi
echo "1. kube-proxy 재시작:"
echo "   kubectl delete pods -n kube-system -l k8s-app=kube-proxy"
echo ""
echo "2. flannel 재시작 (네트워크 문제인 경우):"
echo "   kubectl delete pods -n kube-flannel --all"
echo ""
echo "3. CoreDNS 재시작:"
echo "   kubectl delete pods -n kube-system -l k8s-app=kube-dns"
echo ""
echo "4. QuestDB Pod 재시작:"
if [ ! -z "$QDB_POD" ]; then
    echo "   kubectl delete pod -n bonanza-index $QDB_POD"
else
    echo "   kubectl delete pods -n bonanza-index -l app=questdb"
fi
echo ""
echo "5. Service 재생성:"
echo "   kubectl apply -f k8s/questdb/service.yaml"
echo ""
echo "6. 노드 재시작 (최후의 수단):"
echo "   # 마스터 노드: sudo systemctl restart k3s"
echo "   # 워커 노드: sudo systemctl restart k3s-agent"
echo ""

