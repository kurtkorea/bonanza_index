#!/bin/bash

set -e

echo "🔄 전체 재배포 시작..."

# 기존 리소스 삭제
echo ""
echo "🗑️  기존 리소스 삭제 중..."
kubectl delete deployment redis nginx -n bonanza-index --ignore-not-found=true
kubectl delete statefulset mariadb questdb -n bonanza-index --ignore-not-found=true
kubectl delete pvc --all -n bonanza-index --ignore-not-found=true

echo ""
echo "⏳ 대기 중 (5초)..."
sleep 5

# StorageClass 생성
echo ""
echo "💾 StorageClass 확인..."
kubectl apply -f storageclass-local-path-immediate.yaml

# 네임스페이스 및 기본 리소스
echo ""
echo "📦 네임스페이스 및 기본 리소스..."
kubectl apply -f namespace.yaml
kubectl apply -f configmap-common.yaml
kubectl apply -f secret.yaml

# 데이터베이스 서비스 재배포
echo ""
echo "🗄️  데이터베이스 서비스 재배포 중..."
kubectl apply -f redis/pvc.yaml
kubectl apply -f redis/
kubectl apply -f questdb/
kubectl apply -f mariadb/

# Nginx 재배포
echo ""
echo "🌐 Nginx 재배포 중..."
kubectl apply -f nginx/

# 백엔드 서비스 재배포
echo ""
echo "🔧 백엔드 서비스 재배포 중..."
kubectl apply -f index-endpoint/
kubectl apply -f index-calculator/
kubectl apply -f orderbook-collector/
kubectl apply -f ticker-collector/
kubectl apply -f orderbook-storage-worker/
kubectl apply -f ticker-storage-worker/
kubectl apply -f orderbook-aggregator/
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
echo "⏳ 배포 완료 대기 중 (15초)..."
sleep 15

echo ""
echo "✅ 배포 상태 확인"
echo "================================"
echo ""
echo "📦 Pod 상태:"
kubectl get pods -n bonanza-index

echo ""
echo "💾 PVC 상태:"
kubectl get pvc -n bonanza-index

echo ""
echo "🌐 서비스:"
kubectl get svc -n bonanza-index

echo ""
echo "📍 노드별 Pod 배치:"
kubectl get pods -n bonanza-index -o wide --sort-by=.spec.nodeName

echo ""
echo "✅ 재배포 완료!"

