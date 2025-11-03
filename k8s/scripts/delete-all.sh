#!/bin/bash

set -e

echo "🗑️  Bonanza Index Kubernetes 리소스 전체 삭제"
echo ""
echo "⚠️  경고: 이 스크립트는 bonanza-index 네임스페이스의 모든 리소스를 삭제합니다."
echo ""

# 현재 배포 상태 확인
echo "📊 현재 배포 상태:"
echo "================================"
echo ""
kubectl get all -n bonanza-index 2>/dev/null || echo "bonanza-index 네임스페이스가 없습니다."
echo ""
kubectl get pvc -n bonanza-index 2>/dev/null || echo "PVC가 없습니다."
echo ""

# 삭제 확인
echo "⚠️  다음 리소스들이 삭제됩니다:"
echo "  - 모든 Deployment (애플리케이션 Pod)"
echo "  - 모든 StatefulSet (데이터베이스 Pod)"
echo "  - 모든 Service"
echo "  - 모든 ConfigMap"
echo "  - 모든 Secret"
echo "  - Ingress"
echo ""
read -p "정말 삭제하시겠습니까? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ 삭제가 취소되었습니다."
    exit 0
fi

# PVC 삭제 확인
echo ""
echo "⚠️  PVC(PersistentVolumeClaim) 삭제 여부 확인 (데이터 손실 가능)"
read -p "PVC도 모두 삭제하시겠습니까? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    DELETE_PVC=true
    echo "🗑️  PVC 삭제 포함"
else
    DELETE_PVC=false
    echo "ℹ️  PVC 유지 (데이터 보존)"
fi

echo ""
echo "⏳ 삭제 시작..."
echo ""

# Deployment 삭제
echo "🗑️  Deployment 삭제 중..."
kubectl delete deployment redis nginx -n bonanza-index --ignore-not-found=true
kubectl delete deployment index-endpoint -n bonanza-index --ignore-not-found=true
kubectl delete deployment index-calculator -n bonanza-index --ignore-not-found=true
kubectl delete deployment orderbook-collector -n bonanza-index --ignore-not-found=true
kubectl delete deployment ticker-collector -n bonanza-index --ignore-not-found=true
kubectl delete deployment orderbook-storage-worker -n bonanza-index --ignore-not-found=true
kubectl delete deployment ticker-storage-worker -n bonanza-index --ignore-not-found=true
kubectl delete deployment orderbook-aggregator -n bonanza-index --ignore-not-found=true
kubectl delete deployment telegram-log -n bonanza-index --ignore-not-found=true
kubectl delete deployment index-calc-fe -n bonanza-index --ignore-not-found=true

# StatefulSet 삭제
echo ""
echo "🗑️  StatefulSet 삭제 중..."
kubectl delete statefulset questdb mariadb -n bonanza-index --ignore-not-found=true

# Service 삭제
echo ""
echo "🗑️  Service 삭제 중..."
kubectl delete service redis-service questdb-service mariadb-service nginx-service -n bonanza-index --ignore-not-found=true
kubectl delete service index-endpoint-service index-calculator-service -n bonanza-index --ignore-not-found=true
kubectl delete service orderbook-collector-service ticker-collector-service -n bonanza-index --ignore-not-found=true
kubectl delete service orderbook-storage-worker-service ticker-storage-worker-service -n bonanza-index --ignore-not-found=true
kubectl delete service telegram-log-service index-calc-fe-service -n bonanza-index --ignore-not-found=true

# ConfigMap 삭제
echo ""
echo "🗑️  ConfigMap 삭제 중..."
kubectl delete configmap bonanza-common-config nginx-config -n bonanza-index --ignore-not-found=true

# Secret 삭제
echo ""
echo "🗑️  Secret 삭제 중..."
kubectl delete secret bonanza-secrets -n bonanza-index --ignore-not-found=true

# Ingress 삭제
echo ""
echo "🗑️  Ingress 삭제 중..."
kubectl delete ingress -n bonanza-index --all --ignore-not-found=true

# PVC 삭제 (선택적)
if [ "$DELETE_PVC" = true ]; then
    echo ""
    echo "🗑️  PVC 삭제 중..."
    kubectl delete pvc --all -n bonanza-index --ignore-not-found=true
fi

echo ""
echo "⏳ 삭제 완료 대기 중 (10초)..."
for i in {10..1}; do
    echo -ne "\r⏳ ${i}초 남음..."
    sleep 1
done
echo -e "\r⏳ 삭제 완료 대기 종료            "

# 최종 상태 확인
echo ""
echo "📊 삭제 후 상태 확인:"
echo "================================"
echo ""
echo "📦 Pod 상태:"
kubectl get pods -n bonanza-index 2>/dev/null || echo "Pod가 없습니다."

echo ""
echo "💾 PVC 상태:"
kubectl get pvc -n bonanza-index 2>/dev/null || echo "PVC가 없습니다."

echo ""
echo "🔍 Service 상태:"
kubectl get svc -n bonanza-index 2>/dev/null || echo "Service가 없습니다."

# 네임스페이스 삭제 여부 확인
echo ""
echo "⚠️  네임스페이스 삭제 여부 확인"
read -p "bonanza-index 네임스페이스도 삭제하시겠습니까? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  네임스페이스 삭제 중..."
    kubectl delete namespace bonanza-index --ignore-not-found=true
    echo "✅ 네임스페이스 삭제 완료"
else
    echo "ℹ️  네임스페이스 유지"
fi

echo ""
echo "✅ 모든 리소스 삭제 완료!"
