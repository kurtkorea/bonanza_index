#!/bin/bash

set -e

echo "🚀 Bonanza Index Kubernetes 배포 시작..."

# 네임스페이스 생성
echo "📦 네임스페이스 생성 중..."
kubectl apply -f namespace.yaml

# StorageClass 생성 (Immediate 모드)
echo "💾 StorageClass 생성 중..."
kubectl apply -f storageclass-local-path-immediate.yaml

# 공통 리소스
echo "⚙️  공통 리소스 배포 중..."
kubectl apply -f configmap-common.yaml
kubectl apply -f secret.yaml

# 데이터베이스 서비스 배포 (마스터 노드: 121.88.4.81)
echo "🗄️  데이터베이스 서비스 배포 중 (마스터 노드)..."
kubectl apply -f redis/pvc.yaml
kubectl apply -f redis/
kubectl apply -f questdb/
kubectl apply -f mariadb/

# Nginx 배포 (마스터 노드: 121.88.4.81)
echo "🌐 Nginx 배포 중 (마스터 노드)..."
kubectl apply -f nginx/

# 백엔드 서비스 배포 (워커 노드: 121.88.4.57)
echo "🔧 백엔드 서비스 배포 중 (워커 노드)..."
kubectl apply -f index-endpoint/
kubectl apply -f index-calculator/
kubectl apply -f orderbook-collector/
kubectl apply -f ticker-collector/
kubectl apply -f orderbook-storage-worker/
kubectl apply -f ticker-storage-worker/
kubectl apply -f orderbook-aggregator/
kubectl apply -f telegram-log/

# 프론트엔드 배포 (워커 노드: 121.88.4.57)
echo "🎨 프론트엔드 배포 중 (워커 노드)..."
kubectl apply -f index-calc-fe/

# Ingress 배포
echo "🌐 Ingress 배포 중..."
kubectl apply -f ingress.yaml

echo ""
echo "✅ 배포 완료!"
echo ""
echo "📊 배포 상태 확인:"
kubectl get pods -n bonanza-index
echo ""
echo "🌐 서비스 확인:"
kubectl get svc -n bonanza-index
echo ""
echo "📡 Ingress 확인:"
kubectl get ingress -n bonanza-index
echo ""
echo "📍 노드별 Pod 배치 확인:"
kubectl get pods -n bonanza-index -o wide --sort-by=.spec.nodeName

