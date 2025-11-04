#!/bin/bash

# 이미지를 Kubernetes 노드에 로드하는 스크립트

set -e

echo "📦 Docker 이미지를 Kubernetes 노드에 로드"
echo "================================"
echo ""

# 이미지 이름 prefix
IMAGE_PREFIX="bonanza-index"

# 로드할 서비스 목록
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

# 노드 이름 입력 (기본값: app-node-wsl)
read -p "노드 이름을 입력하세요 (기본값: app-node-wsl): " NODE_NAME
NODE_NAME=${NODE_NAME:-app-node-wsl}

echo ""
echo "📋 노드 확인..."
if ! kubectl get node "$NODE_NAME" &>/dev/null; then
    echo "❌ 노드 '$NODE_NAME'를 찾을 수 없습니다"
    echo ""
    echo "사용 가능한 노드:"
    kubectl get nodes
    exit 1
fi

NODE_IP=$(kubectl get node "$NODE_NAME" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "")
echo "   ✅ 노드 발견: $NODE_NAME ($NODE_IP)"
echo ""

# 서비스 선택 메뉴
echo "📦 로드할 서비스 선택:"
echo ""
echo "   0) 전체 서비스 로드"
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
    echo "✅ 전체 서비스 로드 선택됨"
elif [[ "$SELECTION" =~ ^[1-9][0-9]*$ ]] && [ "$SELECTION" -ge 1 ] && [ "$SELECTION" -le "${#SERVICES[@]}" ]; then
    # 개별 서비스 선택
    INDEX=$((SELECTION - 1))
    SELECTED_SERVICES=("${SERVICES[$INDEX]}")
    echo ""
    echo "✅ ${SELECTED_SERVICES[0]} 로드 선택됨"
else
    echo ""
    echo "❌ 잘못된 선택입니다. 0-${#SERVICES[@]} 사이의 숫자를 입력하세요."
    exit 1
fi

echo ""
echo "📋 로드할 서비스 목록:"
for SERVICE in "${SELECTED_SERVICES[@]}"; do
    echo "   - $SERVICE"
done
echo ""

# 방법 선택
echo "📋 이미지 로드 방법 선택:"
echo "   1. 이미지를 tar.gz로 저장 후 노드에 전송 (scp 필요)"
echo "   2. 직접 노드에 접속하여 로드 (수동)"
echo ""
read -p "선택하세요 (1 또는 2, 기본값: 1): " METHOD
METHOD=${METHOD:-1}

echo ""

if [ "$METHOD" = "1" ]; then
    # 방법 1: 이미지 저장 후 전송
    echo "📦 방법 1: 이미지 저장 후 전송"
    echo ""
    
    # 이미지 저장 디렉토리
    SAVE_DIR="images"
    mkdir -p "$SAVE_DIR"
    
    echo "1️⃣  이미지를 tar.gz로 저장 중..."
    SAVE_SUCCESS=0
    SAVE_FAILED=0
    
    for SERVICE in "${SELECTED_SERVICES[@]}"; do
        IMAGE_NAME="${IMAGE_PREFIX}/${SERVICE}:latest"
        OUTPUT_FILE="${SAVE_DIR}/${SERVICE}.tar.gz"
        
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
    done
    
    echo ""
    echo "   저장 완료: $SAVE_SUCCESS 개"
    echo ""
    
    echo "2️⃣  노드에 이미지 전송 및 로드..."
    echo ""
    read -p "노드 접속 사용자 이름 (기본값: 현재 사용자): " NODE_USER
    NODE_USER=${NODE_USER:-$USER}
    
    echo ""
    echo "   다음 명령어를 노드($NODE_NAME)에서 실행하세요:"
    echo ""
    echo "   또는 scp로 전송:"
    echo "   scp ${SAVE_DIR}/*.tar.gz ${NODE_USER}@${NODE_IP}:/tmp/"
    echo ""
    echo "   노드에서 로드:"
    for SERVICE in "${SELECTED_SERVICES[@]}"; do
        echo "   docker load < /tmp/${SERVICE}.tar.gz"
    done
    
elif [ "$METHOD" = "2" ]; then
    # 방법 2: 직접 로드
    echo "📦 방법 2: 노드에 직접 접속하여 로드"
    echo ""
    
    echo "노드($NODE_NAME)에 SSH로 접속하여 다음 명령어를 실행하세요:"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    for SERVICE in "${SELECTED_SERVICES[@]}"; do
        IMAGE_NAME="${IMAGE_PREFIX}/${SERVICE}:latest"
        
        # 이미지 존재 확인
        if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${IMAGE_NAME}$"; then
            echo "# ${SERVICE}"
            echo "docker save ${IMAGE_NAME} | gzip > /tmp/${SERVICE}.tar.gz"
            echo "docker load < /tmp/${SERVICE}.tar.gz"
            echo ""
        fi
    done
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "또는 마스터 노드에서 이미지를 노드로 직접 복사:"
    echo ""
    echo "1. 마스터 노드에서 이미지 저장:"
    echo "   ./save-images.sh"
    echo ""
    echo "2. 노드로 전송:"
    echo "   scp images/*.tar.gz ${NODE_USER}@${NODE_IP}:/tmp/"
    echo ""
    echo "3. 노드에서 로드:"
    for SERVICE in "${SELECTED_SERVICES[@]}"; do
        echo "   docker load < /tmp/${SERVICE}.tar.gz"
    done
fi

echo ""
echo "💡 이미지 로드 확인:"
echo "   노드에서 실행: docker images | grep bonanza-index"
echo ""

