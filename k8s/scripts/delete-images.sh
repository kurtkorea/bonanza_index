#!/bin/bash

# Bonanza Index Docker 이미지 삭제 스크립트
# Docker와 k3s containerd에서 이미지를 삭제합니다

set -e

# 스크립트 디렉토리에서 프로젝트 루트로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "🗑️  Bonanza Index Docker 이미지 삭제"
echo "================================"
echo ""

# Docker 확인
if ! command -v docker &>/dev/null; then
    echo "❌ Docker가 설치되어 있지 않습니다"
    exit 1
fi

# Docker daemon 확인 및 시작
DOCKER_USE_SUDO=false
if ! docker info > /dev/null 2>&1; then
    echo "⚠️  Docker daemon에 연결할 수 없습니다"
    echo ""
    
    # Docker 서비스 시작 시도
    echo "🔧 Docker 서비스 시작 시도 중..."
    if sudo systemctl start docker 2>/dev/null; then
        echo "   ✅ Docker 서비스 시작됨"
        sleep 2
    fi
    
    # 다시 확인 (일반 사용자)
    if ! docker info > /dev/null 2>&1; then
        # sudo로 확인
        if sudo docker info > /dev/null 2>&1; then
            DOCKER_USE_SUDO=true
            echo "   ✅ sudo 모드로 진행합니다"
        else
            echo "   ❌ Docker에 접근할 수 없습니다"
            exit 1
        fi
    fi
fi

# Docker 명령어 래퍼 함수
docker_cmd() {
    if [ "$DOCKER_USE_SUDO" = true ]; then
        sudo docker "$@"
    else
        docker "$@"
    fi
}

# containerd socket 확인
CONTAINERD_SOCKET=""
POSSIBLE_PATHS=(
    "/run/k3s/containerd/containerd.sock"
    "/var/run/k3s/containerd/containerd.sock"
    "/run/containerd/containerd.sock"
    "/var/run/containerd/containerd.sock"
)

echo "🔍 containerd socket 찾는 중..."
for SOCKET_PATH in "${POSSIBLE_PATHS[@]}"; do
    if [ -S "$SOCKET_PATH" ] || [ -f "$SOCKET_PATH" ]; then
        CONTAINERD_SOCKET="$SOCKET_PATH"
        echo "   ✅ 발견: $SOCKET_PATH"
        break
    fi
done

# 삭제할 이미지 목록
IMAGES=(
    "bonanza-index/index-endpoint:latest"
    "bonanza-index/index-calculator:latest"
    "bonanza-index/orderbook-collector:latest"
    "bonanza-index/ticker-collector:latest"
    "bonanza-index/orderbook-storage-worker:latest"
    "bonanza-index/ticker-storage-worker:latest"
    "bonanza-index/telegram-log:latest"
    "bonanza-index/index-calc-fe:latest"
)

echo ""
echo "📋 삭제할 이미지 목록:"
for IMAGE in "${IMAGES[@]}"; do
    echo "   - $IMAGE"
done
echo ""

# 삭제 옵션 선택
echo "삭제 옵션을 선택하세요:"
echo "  1) Docker 이미지만 삭제"
echo "  2) k3s containerd 이미지만 삭제"
echo "  3) Docker + k3s containerd 모두 삭제"
echo "  4) 취소"
echo ""
read -p "선택 (1-4): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[1-3]$ ]]; then
    echo "❌ 취소되었습니다"
    exit 0
fi

DELETE_DOCKER=false
DELETE_CONTAINERD=false

case $REPLY in
    1)
        DELETE_DOCKER=true
        ;;
    2)
        DELETE_CONTAINERD=true
        ;;
    3)
        DELETE_DOCKER=true
        DELETE_CONTAINERD=true
        ;;
esac

echo ""
echo "⚠️  경고: 선택한 이미지들이 삭제됩니다!"
read -p "정말 삭제하시겠습니까? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 취소되었습니다"
    exit 0
fi

echo ""
echo "================================"
echo "🗑️  이미지 삭제 시작"
echo "================================"
echo ""

DELETED_COUNT=0
FAILED_COUNT=0

# Docker 이미지 삭제
if [ "$DELETE_DOCKER" = true ]; then
    echo "📦 Docker 이미지 삭제 중..."
    echo ""
    
    for IMAGE in "${IMAGES[@]}"; do
        echo "   🗑️  $IMAGE 삭제 중..."
        
        # 이미지가 존재하는지 확인
        if docker_cmd images -q "$IMAGE" > /dev/null 2>&1; then
            # 이미지 사용 중인 컨테이너 확인
            CONTAINERS=$(docker_cmd ps -a --filter "ancestor=$IMAGE" --format "{{.ID}}" 2>/dev/null || true)
            
            if [ -n "$CONTAINERS" ]; then
                echo "      ⚠️  이미지를 사용 중인 컨테이너가 있습니다"
                echo "      컨테이너 ID: $CONTAINERS"
                read -p "      컨테이너를 먼저 삭제하시겠습니까? (y/N): " -n 1 -r
                echo ""
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    echo "      🗑️  컨테이너 삭제 중..."
                    echo "$CONTAINERS" | xargs -r docker_cmd rm -f 2>/dev/null || true
                else
                    echo "      ⚠️  컨테이너가 있어 이미지 삭제를 건너뜁니다"
                    FAILED_COUNT=$((FAILED_COUNT + 1))
                    continue
                fi
            fi
            
            # 이미지 삭제
            if docker_cmd rmi "$IMAGE" 2>&1; then
                echo "      ✅ 삭제 완료"
                DELETED_COUNT=$((DELETED_COUNT + 1))
            else
                echo "      ❌ 삭제 실패"
                FAILED_COUNT=$((FAILED_COUNT + 1))
            fi
        else
            echo "      ℹ️  이미지가 존재하지 않습니다 (건너뜀)"
        fi
        echo ""
    done
fi

# k3s containerd 이미지 삭제
if [ "$DELETE_CONTAINERD" = true ]; then
    if [ -z "$CONTAINERD_SOCKET" ]; then
        echo "⚠️  containerd socket을 찾을 수 없어 k3s 이미지 삭제를 건너뜁니다"
    else
        echo "📦 k3s containerd 이미지 삭제 중..."
        echo ""
        
        for IMAGE in "${IMAGES[@]}"; do
            echo "   🗑️  $IMAGE 삭제 중..."
            
            # containerd에서 실제 이미지 이름 찾기 (docker.io/ prefix 포함)
            ACTUAL_IMAGE=$(sudo ctr --address "$CONTAINERD_SOCKET" -n k8s.io images list | grep "$IMAGE" | awk '{print $1}' | head -n 1)
            
            if [ -z "$ACTUAL_IMAGE" ]; then
                echo "      ℹ️  이미지가 존재하지 않습니다 (건너뜀)"
            else
                echo "      📍 발견된 이미지: $ACTUAL_IMAGE"
                
                # containerd에서 이미지 삭제
                if sudo ctr --address "$CONTAINERD_SOCKET" -n k8s.io images rm "$ACTUAL_IMAGE" 2>&1; then
                    echo "      ✅ 삭제 완료"
                    DELETED_COUNT=$((DELETED_COUNT + 1))
                else
                    echo "      ❌ 삭제 실패"
                    FAILED_COUNT=$((FAILED_COUNT + 1))
                fi
            fi
            echo ""
        done
    fi
fi

echo ""
echo "================================"
echo "📊 삭제 결과"
echo "================================"
echo "   ✅ 삭제된 이미지: $DELETED_COUNT"
echo "   ❌ 실패: $FAILED_COUNT"
echo ""

# 남은 이미지 확인
if [ "$DELETE_DOCKER" = true ]; then
    echo "📋 남은 Docker 이미지:"
    docker_cmd images | grep "bonanza-index" || echo "   이미지 없음"
    echo ""
fi

if [ "$DELETE_CONTAINERD" = true ] && [ -n "$CONTAINERD_SOCKET" ]; then
    echo "📋 남은 k3s containerd 이미지:"
    sudo ctr --address "$CONTAINERD_SOCKET" -n k8s.io images list | grep "bonanza-index" || echo "   이미지 없음"
    echo ""
fi

echo "✅ 이미지 삭제 완료!"
echo ""

