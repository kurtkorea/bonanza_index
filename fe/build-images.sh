#!/bin/bash

# 백엔드 서비스 Docker 이미지 빌드 스크립트

set -e

# be 디렉토리에서 실행
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🐳 백엔드 서비스 Docker 이미지 빌드"
echo "================================"
echo ""

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
SERVICES=(
    "index-calc-fe"
)

echo "📦 빌드할 서비스 목록:"
for SERVICE in "${SERVICES[@]}"; do
    echo "   - $SERVICE"
done
echo ""

# 각 서비스 빌드
BUILD_SUCCESS=0
BUILD_FAILED=0

for SERVICE in "${SERVICES[@]}"; do
    echo "🔨 ${SERVICE} 빌드 중..."
    
    SERVICE_DIR="$SERVICE"
    
    # 서비스 디렉토리 확인
    if [ ! -d "$SERVICE_DIR" ]; then
        echo "   ❌ ${SERVICE_DIR} 디렉토리를 찾을 수 없습니다. 건너뜁니다."
        BUILD_FAILED=$((BUILD_FAILED + 1))
        continue
    fi
    
    # Dockerfile 확인
    if [ ! -f "$SERVICE_DIR/Dockerfile" ]; then
        echo "   ❌ ${SERVICE_DIR}/Dockerfile을 찾을 수 없습니다. 건너뜁니다."
        BUILD_FAILED=$((BUILD_FAILED + 1))
        continue
    fi
    
    cd "$SERVICE_DIR"
    
    # 이미지 이름
    IMAGE_NAME="${IMAGE_PREFIX}/${SERVICE}:latest"
    
    # Docker 이미지 빌드
    echo "   📦 이미지: ${IMAGE_NAME}"
    echo "   📁 디렉토리: $(pwd)"
    if docker build -t "${IMAGE_NAME}" .; then
        echo "   ✅ ${SERVICE} 빌드 완료"
        BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
    else
        echo "   ❌ ${SERVICE} 빌드 실패"
        BUILD_FAILED=$((BUILD_FAILED + 1))
    fi
    
    cd "$SCRIPT_DIR"
    echo ""
done

echo "================================"
echo "📊 빌드 결과 요약"
echo "================================"
echo "✅ 성공: $BUILD_SUCCESS"
echo "❌ 실패: $BUILD_FAILED"
echo ""

if [ $BUILD_FAILED -gt 0 ]; then
    echo "⚠️  일부 이미지 빌드에 실패했습니다"
    echo "   실패한 서비스의 Dockerfile과 소스 코드를 확인하세요"
    echo ""
fi

echo "📋 빌드된 이미지 목록:"
docker images | grep "${IMAGE_PREFIX}" || echo "이미지가 없습니다."
echo ""

echo "💡 다음 단계:"
echo "   1. 이미지를 각 Kubernetes 노드에 로드:"
echo "      docker save <image-name> | gzip > <image-name>.tar.gz"
echo "      # 각 노드에서: docker load < <image-name>.tar.gz"
echo ""
echo "   2. 또는 애플리케이션 배포:"
echo "      cd ../k8s/scripts && ./deploy-applications.sh"
echo ""

if [ $BUILD_FAILED -eq 0 ]; then
    echo "✅ 모든 이미지 빌드 완료!"
    exit 0
else
    echo "⚠️  일부 이미지 빌드 실패"
    exit 1
fi

