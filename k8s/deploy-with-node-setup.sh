#!/bin/bash

set -e

echo "🚀 Bonanza Index Kubernetes 배포 시작..."
echo ""

# 마스터 노드 확인
echo "📋 마스터 노드 확인 중..."
MASTER_NODE=$(kubectl get nodes -o wide | grep 121.88.4.81 | awk '{print $1}' | head -n 1)

if [ -z "$MASTER_NODE" ]; then
    echo "⚠️  경고: IP 121.88.4.81을 가진 마스터 노드를 찾을 수 없습니다."
    echo "   마스터 노드는 자동으로 라벨이 설정되어야 합니다."
    echo "   노드 목록:"
    kubectl get nodes -o wide
else
    echo "✅ 마스터 노드 발견: $MASTER_NODE"
    echo "   QuestDB, Redis, MariaDB가 이 노드에 배포됩니다."
fi

# 워커 노드 확인 및 라벨 추가
echo ""
echo "📋 워커 노드 확인 중..."
APP_SERVER_NODE=$(kubectl get nodes -o wide | grep 121.88.4.57 | awk '{print $1}' | head -n 1)

if [ -z "$APP_SERVER_NODE" ]; then
    echo "❌ 오류: IP 121.88.4.57을 가진 워커 노드를 찾을 수 없습니다."
    echo "   노드 목록:"
    kubectl get nodes -o wide
    exit 1
fi

echo "✅ 워커 노드 발견: $APP_SERVER_NODE"

# 워커 노드 라벨 추가
echo "🏷️  워커 노드 라벨 추가 중..."
kubectl label nodes "$APP_SERVER_NODE" app-server=true --overwrite

# 라벨 확인
if kubectl get node "$APP_SERVER_NODE" --show-labels | grep -q "app-server=true"; then
    echo "✅ 워커 노드 라벨 설정 완료"
else
    echo "⚠️  경고: 워커 노드 라벨 설정을 확인할 수 없습니다."
fi

echo ""
echo "📦 네임스페이스 생성 중..."
kubectl apply -f namespace.yaml

# StorageClass 생성 (Immediate 모드)
echo "💾 StorageClass 생성 중..."
kubectl apply -f storageclass-local-path-immediate.yaml

# 공통 리소스
echo "⚙️  공통 리소스 배포 중..."
kubectl apply -f configmap-common.yaml
kubectl apply -f secret.yaml

# 데이터베이스 서비스 배포 (마스터 노드)
echo "🗄️  데이터베이스 서비스 배포 중 (마스터 노드: 121.88.4.81)..."
kubectl apply -f redis/pvc.yaml
kubectl apply -f redis/
kubectl apply -f questdb/
kubectl apply -f mariadb/

# Nginx 배포 (마스터 노드: 121.88.4.81)
echo "🌐 Nginx 배포 중 (마스터 노드: 121.88.4.81)..."
kubectl apply -f nginx/

# 백엔드 서비스 배포 (워커 노드)
echo "🔧 백엔드 서비스 배포 중 (워커 노드: 121.88.4.57)..."
kubectl apply -f index-endpoint/
kubectl apply -f index-calculator/
kubectl apply -f orderbook-collector/
kubectl apply -f ticker-collector/
kubectl apply -f orderbook-storage-worker/
kubectl apply -f ticker-storage-worker/
kubectl apply -f orderbook-aggregator/
kubectl apply -f telegram-log/

# 프론트엔드 배포 (워커 노드)
echo "🎨 프론트엔드 배포 중 (워커 노드: 121.88.4.57)..."
kubectl apply -f index-calc-fe/

# Ingress 배포
echo "🌐 Ingress 배포 중..."
kubectl apply -f ingress.yaml

echo ""
echo "✅ 배포 완료!"
echo ""
echo "📊 배포 상태 확인:"
sleep 5
kubectl get pods -n bonanza-index -o wide
echo ""
echo "🌐 서비스 확인:"
kubectl get svc -n bonanza-index
echo ""
echo "📍 노드별 Pod 배치 확인:"
kubectl get pods -n bonanza-index -o wide --sort-by=.spec.nodeName
echo ""
echo "🗄️  데이터베이스 Pod (마스터 노드):"
kubectl get pods -n bonanza-index -o wide | grep -E "(questdb|redis|mariadb)"
echo ""
echo "🔧 애플리케이션 Pod (워커 노드):"
kubectl get pods -n bonanza-index -o wide | grep -vE "(questdb|redis|mariadb)"
echo ""
echo "📡 Ingress 확인:"
kubectl get ingress -n bonanza-index

