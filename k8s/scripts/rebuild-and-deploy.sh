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
echo "3️⃣  이미지 로드 (단일 노드)"
echo "================================"
echo ""

# 단일 노드 정보 (현재 노드 사용)
CURRENT_NODE=$(kubectl get nodes --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null | head -1 || echo "")
if [ -z "$CURRENT_NODE" ]; then
    echo "❌ 노드를 찾을 수 없습니다"
    exit 1
fi

NODE_IP=$(kubectl get node "$CURRENT_NODE" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "")
if [ -z "$NODE_IP" ]; then
    NODE_IP=$(kubectl get node "$CURRENT_NODE" -o jsonpath='{.status.addresses[?(@.type=="ExternalIP")].address}' 2>/dev/null || echo "")
fi

# 단일 노드이므로 로컬에서 직접 로드 (SSH 전송 불필요)
echo "✅ 단일 노드 모드: $CURRENT_NODE ($NODE_IP)"
echo ""

# containerd 또는 Docker 확인
if command -v ctr &> /dev/null; then
    echo "📦 containerd를 사용하여 이미지 로드 중..."
    for SERVICE in "${SELECTED_SERVICES[@]}"; do
        IMAGE_NAME="bonanza-index/${SERVICE}:latest"
        TAR_FILE="${SAVE_DIR}/${SERVICE}.tar.gz"
        
        if [ ! -f "$TAR_FILE" ]; then
            echo "   ⚠️  ${SERVICE}.tar.gz 파일을 찾을 수 없습니다 (건너뜀)"
            continue
        fi
        
        echo "   📥 ${SERVICE} 로드 중..."
        if sudo ctr -n k8s.io images import "$TAR_FILE" 2>&1; then
            echo "   ✅ ${SERVICE} 로드 완료"
        else
            echo "   ❌ ${SERVICE} 로드 실패"
        fi
    done
elif command -v docker &> /dev/null; then
    echo "📦 Docker를 사용하여 이미지 로드 중..."
    for SERVICE in "${SELECTED_SERVICES[@]}"; do
        IMAGE_NAME="bonanza-index/${SERVICE}:latest"
        TAR_FILE="${SAVE_DIR}/${SERVICE}.tar.gz"
        
        if [ ! -f "$TAR_FILE" ]; then
            echo "   ⚠️  ${SERVICE}.tar.gz 파일을 찾을 수 없습니다 (건너뜀)"
            continue
        fi
        
        echo "   📥 ${SERVICE} 로드 중..."
        if docker load < "$TAR_FILE" 2>&1; then
            echo "   ✅ ${SERVICE} 로드 완료"
        else
            echo "   ❌ ${SERVICE} 로드 실패"
        fi
    done
else
    echo "❌ containerd 또는 Docker를 찾을 수 없습니다"
    exit 1
fi
echo ""

echo "================================"
echo "4️⃣  Pod 재시작"
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

