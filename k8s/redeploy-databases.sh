#!/bin/bash

set -e

echo "🔄 데이터베이스 및 Nginx 재배포 시작..."

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

echo ""
echo "⏳ 배포 완료 대기 중 (15초)..."
sleep 15

echo ""
echo "✅ 배포 상태 확인"
echo "================================"
echo ""
echo "📦 Pod 상태 (데이터베이스 + Nginx):"
kubectl get pods -n bonanza-index | grep -E "(redis|questdb|mariadb|nginx)"

echo ""
echo "💾 PVC 상태:"
kubectl get pvc -n bonanza-index

echo ""
echo "✅ 재배포 완료!"

