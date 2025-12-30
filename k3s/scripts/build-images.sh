#!/bin/bash

# Bonanza Index Docker 이미지 빌드 스크립트
# 사용법: ./build-images.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Docker 확인
if ! command -v docker &>/dev/null; then
    echo "❌ Docker가 설치되어 있지 않습니다"
    echo "   Docker 설치 후 다시 실행하세요"
    exit 1
fi

# Docker daemon 확인
if ! docker info > /dev/null 2>&1; then
    echo "⚠️  Docker daemon에 연결할 수 없습니다"
    echo ""
    echo "해결 방법:"
    echo "  1. Docker 서비스 시작: sudo systemctl start docker"
    echo "  2. docker 그룹에 사용자 추가: sudo usermod -aG docker \$USER"
    echo "  3. 로그아웃 후 다시 로그인"
    echo "  4. 또는 sudo로 실행"
    exit 1
fi

# 이미지 이름 prefix
IMAGE_PREFIX="bonanza-index"

# 빌드할 서비스 목록
declare -A SERVICES
SERVICES[1]="index-calculator"
SERVICES[2]="index-endpoint"
SERVICES[3]="orderbook-collector"
SERVICES[4]="ticker-collector"
SERVICES[5]="orderbook-storage-worker"
SERVICES[6]="ticker-storage-worker"
SERVICES[7]="telegram-log"
SERVICES[8]="index-calc-fe"
SERVICES[9]="all"

# 빌드 컨텍스트 설정
declare -A BUILD_CONTEXT
BUILD_CONTEXT[index-calculator]="be/index-calculator"
BUILD_CONTEXT[index-endpoint]="be/index-endpoint"
BUILD_CONTEXT[orderbook-collector]="be"
BUILD_CONTEXT[ticker-collector]="be"
BUILD_CONTEXT[orderbook-storage-worker]="be"
BUILD_CONTEXT[ticker-storage-worker]="be"
BUILD_CONTEXT[telegram-log]="be/telegram-log"
BUILD_CONTEXT[index-calc-fe]="fe/index-calc-fe"

# Dockerfile 경로
declare -A DOCKERFILE_PATH
DOCKERFILE_PATH[index-calculator]="."
DOCKERFILE_PATH[index-endpoint]="."
DOCKERFILE_PATH[orderbook-collector]="orderbook-collector/Dockerfile"
DOCKERFILE_PATH[ticker-collector]="ticker-collector/Dockerfile"
DOCKERFILE_PATH[orderbook-storage-worker]="orderbook-storage-worker/Dockerfile"
DOCKERFILE_PATH[ticker-storage-worker]="ticker-storage-worker/Dockerfile"
DOCKERFILE_PATH[telegram-log]="."
DOCKERFILE_PATH[index-calc-fe]="."

# 메뉴 표시
show_menu() {
    echo "=========================================="
    echo "  Bonanza Index Docker 이미지 빌드"
    echo "=========================================="
    echo ""
    echo "빌드할 서비스를 선택하세요:"
    echo ""
    echo "  1) index-calculator"
    echo "  2) index-endpoint"
    echo "  3) orderbook-collector"
    echo "  4) ticker-collector"
    echo "  5) orderbook-storage-worker"
    echo "  6) ticker-storage-worker"
    echo "  7) telegram-log"
    echo "  8) index-calc-fe"
    echo "  9) 모든 서비스 (all)"
    echo "  0) 종료"
    echo ""
    echo -n "선택 [0-9]: "
}

# 서비스 빌드 함수
build_service() {
    local service=$1
    local context_dir="${BUILD_CONTEXT[$service]}"
    local dockerfile="${DOCKERFILE_PATH[$service]}"
    local image_name="${IMAGE_PREFIX}/${service}:latest"
    local build_dir="${PROJECT_ROOT}/${context_dir}"
    
    echo ""
    echo "🔨 ${service} 빌드 중..."
    echo "   이미지: ${image_name}"
    echo "   디렉토리: ${build_dir}"
    echo "   Dockerfile: ${dockerfile}"
    
    # 디렉토리 확인
    if [ ! -d "$build_dir" ]; then
        echo "   ❌ ${build_dir} 디렉토리를 찾을 수 없습니다"
        return 1
    fi
    
    cd "$build_dir"
    
    # Dockerfile 확인
    if [ "$dockerfile" = "." ]; then
        if [ ! -f "Dockerfile" ]; then
            echo "   ❌ Dockerfile을 찾을 수 없습니다"
            cd "$PROJECT_ROOT"
            return 1
        fi
        dockerfile="Dockerfile"
    else
        if [ ! -f "$dockerfile" ]; then
            echo "   ❌ ${dockerfile}을 찾을 수 없습니다"
            cd "$PROJECT_ROOT"
            return 1
        fi
    fi
    
    # Docker 이미지 빌드
    if [ "$dockerfile" = "Dockerfile" ] && [ "$context_dir" != "be" ]; then
        # 일반적인 경우: Dockerfile이 현재 디렉토리에 있음
        if docker build -t "$image_name" .; then
            echo "   ✅ ${service} 빌드 완료"
            cd "$PROJECT_ROOT"
            return 0
        else
            echo "   ❌ ${service} 빌드 실패"
            cd "$PROJECT_ROOT"
            return 1
        fi
    else
        # be 디렉토리에서 빌드하는 경우: -f 옵션 사용
        if docker build -f "$dockerfile" -t "$image_name" .; then
            echo "   ✅ ${service} 빌드 완료"
            cd "$PROJECT_ROOT"
            return 0
        else
            echo "   ❌ ${service} 빌드 실패"
            cd "$PROJECT_ROOT"
            return 1
        fi
    fi
}

# 모든 서비스 빌드
build_all() {
    echo ""
    echo "🔨 모든 서비스 빌드 시작..."
    echo ""
    
    local build_success=0
    local build_failed=0
    
    for service in index-calculator index-endpoint orderbook-collector ticker-collector orderbook-storage-worker ticker-storage-worker telegram-log index-calc-fe; do
        if build_service "$service"; then
            build_success=$((build_success + 1))
        else
            build_failed=$((build_failed + 1))
        fi
        echo ""
    done
    
    echo "=========================================="
    echo "📊 빌드 결과 요약"
    echo "=========================================="
    echo "✅ 성공: $build_success"
    echo "❌ 실패: $build_failed"
    echo ""
    
    if [ $build_failed -eq 0 ]; then
        echo "✅ 모든 이미지 빌드 완료!"
        return 0
    else
        echo "⚠️  일부 이미지 빌드에 실패했습니다"
        return 1
    fi
}

# 메인 로직
main() {
    cd "$PROJECT_ROOT"
    
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1)
                build_service "index-calculator"
                ;;
            2)
                build_service "index-endpoint"
                ;;
            3)
                build_service "orderbook-collector"
                ;;
            4)
                build_service "ticker-collector"
                ;;
            5)
                build_service "orderbook-storage-worker"
                ;;
            6)
                build_service "ticker-storage-worker"
                ;;
            7)
                build_service "telegram-log"
                ;;
            8)
                build_service "index-calc-fe"
                ;;
            9)
                build_all
                ;;
            0)
                echo ""
                echo "종료합니다."
                exit 0
                ;;
            *)
                echo ""
                echo "❌ 잘못된 선택입니다. 0-9 사이의 숫자를 입력하세요."
                echo ""
                sleep 1
                ;;
        esac
        
        if [ $choice -ge 1 ] && [ $choice -le 8 ]; then
            echo ""
            echo "📋 현재 빌드된 이미지 목록:"
            docker images | grep "${IMAGE_PREFIX}" | head -10 || echo "이미지가 없습니다."
            echo ""
            echo "계속하려면 Enter를 누르세요..."
            read -r
        fi
    done
}

# 스크립트 실행
main

