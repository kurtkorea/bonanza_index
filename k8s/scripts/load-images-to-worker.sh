#!/bin/bash

# 단일 노드 클러스터에 deploy-worker.sh에서 사용하는 이미지들을 로드하는 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "📦 단일 노드에 이미지 로드"
echo "================================"
echo ""

# deploy-worker.sh에서 배포하는 서비스 목록
REQUIRED_IMAGES=(
    "bonanza-index/index-endpoint:latest"
    "bonanza-index/index-calculator:latest"
    "bonanza-index/orderbook-collector:latest"
    "bonanza-index/ticker-collector:latest"
    "bonanza-index/orderbook-storage-worker:latest"
    "bonanza-index/ticker-storage-worker:latest"
    "bonanza-index/orderbook-aggregator:latest"
    "bonanza-index/telegram-log:latest"
    "bonanza-index/index-calc-fe:latest"
)

# 워커 노드 확인 (app-server=true 라벨이 있는 노드)
WORKER_NODES=$(kubectl get nodes -l app-server=true --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null)

# 워커 노드가 없으면 모든 노드 사용 (단일 노드 클러스터 대응)
if [ -z "$WORKER_NODES" ]; then
    echo "⚠️  app-server=true 라벨을 가진 워커 노드를 찾을 수 없습니다"
    echo "   모든 노드를 사용합니다 (단일 노드 클러스터 모드)"
    echo ""
    WORKER_NODES=$(kubectl get nodes --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null)
fi

echo "✅ 사용할 노드:"
WORKER_NODE_LIST=()
while IFS= read -r node; do
    if [ ! -z "$node" ]; then
        NODE_IP=$(kubectl get node "$node" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "")
        NODE_ROLES=$(kubectl get node "$node" -o jsonpath='{.metadata.labels.node-role\.kubernetes\.io/.*}' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
        if [ -z "$NODE_ROLES" ]; then
            NODE_ROLES="worker"
        fi
        echo "   - $node ($NODE_IP) [${NODE_ROLES}]"
        WORKER_NODE_LIST+=("$node")
    fi
done <<< "$WORKER_NODES"
echo ""

# 첫 번째 노드 사용 (단일 노드 모드)
TARGET_NODE="${WORKER_NODE_LIST[0]}"
TARGET_NODE_INTERNAL_IP=$(kubectl get node "$TARGET_NODE" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "")
TARGET_NODE_EXTERNAL_IP=$(kubectl get node "$TARGET_NODE" -o jsonpath='{.status.addresses[?(@.type=="ExternalIP")].address}' 2>/dev/null || echo "")

echo "📋 로드할 이미지 목록:"
for IMAGE in "${REQUIRED_IMAGES[@]}"; do
    echo "   - $IMAGE"
done
echo ""

# 마스터 노드에서 이미지 확인
echo "🔍 마스터 노드에서 이미지 확인 중..."
echo ""

AVAILABLE_IMAGES=()
IMAGE_STATUS=()

for IMAGE in "${REQUIRED_IMAGES[@]}"; do
    SERVICE=$(echo "$IMAGE" | cut -d'/' -f2 | cut -d':' -f1)
    
    # Docker 확인
    if command -v docker &> /dev/null && docker images --format "{{.Repository}}:{{.Tag}}" 2>/dev/null | grep -q "^${IMAGE}$"; then
        echo "   ✅ $IMAGE (Docker에 있음)"
        AVAILABLE_IMAGES+=("$IMAGE")
        IMAGE_STATUS+=("docker")
    # containerd 확인
    elif sudo ctr -n k8s.io images list 2>/dev/null | grep -q "${IMAGE}"; then
        echo "   ✅ $IMAGE (containerd에 있음)"
        AVAILABLE_IMAGES+=("$IMAGE")
        IMAGE_STATUS+=("containerd")
    else
        echo "   ❌ $IMAGE (없음)"
        IMAGE_STATUS+=("missing")
    fi
done

echo ""
echo "================================"
echo "🐳 Docker 이미지 빌드 선택"
echo "================================"
echo ""
echo "빌드할 이미지를 선택하세요 (복수 선택 가능, 쉼표로 구분):"
echo ""
echo "   0) 전체 이미지 빌드"
echo ""

for i in "${!REQUIRED_IMAGES[@]}"; do
    INDEX=$((i + 1))
    IMAGE="${REQUIRED_IMAGES[$i]}"
    SERVICE=$(echo "$IMAGE" | cut -d'/' -f2 | cut -d':' -f1)
    STATUS="${IMAGE_STATUS[$i]}"
    
    if [ "$STATUS" = "missing" ]; then
        STATUS_ICON="❌"
    elif [ "$STATUS" = "docker" ]; then
        STATUS_ICON="✅ (Docker)"
    else
        STATUS_ICON="✅ (containerd)"
    fi
    
    echo "   ${INDEX}) ${SERVICE} ${STATUS_ICON}"
done

echo "   q) 빌드 건너뛰기"
echo ""
read -p "선택하세요 (예: 1,3,5 또는 0): " BUILD_SELECTION

# 빌드할 이미지 목록
IMAGES_TO_BUILD=()

if [ "$BUILD_SELECTION" = "q" ] || [ "$BUILD_SELECTION" = "Q" ]; then
    echo ""
    echo "빌드를 건너뜁니다"
elif [ "$BUILD_SELECTION" = "0" ]; then
    IMAGES_TO_BUILD=("${REQUIRED_IMAGES[@]}")
    echo ""
    echo "✅ 전체 이미지 빌드 선택됨"
elif [[ "$BUILD_SELECTION" =~ ^[0-9,]+$ ]]; then
    # 쉼표로 구분된 선택 처리
    IFS=',' read -ra SELECTED <<< "$BUILD_SELECTION"
    for SEL in "${SELECTED[@]}"; do
        # 공백 제거
        SEL=$(echo "$SEL" | xargs)
        
        if [[ "$SEL" =~ ^[1-9][0-9]*$ ]] && [ "$SEL" -ge 1 ] && [ "$SEL" -le "${#REQUIRED_IMAGES[@]}" ]; then
            INDEX=$((SEL - 1))
            IMAGES_TO_BUILD+=("${REQUIRED_IMAGES[$INDEX]}")
        else
            echo ""
            echo "⚠️  잘못된 선택: $SEL (건너뜀)"
        fi
    done
    
    if [ ${#IMAGES_TO_BUILD[@]} -eq 0 ]; then
        echo ""
        echo "❌ 유효한 이미지가 선택되지 않았습니다"
        echo "빌드를 건너뜁니다"
    else
        echo ""
        echo "✅ 선택된 이미지 (${#IMAGES_TO_BUILD[@]}개):"
        for IMAGE in "${IMAGES_TO_BUILD[@]}"; do
            SERVICE=$(echo "$IMAGE" | cut -d'/' -f2 | cut -d':' -f1)
            echo "   - $SERVICE"
        done
    fi
else
    echo ""
    echo "❌ 잘못된 선택입니다. 빌드를 건너뜁니다"
fi

# 이미지 빌드 실행
if [ ${#IMAGES_TO_BUILD[@]} -gt 0 ]; then
    echo ""
    echo "================================"
    echo "🐳 Docker 이미지 빌드"
    echo "================================"
    echo ""
    
    # Docker 확인
    if ! command -v docker &>/dev/null; then
        echo "❌ Docker가 설치되어 있지 않습니다"
        echo "   Docker 설치 후 다시 실행하세요"
        exit 1
    fi
    
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
    
    # 프로젝트 루트 확인
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
    
    # 선택된 이미지 빌드
    BUILD_SUCCESS=0
    BUILD_FAILED=0
    
    for IMAGE in "${IMAGES_TO_BUILD[@]}"; do
        SERVICE=$(echo "$IMAGE" | cut -d'/' -f2 | cut -d':' -f1)
        IMAGE_NAME="bonanza-index/${SERVICE}:latest"
        
        echo "🔨 ${SERVICE} 빌드 중..."
        
        # 서비스 디렉토리 확인
        if [[ "$SERVICE" == "index-calc-fe" ]]; then
            SERVICE_DIR="$PROJECT_ROOT/fe/$SERVICE"
        else
            SERVICE_DIR="$PROJECT_ROOT/be/$SERVICE"
        fi
        
        if [ ! -d "$SERVICE_DIR" ]; then
            echo "   ❌ ${SERVICE_DIR} 디렉토리를 찾을 수 없습니다"
            BUILD_FAILED=$((BUILD_FAILED + 1))
            continue
        fi
        
        if [ ! -f "$SERVICE_DIR/Dockerfile" ]; then
            echo "   ❌ ${SERVICE_DIR}/Dockerfile을 찾을 수 없습니다"
            BUILD_FAILED=$((BUILD_FAILED + 1))
            continue
        fi
        
        cd "$SERVICE_DIR"
        
        if docker build -t "$IMAGE_NAME" . 2>&1; then
            echo "   ✅ ${SERVICE} 빌드 완료"
            BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
            
            # 빌드된 이미지를 AVAILABLE_IMAGES에 추가 (중복 방지)
            if [[ ! " ${AVAILABLE_IMAGES[@]} " =~ " ${IMAGE_NAME} " ]]; then
                AVAILABLE_IMAGES+=("$IMAGE_NAME")
            fi
        else
            echo "   ❌ ${SERVICE} 빌드 실패"
            BUILD_FAILED=$((BUILD_FAILED + 1))
        fi
        
        cd "$PROJECT_ROOT"
        echo ""
    done
    
    echo "📊 빌드 결과:"
    echo "   ✅ 성공: $BUILD_SUCCESS"
    echo "   ❌ 실패: $BUILD_FAILED"
    echo ""
    
    if [ $BUILD_FAILED -gt 0 ]; then
        echo "⚠️  일부 이미지 빌드에 실패했습니다"
        echo ""
        read -p "계속하시겠습니까? (빌드 실패한 이미지는 건너뜁니다) (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ 취소되었습니다"
            exit 1
        fi
    fi
fi

echo ""

if [ ${#AVAILABLE_IMAGES[@]} -eq 0 ]; then
    echo "❌ 로드할 이미지가 없습니다"
    exit 1
fi

# 이미지 선택 메뉴
echo ""
echo "================================"
echo "📋 이미지 선택"
echo "================================"
echo ""
echo "사용 가능한 이미지:"
echo ""
SELECTED_IMAGES=()

if [ ${#AVAILABLE_IMAGES[@]} -gt 0 ]; then
    for i in "${!AVAILABLE_IMAGES[@]}"; do
        INDEX=$((i + 1))
        IMAGE="${AVAILABLE_IMAGES[$i]}"
        SERVICE=$(echo "$IMAGE" | cut -d'/' -f2 | cut -d':' -f1)
        echo "   ${INDEX}) ${SERVICE}"
    done
    echo "   a) 모든 이미지 선택"
    echo "   q) 종료"
    echo ""
    read -p "로드할 이미지를 선택하세요 (번호 또는 'a' 또는 'q', 여러 개 선택 시 쉼표로 구분): " SELECTION
    
    if [[ "$SELECTION" == "q" ]] || [[ "$SELECTION" == "Q" ]]; then
        echo "❌ 취소되었습니다"
        exit 0
    fi
    
    if [[ "$SELECTION" == "a" ]] || [[ "$SELECTION" == "A" ]]; then
        SELECTED_IMAGES=("${AVAILABLE_IMAGES[@]}")
        echo ""
        echo "✅ 모든 이미지 선택됨 (${#SELECTED_IMAGES[@]}개)"
    elif [[ "$SELECTION" =~ ^[0-9,]+$ ]]; then
        # 쉼표로 구분된 선택 처리
        IFS=',' read -ra SELECTED <<< "$SELECTION"
        for SEL in "${SELECTED[@]}"; do
            # 공백 제거
            SEL=$(echo "$SEL" | xargs)
            
            if [[ "$SEL" =~ ^[1-9][0-9]*$ ]] && [ "$SEL" -ge 1 ] && [ "$SEL" -le "${#AVAILABLE_IMAGES[@]}" ]; then
                INDEX=$((SEL - 1))
                SELECTED_IMAGES+=("${AVAILABLE_IMAGES[$INDEX]}")
            else
                echo ""
                echo "⚠️  잘못된 번호: $SEL (건너뜀)"
            fi
        done
        
        if [ ${#SELECTED_IMAGES[@]} -eq 0 ]; then
            echo "❌ 선택된 이미지가 없습니다"
            exit 1
        fi
        
        echo ""
        echo "✅ 선택된 이미지 (${#SELECTED_IMAGES[@]}개):"
        for IMAGE in "${SELECTED_IMAGES[@]}"; do
            SERVICE=$(echo "$IMAGE" | cut -d'/' -f2 | cut -d':' -f1)
            echo "   - $SERVICE"
        done
    fi
else
    echo "❌ 사용 가능한 이미지가 없습니다"
    exit 1
fi

echo ""
echo "================================"
echo "📦 이미지 저장 및 전송"
echo "================================"
echo ""

# 임시 디렉토리 생성
TEMP_DIR=$(mktemp -d)
echo "📁 임시 디렉토리: $TEMP_DIR"
echo ""

SAVED_FILES=()

# 이미지 저장
for IMAGE in "${SELECTED_IMAGES[@]}"; do
    SERVICE=$(echo "$IMAGE" | cut -d'/' -f2 | cut -d':' -f1)
    OUTPUT_FILE="$TEMP_DIR/${SERVICE}.tar.gz"
    
    echo "📦 $SERVICE 이미지 저장 중..."
    
    # Docker에서 저장
    if command -v docker &> /dev/null && docker images --format "{{.Repository}}:{{.Tag}}" 2>/dev/null | grep -q "^${IMAGE}$"; then
        if docker save "${IMAGE}" | gzip > "$OUTPUT_FILE" 2>/dev/null; then
            FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
            echo "   ✅ 저장 완료 (${FILE_SIZE})"
            SAVED_FILES+=("$OUTPUT_FILE")
        else
            echo "   ❌ 저장 실패"
        fi
    # containerd에서 저장
    elif sudo ctr -n k8s.io images list 2>/dev/null | grep -q "${IMAGE}"; then
        # containerd에서 export
        if sudo ctr -n k8s.io images export "$OUTPUT_FILE" "${IMAGE}" 2>/dev/null; then
            FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
            echo "   ✅ 저장 완료 (${FILE_SIZE})"
            SAVED_FILES+=("$OUTPUT_FILE")
        else
            echo "   ❌ 저장 실패"
        fi
    fi
    echo ""
done

if [ ${#SAVED_FILES[@]} -eq 0 ]; then
    echo "❌ 저장된 이미지 파일이 없습니다"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo ""
echo "================================"
echo "📥 단일 노드에서 이미지 로드"
echo "================================"
echo ""

# 단일 노드 모드: SSH 전송 불필요, 로컬에서 직접 로드
echo "✅ 단일 노드 모드: 로컬에서 직접 이미지 로드"
echo ""

# k3s containerd 소켓 경로 찾기
K3S_SOCKET="/run/k3s/containerd/containerd.sock"

# containerd 확인
if ! command -v ctr &> /dev/null; then
    echo "❌ ctr 명령어를 찾을 수 없습니다"
    exit 1
fi

# 이미지 로드
for FILE in "${SAVED_FILES[@]}"; do
    FILENAME=$(basename "$FILE")
    SERVICE=$(basename "$FILENAME" .tar.gz)
    echo "📦 $SERVICE 이미지 로드 중..."
    
    if sudo ctr --address "$K3S_SOCKET" -n k8s.io images import "$FILE" 2>&1; then
        echo "   ✅ $SERVICE 완료"
    else
        echo "   ❌ $SERVICE 실패"
    fi
    echo ""
done

echo "📋 로드된 이미지 확인:"
sudo ctr --address "$K3S_SOCKET" -n k8s.io images list | grep bonanza-index || echo "   이미지가 없습니다"
echo ""

echo ""
echo "================================"
echo "✅ 이미지 로드 완료"
echo "================================"
echo ""

# 임시 디렉토리 정리
rm -rf "$TEMP_DIR"

echo "💡 다음 단계:"
echo "   1. 이미지 로드 확인: sudo ctr --address $K3S_SOCKET -n k8s.io images list | grep bonanza-index"
echo "   2. Pod 상태 확인: kubectl get pods -n bonanza-index"
echo ""

