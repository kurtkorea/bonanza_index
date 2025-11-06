#!/bin/bash

# 워커 노드(app-server)에 deploy-worker.sh에서 사용하는 이미지들을 로드하는 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "📦 워커 노드에 이미지 로드"
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

# 워커 노드 확인
WORKER_NODES=$(kubectl get nodes -l app-server=true --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null)
if [ -z "$WORKER_NODES" ]; then
    echo "❌ app-server=true 라벨을 가진 워커 노드를 찾을 수 없습니다"
    echo ""
    echo "사용 가능한 노드:"
    kubectl get nodes --show-labels
    echo ""
    echo "💡 워커 노드에 라벨 추가:"
    echo "   kubectl label nodes <node-name> app-server=true --overwrite"
    exit 1
fi

echo "✅ 워커 노드 발견:"
WORKER_NODE_LIST=()
while IFS= read -r node; do
    if [ ! -z "$node" ]; then
        NODE_IP=$(kubectl get node "$node" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "")
        echo "   - $node ($NODE_IP)"
        WORKER_NODE_LIST+=("$node")
    fi
done <<< "$WORKER_NODES"
echo ""

# 첫 번째 워커 노드 사용 (여러 개일 경우 확장 가능)
WORKER_NODE="${WORKER_NODE_LIST[0]}"
WORKER_NODE_INTERNAL_IP=$(kubectl get node "$WORKER_NODE" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "")
WORKER_NODE_EXTERNAL_IP=$(kubectl get node "$WORKER_NODE" -o jsonpath='{.status.addresses[?(@.type=="ExternalIP")].address}' 2>/dev/null || echo "")

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
echo "📤 워커 노드로 전송"
echo "================================"
echo ""

# SSH 사용자 확인 (기본값: bonanza)
read -p "워커 노드 SSH 사용자 (기본값: bonanza): " SSH_USER
SSH_USER=${SSH_USER:-bonanza}

# SSH 포트 확인 (기본값: 22)
read -p "SSH 포트 (기본값: 22): " SSH_PORT
SSH_PORT=${SSH_PORT:-22}

# IP 주소 선택
DEFAULT_WORKER_IP="121.88.4.57"
echo ""
echo "📡 IP 주소 선택:"
echo "   1) Internal IP: $WORKER_NODE_INTERNAL_IP"
if [ ! -z "$WORKER_NODE_EXTERNAL_IP" ]; then
    echo "   2) External IP: $WORKER_NODE_EXTERNAL_IP"
fi
echo "   3) 공인 IP (기본값: $DEFAULT_WORKER_IP)"
echo ""
read -p "선택하세요 (1-3, 기본값: 3): " IP_CHOICE
IP_CHOICE=${IP_CHOICE:-3}

case $IP_CHOICE in
    1)
        WORKER_NODE_IP="$WORKER_NODE_INTERNAL_IP"
        ;;
    2)
        if [ ! -z "$WORKER_NODE_EXTERNAL_IP" ]; then
            WORKER_NODE_IP="$WORKER_NODE_EXTERNAL_IP"
        else
            echo "⚠️  External IP가 없습니다. 공인 IP를 사용합니다."
            WORKER_NODE_IP="$DEFAULT_WORKER_IP"
        fi
        ;;
    3)
        read -p "워커 노드 IP 주소를 입력하세요 (기본값: $DEFAULT_WORKER_IP): " WORKER_NODE_IP
        WORKER_NODE_IP=${WORKER_NODE_IP:-$DEFAULT_WORKER_IP}
        ;;
    *)
        echo "❌ 잘못된 선택입니다"
        exit 1
        ;;
esac

echo ""
echo "📤 워커 노드 ($WORKER_NODE - $WORKER_NODE_IP)로 전송 중..."
echo ""

# 각 파일 전송
for FILE in "${SAVED_FILES[@]}"; do
    FILENAME=$(basename "$FILE")
    echo "   📤 ${FILENAME} 전송 중..."
    
    if scp -P "$SSH_PORT" "$FILE" "${SSH_USER}@${WORKER_NODE_IP}:/tmp/" 2>/dev/null; then
        echo "   ✅ ${FILENAME} 전송 완료"
    else
        echo "   ❌ ${FILENAME} 전송 실패"
        echo "      SSH 연결 확인: ssh -p $SSH_PORT ${SSH_USER}@${WORKER_NODE_IP}"
    fi
done

echo ""
echo "================================"
echo "📥 워커 노드에서 이미지 로드"
echo "================================"
echo ""

# k3s containerd 소켓 경로 찾기
K3S_SOCKET="/run/k3s/containerd/containerd.sock"

# 자동 실행 스크립트 생성
LOAD_SCRIPT="/tmp/load-images.sh"
echo "📝 자동 실행 스크립트 생성 중..."
cat > /tmp/load-images-remote.sh << EOF
#!/bin/bash
set -e
echo "📦 이미지 로드 시작..."
echo ""
EOF

for FILE in "${SAVED_FILES[@]}"; do
    FILENAME=$(basename "$FILE")
    SERVICE=$(basename "$FILENAME" .tar.gz)
    cat >> /tmp/load-images-remote.sh << EOF
echo "📦 $SERVICE 이미지 로드 중..."
if sudo ctr --address $K3S_SOCKET -n k8s.io images import /tmp/${FILENAME} 2>/dev/null; then
    echo "   ✅ $SERVICE 완료"
else
    echo "   ❌ $SERVICE 실패"
fi
echo ""
EOF
done

cat >> /tmp/load-images-remote.sh << EOF
echo "📋 로드된 이미지 확인:"
sudo ctr --address $K3S_SOCKET -n k8s.io images list | grep bonanza-index || echo "   이미지가 없습니다"
echo ""
echo "✅ 이미지 로드 완료"
EOF

# 스크립트를 워커 노드로 전송
echo "📤 로드 스크립트 전송 중..."
if scp -P "$SSH_PORT" /tmp/load-images-remote.sh "${SSH_USER}@${WORKER_NODE_IP}:/tmp/load-images.sh" 2>/dev/null; then
    echo "   ✅ 스크립트 전송 완료"
else
    echo "   ⚠️  스크립트 전송 실패 (수동 실행 필요)"
fi

# 자동 실행 여부 확인
echo ""
read -p "워커 노드에서 이미지를 자동으로 로드하시겠습니까? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 워커 노드에서 이미지 로드 중..."
    echo ""
    echo "⚠️  SSH 비밀번호 입력이 필요할 수 있습니다."
    echo ""
    
    # SSH 키 기반 인증 확인
    if ssh -o BatchMode=yes -o ConnectTimeout=5 -p "$SSH_PORT" "${SSH_USER}@${WORKER_NODE_IP}" "echo 'SSH key auth OK'" 2>/dev/null; then
        # SSH 키 기반 인증 성공 - 비밀번호 없이 실행
        echo "✅ SSH 키 기반 인증 확인됨"
        echo ""
        ssh -p "$SSH_PORT" "${SSH_USER}@${WORKER_NODE_IP}" << 'REMOTE_EOF'
            chmod +x /tmp/load-images.sh
            if sudo -n true 2>/dev/null; then
                # 비밀번호 없는 sudo 사용 가능
                sudo /tmp/load-images.sh
            else
                echo "⚠️  sudo 비밀번호가 필요합니다. 수동으로 실행하세요:"
                echo "   sudo /tmp/load-images.sh"
                exit 1
            fi
REMOTE_EOF
    else
        # SSH 비밀번호 인증 또는 키 없음
        echo "⚠️  SSH 키 기반 인증이 설정되지 않았습니다."
        echo ""
        echo "💡 수동 실행 방법:"
        echo ""
        echo "   ssh -p $SSH_PORT ${SSH_USER}@${WORKER_NODE_IP}"
        echo "   sudo /tmp/load-images.sh"
        echo ""
        echo "또는 SSH 키를 설정하면 자동으로 실행됩니다:"
        echo "   ssh-copy-id -p $SSH_PORT ${SSH_USER}@${WORKER_NODE_IP}"
        echo ""
        exit 1
    fi
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ 이미지 로드 완료"
    else
        echo ""
        echo "⚠️  자동 로드 실패. 수동으로 실행하세요."
        echo ""
        echo "   ssh -p $SSH_PORT ${SSH_USER}@${WORKER_NODE_IP}"
        echo "   sudo /tmp/load-images.sh"
    fi
else
    echo ""
    echo "💡 수동 실행 방법:"
    echo ""
    echo "   ssh -p $SSH_PORT ${SSH_USER}@${WORKER_NODE_IP}"
    echo "   sudo /tmp/load-images.sh"
    echo ""
fi

echo ""
echo "📋 수동 실행 명령어 (참고용):"
echo ""
for FILE in "${SAVED_FILES[@]}"; do
    FILENAME=$(basename "$FILE")
    SERVICE=$(basename "$FILENAME" .tar.gz)
    echo "   sudo ctr --address $K3S_SOCKET -n k8s.io images import /tmp/${FILENAME}"
done
echo ""

echo ""
echo "================================"
echo "✅ 전송 완료"
echo "================================"
echo ""

# 임시 디렉토리 정리
rm -rf "$TEMP_DIR"

echo "💡 다음 단계:"
echo "   1. 워커 노드에 SSH 접속: ssh -p $SSH_PORT ${SSH_USER}@${WORKER_NODE_IP}"
echo "   2. 위의 명령어들을 실행하여 이미지를 containerd로 로드"
echo "   3. 이미지 로드 확인: sudo ctr --address $K3S_SOCKET -n k8s.io images list | grep bonanza-index"
echo "   4. Pod 상태 확인: kubectl get pods -n bonanza-index"
echo ""

