#!/bin/bash

# 소스 코드 수정 후 이미지 재빌드 및 배포 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🔄 소스 코드 수정 후 이미지 재빌드 및 배포"
echo "================================"
echo ""

# 서비스 목록
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
echo "📦 재빌드할 서비스 선택 (복수 선택 가능, 쉼표로 구분):"
echo ""
echo "   0) 전체 서비스"
echo ""
for i in "${!SERVICES[@]}"; do
    INDEX=$((i + 1))
    echo "   ${INDEX}) ${SERVICES[$i]}"
done
echo ""
read -p "선택하세요 (예: 1,3,5 또는 0): " SELECTION

# 선택된 서비스 목록
SELECTED_SERVICES=()

if [ "$SELECTION" = "0" ]; then
    SELECTED_SERVICES=("${SERVICES[@]}")
    echo ""
    echo "✅ 전체 서비스 선택됨"
elif [[ "$SELECTION" =~ ^[0-9,]+$ ]]; then
    # 쉼표로 구분된 선택 처리
    IFS=',' read -ra SELECTED <<< "$SELECTION"
    for SEL in "${SELECTED[@]}"; do
        # 공백 제거
        SEL=$(echo "$SEL" | xargs)
        
        if [[ "$SEL" =~ ^[1-9][0-9]*$ ]] && [ "$SEL" -ge 1 ] && [ "$SEL" -le "${#SERVICES[@]}" ]; then
            INDEX=$((SEL - 1))
            SELECTED_SERVICES+=("${SERVICES[$INDEX]}")
        else
            echo ""
            echo "⚠️  잘못된 선택: $SEL (건너뜀)"
        fi
    done
    
    if [ ${#SELECTED_SERVICES[@]} -eq 0 ]; then
        echo ""
        echo "❌ 유효한 서비스가 선택되지 않았습니다"
        exit 1
    fi
    
    echo ""
    echo "✅ 선택된 서비스:"
    for SERVICE in "${SELECTED_SERVICES[@]}"; do
        echo "   - $SERVICE"
    done
else
    echo ""
    echo "❌ 잘못된 선택입니다. 숫자 또는 쉼표로 구분된 숫자를 입력하세요."
    exit 1
fi

echo ""
echo "================================"
echo "1️⃣  Docker 이미지 빌드"
echo "================================"
echo ""

cd "$PROJECT_ROOT/be"

# 빌드할 서비스별로 실행
for SERVICE in "${SELECTED_SERVICES[@]}"; do
    echo "🔨 ${SERVICE} 빌드 중..."
    cd "$SERVICE"
    
    IMAGE_NAME="bonanza-index/${SERVICE}:latest"
    
    # Docker 이미지 빌드
    if docker build -t "$IMAGE_NAME" . 2>&1; then
        echo "   ✅ ${SERVICE} 빌드 완료"
    else
        echo "   ❌ ${SERVICE} 빌드 실패"
        exit 1
    fi
    
    cd ..
    echo ""
done

echo "================================"
echo "2️⃣  이미지 저장 (tar.gz)"
echo "================================"
echo ""

SAVE_DIR="$PROJECT_ROOT/be/images"
mkdir -p "$SAVE_DIR"

for SERVICE in "${SELECTED_SERVICES[@]}"; do
    IMAGE_NAME="bonanza-index/${SERVICE}:latest"
    TAR_FILE="${SAVE_DIR}/${SERVICE}.tar.gz"
    
    echo "💾 ${SERVICE} 저장 중..."
    if docker save "$IMAGE_NAME" | gzip > "$TAR_FILE"; then
        echo "   ✅ ${SERVICE} 저장 완료: $TAR_FILE"
    else
        echo "   ❌ ${SERVICE} 저장 실패"
        exit 1
    fi
    echo ""
done

echo "================================"
echo "3️⃣  워커 노드로 이미지 전송"
echo "================================"
echo ""

# 워커 노드 정보
WORKER_NODE=$(kubectl get nodes -l app-server=true --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null | head -1 || echo "")
if [ -z "$WORKER_NODE" ]; then
    echo "❌ 워커 노드를 찾을 수 없습니다"
    exit 1
fi

WORKER_IP="121.88.4.57"  # 기본 공인 IP
read -p "워커 노드 IP (기본값: $WORKER_IP): " INPUT_IP
WORKER_IP=${INPUT_IP:-$WORKER_IP}

read -p "워커 노드 SSH 사용자 (기본값: bonanza): " SSH_USER
SSH_USER=${SSH_USER:-bonanza}

echo ""
echo "📤 워커 노드 ($WORKER_IP)로 전송 중..."
echo ""

# 전송할 파일 목록 준비
FILES_TO_TRANSFER=()

# load-images.sh 스크립트 추가
LOAD_SCRIPT="$SCRIPT_DIR/load-images.sh"
if [ -f "$LOAD_SCRIPT" ]; then
    FILES_TO_TRANSFER+=("$LOAD_SCRIPT")
fi

# 선택된 서비스의 이미지 파일들 추가
for SERVICE in "${SELECTED_SERVICES[@]}"; do
    TAR_FILE="${SAVE_DIR}/${SERVICE}.tar.gz"
    
    if [ ! -f "$TAR_FILE" ]; then
        echo "   ⚠️  ${SERVICE}.tar.gz 파일을 찾을 수 없습니다 (건너뜀)"
        continue
    fi
    
    FILES_TO_TRANSFER+=("$TAR_FILE")
done

if [ ${#FILES_TO_TRANSFER[@]} -eq 0 ]; then
    echo "❌ 전송할 파일이 없습니다"
    exit 1
fi

# 모든 파일을 한번에 전송
echo "📤 전송할 파일 목록:"
for FILE in "${FILES_TO_TRANSFER[@]}"; do
    FILENAME=$(basename "$FILE")
    if [[ "$FILENAME" == "load-images.sh" ]]; then
        echo "   - $FILENAME (스크립트)"
    else
        echo "   - $FILENAME"
    fi
done
echo ""

echo "📤 파일 전송 중 (한번에 전송)..."
if scp "${FILES_TO_TRANSFER[@]}" "${SSH_USER}@${WORKER_IP}:/tmp/" 2>&1; then
    echo "   ✅ 모든 파일 전송 완료"
    
    # load-images.sh 실행 권한 부여
    if [ -f "$LOAD_SCRIPT" ]; then
        ssh "${SSH_USER}@${WORKER_IP}" "chmod +x /tmp/load-images.sh" 2>/dev/null || true
    fi
else
    echo "   ❌ 파일 전송 실패"
    exit 1
fi
echo ""

echo "================================"
echo "4️⃣  워커 노드에서 이미지 로드"
echo "================================"
echo ""

read -p "워커 노드에서 이미지를 자동으로 로드하시겠습니까? (y/N): " AUTO_LOAD
if [[ "$AUTO_LOAD" =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 워커 노드에서 이미지 로드 중..."
    echo ""
    
    # SSH 키 기반 인증 확인
    if ssh -o BatchMode=yes -o ConnectTimeout=5 "${SSH_USER}@${WORKER_IP}" "echo 'SSH key auth OK'" 2>/dev/null; then
        # SSH 키 기반 인증 성공
        echo "✅ SSH 키 기반 인증 확인됨"
        echo ""
        
        ssh "${SSH_USER}@${WORKER_IP}" << 'REMOTE_EOF'
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
        
        if [ $? -eq 0 ]; then
            echo ""
            echo "✅ 이미지 로드 완료"
        else
            echo ""
            echo "⚠️  자동 로드 실패. 수동으로 실행하세요."
            echo ""
            echo "   ssh ${SSH_USER}@${WORKER_IP}"
            echo "   sudo /tmp/load-images.sh"
        fi
    else
        # SSH 비밀번호 인증 필요
        echo "⚠️  SSH 키 기반 인증이 설정되지 않았습니다."
        echo ""
        echo "💡 수동 실행 방법:"
        echo ""
        echo "   ssh ${SSH_USER}@${WORKER_IP}"
        echo "   sudo /tmp/load-images.sh"
        echo ""
        echo "또는 SSH 키를 설정하면 자동으로 실행됩니다:"
        echo "   ssh-copy-id ${SSH_USER}@${WORKER_IP}"
    fi
else
    echo ""
    echo "💡 수동 실행 방법:"
    echo ""
    echo "   ssh ${SSH_USER}@${WORKER_IP}"
    echo "   sudo /tmp/load-images.sh"
    echo ""
fi

echo "================================"
echo "5️⃣  Pod 재시작"
echo "================================"
echo ""

read -p "Pod를 재시작하시겠습니까? (y/N): " RESTART_PODS
if [[ "$RESTART_PODS" =~ ^[Yy]$ ]]; then
    for SERVICE in "${SELECTED_SERVICES[@]}"; do
        echo "🔄 ${SERVICE} Pod 재시작 중..."
        kubectl delete pods -n bonanza-index -l app="$SERVICE" 2>/dev/null || echo "   ⚠️  Pod를 찾을 수 없습니다"
        echo ""
    done
    
    echo "⏳ Pod 재시작 대기 중..."
    sleep 10
    
    echo ""
    echo "📊 Pod 상태:"
    for SERVICE in "${SELECTED_SERVICES[@]}"; do
        kubectl get pods -n bonanza-index -l app="$SERVICE" 2>/dev/null || echo "   ${SERVICE}: Pod 없음"
    done
fi

echo ""
echo "================================"
echo "✅ 완료"
echo "================================"
echo ""
echo "다음 단계:"
echo "1. Pod 로그 확인: kubectl logs -n bonanza-index -l app=<service-name> --tail=50"
echo "2. Pod 상태 확인: kubectl get pods -n bonanza-index -l app=<service-name>"
echo ""

