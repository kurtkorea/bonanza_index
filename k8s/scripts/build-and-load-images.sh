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
        echo "   ⚠️  일반 사용자로 Docker에 접근할 수 없습니다"
        
        # sudo로 확인
        if sudo docker info > /dev/null 2>&1; then
            echo "   ✅ sudo로는 Docker에 접근 가능합니다"
            echo ""
            echo "💡 Docker 그룹 권한 문제입니다. 해결 방법:"
            echo "   1. 현재 사용자를 docker 그룹에 추가:"
            echo "      sudo usermod -aG docker $USER"
            echo ""
            echo "   2. 그룹 변경 적용 (선택):"
            echo "      newgrp docker"
            echo "      또는 로그아웃 후 다시 로그인"
            echo ""
            echo "   3. 또는 이 스크립트를 sudo로 실행하거나"
            echo "      스크립트가 자동으로 sudo를 사용합니다"
            echo ""
            read -p "sudo를 사용하여 계속하시겠습니까? (y/N): " -n 1 -r
            echo ""
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                DOCKER_USE_SUDO=true
                echo "   ✅ sudo 모드로 진행합니다"
            else
                echo "   ❌ 취소되었습니다"
                echo ""
                echo "💡 다음 명령을 실행한 후 다시 시도하세요:"
                echo "   sudo usermod -aG docker $USER"
                echo "   newgrp docker"
                exit 1
            fi
        else
            echo "   ❌ sudo로도 Docker에 접근할 수 없습니다"
            echo ""
            echo "💡 Docker 서비스 상태 확인:"
            sudo systemctl status docker || true
            echo ""
            echo "💡 Docker 로그 확인:"
            echo "   sudo journalctl -u docker -n 20"
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

if [ -z "$CONTAINERD_SOCKET" ]; then
    echo "   ❌ containerd socket을 찾을 수 없습니다"
    echo ""
    echo "💡 가능한 경로 확인:"
    for SOCKET_PATH in "${POSSIBLE_PATHS[@]}"; do
        if [ -e "$SOCKET_PATH" ]; then
            echo "   - $SOCKET_PATH (존재하지만 소켓이 아님)"
        else
            echo "   - $SOCKET_PATH (없음)"
        fi
    done
    echo ""
    echo "💡 k3s containerd socket 찾기:"
    echo "   sudo find /run /var/run -name 'containerd.sock' 2>/dev/null"
    echo ""
    echo "💡 또는 k3s가 실행 중인지 확인:"
    echo "   sudo systemctl status k3s"
    echo "   kubectl get nodes"
    echo ""
    read -p "수동으로 socket 경로를 입력하시겠습니까? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "containerd socket 경로를 입력하세요: " MANUAL_SOCKET
        if [ -S "$MANUAL_SOCKET" ] || [ -f "$MANUAL_SOCKET" ]; then
            CONTAINERD_SOCKET="$MANUAL_SOCKET"
            echo "   ✅ 경로 설정: $CONTAINERD_SOCKET"
        else
            echo "   ❌ 입력한 경로가 유효하지 않습니다: $MANUAL_SOCKET"
            exit 1
        fi
    else
        exit 1
    fi
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

# ddl 폴더를 사용하는 서비스 목록
DDL_SERVICES=("orderbook-collector" "ticker-collector" "orderbook-storage-worker" "ticker-storage-worker")

for SERVICE in "${BACKEND_SERVICES[@]}"; do
    IMAGE_NAME="bonanza-index/${SERVICE}:latest"
    
    if [ ! -d "$SERVICE" ]; then
        echo "⚠️  ${SERVICE} 디렉토리를 찾을 수 없습니다. 건너뜁니다."
        BUILD_FAILED=$((BUILD_FAILED + 1))
        continue
    fi
    
    echo "🔨 ${SERVICE} 빌드 중..."
    
    # ddl 폴더를 사용하는 서비스인지 확인
    USE_DDL_CONTEXT=false
    for DDL_SERVICE in "${DDL_SERVICES[@]}"; do
        if [ "$SERVICE" = "$DDL_SERVICE" ]; then
            USE_DDL_CONTEXT=true
            break
        fi
    done
    
    if [ "$USE_DDL_CONTEXT" = true ]; then
        # ddl 폴더를 사용하는 서비스는 be 디렉토리를 빌드 컨텍스트로 사용
        echo "   📁 빌드 컨텍스트: $PROJECT_ROOT/be"
        if docker_cmd build -f "$SERVICE/Dockerfile" -t "$IMAGE_NAME" "$PROJECT_ROOT/be" 2>&1; then
            echo "   ✅ ${SERVICE} 빌드 완료"
            BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
            
            # k3s containerd에 로드
            echo "   📥 ${SERVICE} 이미지 로드 중..."
            if docker_cmd save "$IMAGE_NAME" | sudo ctr --address "$CONTAINERD_SOCKET" -n k8s.io images import - 2>&1; then
                echo "   ✅ ${SERVICE} 로드 완료"
            else
                echo "   ⚠️  ${SERVICE} 로드 실패 (수동으로 로드 필요)"
            fi
        else
            echo "   ❌ ${SERVICE} 빌드 실패"
            BUILD_FAILED=$((BUILD_FAILED + 1))
        fi
    else
        # 다른 서비스는 기존 방식대로
        cd "$SERVICE"
        echo "   📁 빌드 컨텍스트: $PROJECT_ROOT/be/$SERVICE"
        if docker_cmd build -t "$IMAGE_NAME" . 2>&1; then
            echo "   ✅ ${SERVICE} 빌드 완료"
            BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
            
            # k3s containerd에 로드
            echo "   📥 ${SERVICE} 이미지 로드 중..."
            if docker_cmd save "$IMAGE_NAME" | sudo ctr --address "$CONTAINERD_SOCKET" -n k8s.io images import - 2>&1; then
                echo "   ✅ ${SERVICE} 로드 완료"
            else
                echo "   ⚠️  ${SERVICE} 로드 실패 (수동으로 로드 필요)"
            fi
        else
            echo "   ❌ ${SERVICE} 빌드 실패"
            BUILD_FAILED=$((BUILD_FAILED + 1))
        fi
        cd "$PROJECT_ROOT/be"
    fi
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
    
    if docker_cmd build -t "$IMAGE_NAME" . 2>&1; then
        echo "   ✅ ${SERVICE} 빌드 완료"
        BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
        
        # k3s containerd에 로드
        echo "   📥 ${SERVICE} 이미지 로드 중..."
        if docker_cmd save "$IMAGE_NAME" | sudo ctr --address "$CONTAINERD_SOCKET" -n k8s.io images import - 2>&1; then
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

