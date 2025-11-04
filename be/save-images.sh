#!/bin/bash

# 빌드된 Docker 이미지를 tar.gz 파일로 저장하는 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "💾 Docker 이미지 저장"
echo "================================"
echo ""

# 이미지 이름 prefix
IMAGE_PREFIX="bonanza-index"

# 저장할 서비스 목록
SERVICES=(
    "index-endpoint"
    "index-calculator"
    "orderbook-collector"
    "ticker-collector"
    "orderbook-storage-worker"
    "ticker-storage-worker"
    "orderbook-aggregator"
    "telegram-log"
)

# 메뉴 표시
echo "💾 저장할 서비스 선택:"
echo ""
echo "   0) 전체 서비스 저장"
echo ""
for i in "${!SERVICES[@]}"; do
    INDEX=$((i + 1))
    echo "   ${INDEX}) ${SERVICES[$i]}"
done
echo ""
read -p "선택하세요 (0-${#SERVICES[@]}): " SELECTION

# 선택된 서비스 목록
SELECTED_SERVICES=()

if [ "$SELECTION" = "0" ]; then
    # 전체 서비스 선택
    SELECTED_SERVICES=("${SERVICES[@]}")
    echo ""
    echo "✅ 전체 서비스 저장 선택됨"
elif [[ "$SELECTION" =~ ^[1-9][0-9]*$ ]] && [ "$SELECTION" -ge 1 ] && [ "$SELECTION" -le "${#SERVICES[@]}" ]; then
    # 개별 서비스 선택
    INDEX=$((SELECTION - 1))
    SELECTED_SERVICES=("${SERVICES[$INDEX]}")
    echo ""
    echo "✅ ${SELECTED_SERVICES[0]} 저장 선택됨"
else
    echo ""
    echo "❌ 잘못된 선택입니다. 0-${#SERVICES[@]} 사이의 숫자를 입력하세요."
    exit 1
fi

# 저장 디렉토리
SAVE_DIR="images"
mkdir -p "$SAVE_DIR"

echo ""
echo "📦 저장 디렉토리: $SAVE_DIR"
echo ""
echo "📋 저장할 서비스 목록:"
for SERVICE in "${SELECTED_SERVICES[@]}"; do
    echo "   - $SERVICE"
done
echo ""

SAVE_SUCCESS=0
SAVE_FAILED=0

for SERVICE in "${SELECTED_SERVICES[@]}"; do
    IMAGE_NAME="${IMAGE_PREFIX}/${SERVICE}:latest"
    OUTPUT_FILE="${SAVE_DIR}/${SERVICE}.tar.gz"
    
    echo "💾 ${SERVICE} 저장 중..."
    
    # 이미지 존재 확인
    if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${IMAGE_NAME}$"; then
        echo "   ⚠️  ${IMAGE_NAME} 이미지가 없습니다. 건너뜁니다."
        SAVE_FAILED=$((SAVE_FAILED + 1))
        continue
    fi
    
    # 이미지 저장
    if docker save "${IMAGE_NAME}" | gzip > "${OUTPUT_FILE}"; then
        FILE_SIZE=$(du -h "${OUTPUT_FILE}" | cut -f1)
        echo "   ✅ ${SERVICE} 저장 완료: ${OUTPUT_FILE} (${FILE_SIZE})"
        SAVE_SUCCESS=$((SAVE_SUCCESS + 1))
    else
        echo "   ❌ ${SERVICE} 저장 실패"
        SAVE_FAILED=$((SAVE_FAILED + 1))
    fi
    
    echo ""
done

echo "================================"
echo "📊 저장 결과 요약"
echo "================================"
echo "✅ 성공: $SAVE_SUCCESS"
echo "❌ 실패: $SAVE_FAILED"
echo ""

if [ $SAVE_SUCCESS -gt 0 ]; then
    echo "📁 저장된 파일 위치:"
    ls -lh "$SAVE_DIR"/*.tar.gz 2>/dev/null | awk '{print "   " $9 " (" $5 ")"}'
    echo ""
    echo "💡 각 노드에 로드하는 방법:"
    echo "   docker load < ${SAVE_DIR}/<service-name>.tar.gz"
    echo ""
    echo "   또는 모든 이미지를 한 번에 전송:"
    echo "   scp ${SAVE_DIR}/*.tar.gz user@node:/tmp/"
    echo "   # 노드에서:"
    echo "   docker load < /tmp/<service-name>.tar.gz"
fi

echo ""

if [ $SAVE_FAILED -eq 0 ]; then
    echo "✅ 모든 이미지 저장 완료!"
    exit 0
else
    echo "⚠️  일부 이미지 저장 실패"
    exit 1
fi

