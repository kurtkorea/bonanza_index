#!/bin/bash

echo "🔍 QuestDB 접속 방법 안내"
echo "================================"
echo ""

# QuestDB Pod 상태 확인
echo "📊 QuestDB Pod 상태:"
kubectl get pods -n bonanza-index -l app=questdb

echo ""
echo "🔍 QuestDB Service 상태:"
kubectl get svc questdb-service -n bonanza-index

echo ""
echo "📋 QuestDB 웹 콘솔 접속 방법:"
echo ""

# Method 1: Port Forward
echo "방법 1: kubectl port-forward (가장 간단)"
echo "----------------------------------------"
echo "터미널에서 다음 명령어 실행:"
echo "  kubectl port-forward -n bonanza-index svc/questdb-service 9000:9000"
echo ""
echo "브라우저에서 접속:"
echo "  http://localhost:9000"
echo ""

# Method 2: NodePort
NODE_PORT=$(kubectl get svc questdb-service -n bonanza-index -o jsonpath='{.spec.ports[?(@.name=="rest")].nodePort}' 2>/dev/null)
MASTER_NODE_IP=$(kubectl get nodes -l node-role.kubernetes.io/control-plane=true -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null)

if [ ! -z "$NODE_PORT" ] && [ ! -z "$MASTER_NODE_IP" ]; then
    echo "방법 2: NodePort (현재 설정)"
    echo "----------------------------------------"
    echo "브라우저에서 접속:"
    echo "  http://${MASTER_NODE_IP}:${NODE_PORT}"
    echo ""
    echo "또는 마스터 노드 IP를 확인하여:"
    kubectl get nodes -l node-role.kubernetes.io/control-plane=true -o wide
    echo ""
fi

# Method 3: Ingress
echo "방법 3: Ingress (설정 후)"
echo "----------------------------------------"
echo "1. Ingress 적용:"
echo "   kubectl apply -f k8s/ingress.yaml"
echo ""
echo "2. 호스트 파일에 추가 (/etc/hosts 또는 C:\\Windows\\System32\\drivers\\etc\\hosts):"
INGRESS_IP=$(kubectl get ingress -n bonanza-index -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}' 2>/dev/null)
if [ -z "$INGRESS_IP" ]; then
    INGRESS_IP="<마스터노드IP>"
fi
echo "   ${INGRESS_IP} questdb.bonanza-index.local"
echo ""
echo "3. 브라우저에서 접속:"
echo "   http://questdb.bonanza-index.local"
echo ""

echo "💡 팁:"
echo "  - Port Forward 방법이 가장 간단하고 빠릅니다"
echo "  - 프로덕션 환경에서는 Ingress를 사용하는 것을 권장합니다"
echo "  - QuestDB 웹 콘솔은 9000 포트에서 제공됩니다"
echo ""

