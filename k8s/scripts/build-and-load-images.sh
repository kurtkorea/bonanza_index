#!/bin/bash

# 단일 머신 구성용 이미지 빌드 및 로드 스크립트
# Docker 이미지를 빌드하고 k3s containerd에 로드합니다

set -e

# 스크립트 디렉토리에서 프로젝트 루트로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "🐳 Bonanza Index 이미지 빌드 및 로드"
echo "================================"
echo ""

# Docker 확인
if ! command -v docker &>/dev/null; then
    echo "❌ Docker가 설치되어 있지 않습니다"
    exit 1
fi

# Docker daemon 확인
if ! docker info > /dev/null 2>&1; then
    echo "⚠️  Docker daemon에 연결할 수 없습니다"
    echo "   Docker 서비스를 시작하세요: sudo systemctl start docker"
    exit 1
fi

# containerd socket 확인
CONTAINERD_SOCKET=""
if [ -f "/run/k3s/containerd/containerd.sock" ]; then
    CONTAINERD_SOCKET="/run/k3s/containerd/containerd.sock"
elif [ -f "/run/containerd/containerd.sock" ]; then
    CONTAINERD_SOCKET="/run/containerd/containerd.sock"
else
    echo "❌ containerd socket을 찾을 수 없습니다"
    exit 1
fi

echo "✅ containerd socket: $CONTAINERD_SOCKET"
echo ""

# 빌드할 서비스 목록
BACKEND_SERVICES=(
    "index-endpoint"
    "index-calculator"
    "orderbook-collector"
    "ticker-collector"
    "orderbook-storage-worker"
    "ticker-storage-worker"
    "orderbook-aggregator"
    "telegram-log"
)

FRONTEND_SERVICES=(
    "index-calc-fe"
)

echo "📦 빌드할 서비스:"
echo "   백엔드: ${BACKEND_SERVICES[*]}"
echo "   프론트엔드: ${FRONTEND_SERVICES[*]}"
echo ""
read -p "계속하시겠습니까? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 취소되었습니다"
    exit 0
fi

echo ""
echo "================================"
echo "1️⃣  백엔드 이미지 빌드"
echo "================================"
echo ""

cd "$PROJECT_ROOT/be"
BUILD_SUCCESS=0
BUILD_FAILED=0

for SERVICE in "${BACKEND_SERVICES[@]}"; do
    IMAGE_NAME="bonanza-index/${SERVICE}:latest"
    
    if [ ! -d "$SERVICE" ]; then
        echo "⚠️  ${SERVICE} 디렉토리를 찾을 수 없습니다. 건너뜁니다."
        BUILD_FAILED=$((BUILD_FAILED + 1))
        continue
    fi
    
    echo "🔨 ${SERVICE} 빌드 중..."
    cd "$SERVICE"
    
    if docker build -t "$IMAGE_NAME" . 2>&1; then
        echo "   ✅ ${SERVICE} 빌드 완료"
        BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
        
        # k3s containerd에 로드
        echo "   📥 ${SERVICE} 이미지 로드 중..."
        if docker save "$IMAGE_NAME" | sudo ctr --address "$CONTAINERD_SOCKET" -n k8s.io images import - 2>&1; then
            echo "   ✅ ${SERVICE} 로드 완료"
        else
            echo "   ⚠️  ${SERVICE} 로드 실패 (수동으로 로드 필요)"
        fi
    else
        echo "   ❌ ${SERVICE} 빌드 실패"
        BUILD_FAILED=$((BUILD_FAILED + 1))
    fi
    
    cd "$PROJECT_ROOT/be"
    echo ""
done

echo ""
echo "================================"
echo "2️⃣  프론트엔드 이미지 빌드"
echo "================================"
echo ""

cd "$PROJECT_ROOT/fe"

for SERVICE in "${FRONTEND_SERVICES[@]}"; do
    IMAGE_NAME="bonanza-index/${SERVICE}:latest"
    
    if [ ! -d "$SERVICE" ]; then
        echo "⚠️  ${SERVICE} 디렉토리를 찾을 수 없습니다. 건너뜁니다."
        BUILD_FAILED=$((BUILD_FAILED + 1))
        continue
    fi
    
    echo "🔨 ${SERVICE} 빌드 중..."
    cd "$SERVICE"
    
    if docker build -t "$IMAGE_NAME" . 2>&1; then
        echo "   ✅ ${SERVICE} 빌드 완료"
        BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
        
        # k3s containerd에 로드
        echo "   📥 ${SERVICE} 이미지 로드 중..."
        if docker save "$IMAGE_NAME" | sudo ctr --address "$CONTAINERD_SOCKET" -n k8s.io images import - 2>&1; then
            echo "   ✅ ${SERVICE} 로드 완료"
        else
            echo "   ⚠️  ${SERVICE} 로드 실패 (수동으로 로드 필요)"
        fi
    else
        echo "   ❌ ${SERVICE} 빌드 실패"
        BUILD_FAILED=$((BUILD_FAILED + 1))
    fi
    
    cd "$PROJECT_ROOT/fe"
    echo ""
done

echo ""
echo "================================"
echo "📊 결과 요약"
echo "================================"
echo "   ✅ 성공: $BUILD_SUCCESS"
echo "   ❌ 실패: $BUILD_FAILED"
echo ""

# 로드된 이미지 확인
echo "📋 로드된 이미지 확인:"
sudo ctr --address "$CONTAINERD_SOCKET" -n k8s.io images list | grep "bonanza-index" || echo "   이미지 없음"
echo ""

if [ $BUILD_FAILED -eq 0 ]; then
    echo "✅ 모든 이미지 빌드 및 로드 완료!"
    echo ""
    echo "💡 이제 Pod를 배포할 수 있습니다:"
    echo "   kubectl apply -f k8s/"
else
    echo "⚠️  일부 이미지 빌드/로드 실패"
    echo ""
    echo "💡 수동으로 이미지 로드:"
    echo "   docker save bonanza-index/<service>:latest | sudo ctr --address $CONTAINERD_SOCKET -n k8s.io images import -"
fi

echo ""

