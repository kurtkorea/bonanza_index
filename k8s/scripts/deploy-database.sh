#!/bin/bash

set -e

# 스크립트 디렉토리에서 상위 디렉토리(k8s/)로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "🔄 데이터베이스 및 Nginx 재배포 시작..."

# 기존 리소스 삭제
echo ""
echo "🗑️  기존 리소스 삭제 중..."
kubectl delete deployment redis nginx -n bonanza-index --ignore-not-found=true
kubectl delete statefulset mariadb questdb -n bonanza-index --ignore-not-found=true
kubectl delete configmap nginx-config -n bonanza-index --ignore-not-found=true

echo ""
echo "⚠️  PVC 삭제 여부 확인 (데이터 손실 가능)"
read -p "PVC를 모두 삭제하시겠습니까? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  PVC 삭제 중..."
    kubectl delete pvc --all -n bonanza-index --ignore-not-found=true
else
    echo "ℹ️  PVC 유지 (기존 데이터 보존)"
fi

echo ""
for i in {5..1}; do
    echo -ne "⏳ 대기 중... (${i})\r"
    sleep 1
done
echo -ne "⏳ 대기 종료          \n"

# StorageClass 생성
echo ""
echo "💾 StorageClass 확인..."
kubectl apply -f storageclass-local-path-immediate.yaml

# 공통 ConfigMap 확인 (필요시)
echo ""
echo "⚙️  공통 리소스 확인..."
kubectl apply -f configmap-common.yaml --dry-run=client -o yaml | kubectl apply -f -

# 데이터베이스 서비스 재배포
echo ""
echo "🗄️  데이터베이스 서비스 재배포 중..."
# Redis PVC는 Deployment이므로 명시적으로 생성 필요
if ! kubectl get pvc redis-data -n bonanza-index &>/dev/null; then
    echo "  - Redis PVC 생성 중..."
    kubectl apply -f redis/pvc.yaml
fi
echo "  - Redis 배포 중..."
kubectl apply -f redis/
echo "  - QuestDB 배포 중..."
kubectl apply -f questdb/
echo "  - MariaDB 배포 중..."
kubectl apply -f mariadb/

# Nginx 재배포 (ConfigMap 포함)
echo ""
echo "🌐 Nginx 재배포 중..."
echo "  - ConfigMap 적용 중..."
kubectl apply -f nginx/configmap.yaml
echo "  - Deployment 적용 중..."
kubectl apply -f nginx/deployment.yaml
echo "  - Service 적용 중..."
kubectl apply -f nginx/service.yaml

echo ""
echo "⏳ 배포 완료 대기 중 (30초)..."
for i in {30..1}; do
    echo -ne "⏳ 남은 시간: ${i}초\r"
    sleep 1
done
echo -ne "⏳ 대기 종료          \n"

echo ""
echo "✅ 배포 상태 확인"
echo "================================"
echo ""
echo "📦 Pod 상태 (데이터베이스 + Nginx):"
kubectl get pods -n bonanza-index -o wide | grep -E "(redis|questdb|mariadb|nginx)"

echo ""
echo "💾 PVC 상태:"
kubectl get pvc -n bonanza-index

echo ""
echo "🔍 서비스 상태:"
kubectl get svc -n bonanza-index | grep -E "(redis|questdb|mariadb|nginx)"

echo ""
echo "📊 Pod 상세 상태:"
echo ""
echo "QuestDB:"
kubectl get pod questdb-0 -n bonanza-index -o jsonpath='{.status.phase}' 2>/dev/null || echo "N/A"
kubectl get pod questdb-0 -n bonanza-index -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A"
echo ""

echo "MariaDB:"
kubectl get pod mariadb-0 -n bonanza-index -o jsonpath='{.status.phase}' 2>/dev/null || echo "N/A"
kubectl get pod mariadb-0 -n bonanza-index -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A"
echo ""

echo "Redis:"
kubectl get pods -n bonanza-index -l app=redis -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A"
kubectl get pods -n bonanza-index -l app=redis -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A"
echo ""

echo "Nginx:"
kubectl get pods -n bonanza-index -l app=nginx -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A"
kubectl get pods -n bonanza-index -l app=nginx -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A"
echo ""

# 문제가 있는 Pod 로그 확인 옵션
echo ""
echo "⚠️  문제가 있는 Pod가 있는 경우 다음 명령어로 로그를 확인하세요:"
echo "  kubectl logs <pod-name> -n bonanza-index"
echo "  kubectl logs <pod-name> -n bonanza-index --previous  # 이전 컨테이너 로그"
echo ""
echo "📋 문제 진단 명령어:"
echo "  kubectl describe pod <pod-name> -n bonanza-index"
echo "  kubectl get events -n bonanza-index --sort-by='.lastTimestamp'"
echo ""

echo "✅ 재배포 완료!"
