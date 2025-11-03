#!/bin/bash

set -e

# 스크립트 디렉토리에서 상위 디렉토리(k8s/)로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "🔄 애플리케이션 서비스 재배포 시작..."

# 기존 리소스 삭제
echo ""
echo "🗑️  기존 리소스 삭제 중..."
kubectl delete deployment index-endpoint -n bonanza-index --ignore-not-found=true
kubectl delete deployment index-calculator -n bonanza-index --ignore-not-found=true
kubectl delete deployment orderbook-collector -n bonanza-index --ignore-not-found=true
kubectl delete deployment ticker-collector -n bonanza-index --ignore-not-found=true
kubectl delete deployment orderbook-storage-worker -n bonanza-index --ignore-not-found=true
kubectl delete deployment ticker-storage-worker -n bonanza-index --ignore-not-found=true
kubectl delete deployment orderbook-aggregator -n bonanza-index --ignore-not-found=true
kubectl delete deployment telegram-log -n bonanza-index --ignore-not-found=true
kubectl delete deployment index-calc-fe -n bonanza-index --ignore-not-found=true
kubectl delete ingress -n bonanza-index --all --ignore-not-found=true

echo ""
for i in {5..1}; do
    echo -ne "⏳ 대기 중... (${i})\r"
    sleep 1
done
echo -ne "⏳ 대기 종료          \n"

# 공통 ConfigMap 확인 (필요시)
echo ""
echo "⚙️  공통 리소스 확인..."
kubectl apply -f configmap-common.yaml --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f secret.yaml --dry-run=client -o yaml | kubectl apply -f -

# 백엔드 서비스 재배포
echo ""
echo "🔧 백엔드 서비스 재배포 중..."
echo "  - index-endpoint 배포 중..."
kubectl apply -f index-endpoint/

echo "  - index-calculator 배포 중..."
kubectl apply -f index-calculator/

echo "  - orderbook-collector 배포 중..."
kubectl apply -f orderbook-collector/

echo "  - ticker-collector 배포 중..."
kubectl apply -f ticker-collector/

echo "  - orderbook-storage-worker 배포 중..."
kubectl apply -f orderbook-storage-worker/

echo "  - ticker-storage-worker 배포 중..."
kubectl apply -f ticker-storage-worker/

echo "  - orderbook-aggregator 배포 중..."
kubectl apply -f orderbook-aggregator/

echo "  - telegram-log 배포 중..."
kubectl apply -f telegram-log/

# 프론트엔드 재배포
echo ""
echo "🎨 프론트엔드 재배포 중..."
kubectl apply -f index-calc-fe/

# Ingress 재배포
echo ""
echo "🌐 Ingress 재배포 중..."
kubectl apply -f ingress.yaml

echo ""
echo "⏳ 배포 완료 대기 중 (45초)..."
for i in {45..1}; do
    echo -ne "⏳ 남은 시간: ${i}초\r"
    sleep 1
done
echo -ne "⏳ 대기 종료          \n"

echo ""
echo "✅ 배포 상태 확인"
echo "================================"
echo ""

echo "📦 Pod 상태 (애플리케이션):"
kubectl get pods -n bonanza-index -o wide | grep -vE "(redis|questdb|mariadb|nginx)"

echo ""
echo "🔍 서비스 상태 (애플리케이션):"
kubectl get svc -n bonanza-index | grep -vE "(redis|questdb|mariadb|nginx)"

echo ""
echo "📡 Ingress 상태:"
kubectl get ingress -n bonanza-index 2>/dev/null || echo "Ingress 없음"

echo ""
echo "📊 애플리케이션 Pod 상세 상태:"
echo ""

echo "index-endpoint:"
INDEX_ENDPOINT_PHASE=$(kubectl get pods -n bonanza-index -l app=index-endpoint -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
INDEX_ENDPOINT_READY=$(kubectl get pods -n bonanza-index -l app=index-endpoint -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $INDEX_ENDPOINT_PHASE, Ready: $INDEX_ENDPOINT_READY"

echo ""
echo "index-calculator:"
INDEX_CALC_PHASE=$(kubectl get pods -n bonanza-index -l app=index-calculator -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
INDEX_CALC_READY=$(kubectl get pods -n bonanza-index -l app=index-calculator -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $INDEX_CALC_PHASE, Ready: $INDEX_CALC_READY"

echo ""
echo "orderbook-collector:"
ORDERBOOK_COL_PHASE=$(kubectl get pods -n bonanza-index -l app=orderbook-collector -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
ORDERBOOK_COL_READY=$(kubectl get pods -n bonanza-index -l app=orderbook-collector -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $ORDERBOOK_COL_PHASE, Ready: $ORDERBOOK_COL_READY"

echo ""
echo "ticker-collector:"
TICKER_COL_PHASE=$(kubectl get pods -n bonanza-index -l app=ticker-collector -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
TICKER_COL_READY=$(kubectl get pods -n bonanza-index -l app=ticker-collector -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $TICKER_COL_PHASE, Ready: $TICKER_COL_READY"

echo ""
echo "orderbook-storage-worker:"
ORDERBOOK_STORAGE_PHASE=$(kubectl get pods -n bonanza-index -l app=orderbook-storage-worker -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
ORDERBOOK_STORAGE_READY=$(kubectl get pods -n bonanza-index -l app=orderbook-storage-worker -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $ORDERBOOK_STORAGE_PHASE, Ready: $ORDERBOOK_STORAGE_READY"

echo ""
echo "ticker-storage-worker:"
TICKER_STORAGE_PHASE=$(kubectl get pods -n bonanza-index -l app=ticker-storage-worker -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
TICKER_STORAGE_READY=$(kubectl get pods -n bonanza-index -l app=ticker-storage-worker -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $TICKER_STORAGE_PHASE, Ready: $TICKER_STORAGE_READY"

echo ""
echo "orderbook-aggregator:"
ORDERBOOK_AGG_PHASE=$(kubectl get pods -n bonanza-index -l app=orderbook-aggregator -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
ORDERBOOK_AGG_READY=$(kubectl get pods -n bonanza-index -l app=orderbook-aggregator -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $ORDERBOOK_AGG_PHASE, Ready: $ORDERBOOK_AGG_READY"

echo ""
echo "telegram-log:"
TELEGRAM_LOG_PHASE=$(kubectl get pods -n bonanza-index -l app=telegram-log -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
TELEGRAM_LOG_READY=$(kubectl get pods -n bonanza-index -l app=telegram-log -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $TELEGRAM_LOG_PHASE, Ready: $TELEGRAM_LOG_READY"

echo ""
echo "index-calc-fe:"
INDEX_FE_PHASE=$(kubectl get pods -n bonanza-index -l app=index-calc-fe -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
INDEX_FE_READY=$(kubectl get pods -n bonanza-index -l app=index-calc-fe -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $INDEX_FE_PHASE, Ready: $INDEX_FE_READY"

# 문제가 있는 Pod 확인
echo ""
FAILING_PODS=$(kubectl get pods -n bonanza-index --field-selector=status.phase!=Running,status.phase!=Succeeded -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
if [ ! -z "$FAILING_PODS" ]; then
    echo "⚠️  문제가 있는 Pod:"
    kubectl get pods -n bonanza-index --field-selector=status.phase!=Running,status.phase!=Succeeded
    echo ""
    echo "💡 ImagePullBackOff 오류가 발생한 경우:"
    echo "  - Docker 이미지를 빌드하고 각 노드에 로드하거나"
    echo "  - Docker 레지스트리에 푸시해야 합니다"
    echo "  - 자세한 내용은 k8s/TROUBLESHOOTING.md 참고"
else
    echo "✅ 모든 애플리케이션 Pod가 정상적으로 실행 중입니다!"
fi

echo ""
echo "⚠️  문제가 있는 Pod가 있는 경우 다음 명령어로 로그를 확인하세요:"
echo "  kubectl logs <pod-name> -n bonanza-index"
echo "  kubectl logs <pod-name> -n bonanza-index --previous  # 이전 컨테이너 로그"
echo ""
echo "📋 문제 진단 명령어:"
echo "  kubectl describe pod <pod-name> -n bonanza-index"
echo "  kubectl get events -n bonanza-index --sort-by='.lastTimestamp'"
echo ""

echo "✅ 애플리케이션 서비스 재배포 완료!"

