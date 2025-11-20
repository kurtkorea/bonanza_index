#!/bin/bash

# 애플리케이션 서비스 배포 스크립트
# 단일 노드 구성에서 애플리케이션 서비스 및 프론트엔드를 배포합니다

set -e

# 스크립트 디렉토리에서 상위 디렉토리(k8s/)로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "🚀 Bonanza Index 애플리케이션 서비스 배포 시작..."
echo "================================"
echo ""

# 현재 노드 확인
echo "📊 현재 클러스터 상태:"
echo "================================"
echo ""
echo "노드:"
kubectl get nodes
echo ""

# Namespace 확인
echo "📦 Namespace 확인..."
if ! kubectl get namespace bonanza-index &>/dev/null; then
    echo "  ❌ Namespace 'bonanza-index'가 없습니다"
    echo "  먼저 네임스페이스를 생성하세요: kubectl apply -f k8s/namespace.yaml"
    exit 1
else
    echo "  ✅ Namespace 존재 확인"
fi
echo ""

# 배포할 서비스 목록 정의
APP_SERVICES=(
    "index-endpoint:index-endpoint"
    "index-calculator:index-calculator"
    "orderbook-collector:orderbook-collector"
    "ticker-collector:ticker-collector"
    "orderbook-storage-worker:orderbook-storage-worker"
    "ticker-storage-worker:ticker-storage-worker"
    "orderbook-aggregator:orderbook-aggregator"
    "telegram-log:telegram-log"
    "index-calc-fe:index-calc-fe"
)

# 서비스 선택 메뉴
echo "📋 배포할 서비스 선택:"
echo ""
echo "  0) 전체 배포"
for i in "${!APP_SERVICES[@]}"; do
    INDEX=$((i + 1))
    SERVICE_NAME=$(echo "${APP_SERVICES[$i]}" | cut -d: -f1)
    DEPLOYMENT_NAME=$(echo "${APP_SERVICES[$i]}" | cut -d: -f2)
    
    # 현재 상태 확인
    CURRENT_STATUS=$(kubectl get pods -n bonanza-index -l app=$DEPLOYMENT_NAME -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
    if [ "$CURRENT_STATUS" = "Running" ]; then
        STATUS_ICON="✅"
    elif [ "$CURRENT_STATUS" = "N/A" ]; then
        STATUS_ICON="⚪"
    else
        STATUS_ICON="⚠️ "
    fi
    
    echo "  ${INDEX}) ${STATUS_ICON} ${SERVICE_NAME}"
done
echo ""
read -p "선택하세요 (0-${#APP_SERVICES[@]}, 여러 개 선택 시 쉼표로 구분): " SELECTIONS

# 선택된 서비스 확인
SELECTED_SERVICES=()
if [ -z "$SELECTIONS" ]; then
    echo "❌ 선택이 없습니다. 종료합니다."
    exit 1
fi

# 선택 파싱 (쉼표로 구분)
if [ "$SELECTIONS" = "0" ]; then
    # 전체 선택
    SELECTED_SERVICES=("${APP_SERVICES[@]}")
elif [[ "$SELECTIONS" =~ ^[0-9,]+$ ]]; then
    # 쉼표로 구분된 선택 처리
    IFS=',' read -ra SELECTED <<< "$SELECTIONS"
    for SEL in "${SELECTED[@]}"; do
        # 공백 제거
        SEL=$(echo "$SEL" | xargs)
        
        if [ "$SEL" = "0" ]; then
            # 전체 선택
            SELECTED_SERVICES=("${APP_SERVICES[@]}")
            break
        elif [[ "$SEL" =~ ^[1-9][0-9]*$ ]] && [ "$SEL" -ge 1 ] && [ "$SEL" -le ${#APP_SERVICES[@]} ]; then
            INDEX=$((SEL - 1))
            SELECTED_SERVICES+=("${APP_SERVICES[$INDEX]}")
        else
            echo ""
            echo "⚠️  잘못된 선택: $SEL (건너뜀)"
        fi
    done
else
    echo "❌ 잘못된 입력입니다. 숫자 또는 쉼표로 구분된 숫자를 입력하세요."
    exit 1
fi

if [ ${#SELECTED_SERVICES[@]} -eq 0 ]; then
    echo "❌ 선택된 서비스가 없습니다. 종료합니다."
    exit 1
fi

echo ""
echo "✅ 선택된 서비스:"
for SERVICE in "${SELECTED_SERVICES[@]}"; do
    SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
    echo "   - $SERVICE_NAME"
done
echo ""

# 기존 선택된 서비스 리소스 삭제
echo "🗑️  선택된 서비스 리소스 삭제 중..."
for SERVICE in "${SELECTED_SERVICES[@]}"; do
    DEPLOYMENT_NAME=$(echo "$SERVICE" | cut -d: -f1)
    if [ "$DEPLOYMENT_NAME" = "index-calc-fe" ]; then
        kubectl delete deployment $DEPLOYMENT_NAME -n bonanza-index --ignore-not-found=true
    else
        kubectl delete deployment $DEPLOYMENT_NAME -n bonanza-index --ignore-not-found=true
    fi
done

# Ingress는 별도 선택
INGRESS_SELECTED=false
for SERVICE in "${SELECTED_SERVICES[@]}"; do
    SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
    if [ "$SERVICE_NAME" = "index-calc-fe" ] || [ "$SERVICE_NAME" = "index-endpoint" ]; then
        INGRESS_SELECTED=true
        break
    fi
done

if [ "$INGRESS_SELECTED" = true ]; then
    kubectl delete ingress -n bonanza-index --all --ignore-not-found=true
fi

echo ""
for i in {5..1}; do
    echo -ne "⏳ 대기 중... (${i})\r"
    sleep 1
done
echo -ne "⏳ 대기 종료          \n"

# 공통 ConfigMap 및 Secret 확인 (항상 적용)
echo ""
echo "⚙️  공통 리소스 확인..."
kubectl apply -f configmap-common.yaml
kubectl apply -f secret.yaml

# 선택된 서비스 배포
echo ""
echo "🔧 선택된 서비스 배포 중..."

for SERVICE in "${SELECTED_SERVICES[@]}"; do
    SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
    DEPLOYMENT_DIR=$(echo "$SERVICE" | cut -d: -f2)
    
    if [ "$SERVICE_NAME" = "index-calc-fe" ]; then
        echo "  🎨 프론트엔드 배포 중: $SERVICE_NAME..."
        kubectl apply -f $DEPLOYMENT_DIR/
    else
        echo "  🔧 백엔드 서비스 배포 중: $SERVICE_NAME..."
        kubectl apply -f $DEPLOYMENT_DIR/
    fi
done

# Ingress 배포 (필요한 경우)
if [ "$INGRESS_SELECTED" = true ]; then
    echo ""
    echo "🌐 Ingress 배포 중..."
    kubectl apply -f ingress.yaml
fi

echo ""
echo "⏳ 배포 완료 대기 중 (5초)..."
for i in {5..1}; do
    echo -ne "⏳ 남은 시간: ${i}초\r"
    sleep 1
done
echo -ne "⏳ 대기 종료          \n"

echo ""
echo "✅ 애플리케이션 서비스 배포 상태 확인"
echo "================================"
echo ""

echo "📦 애플리케이션 Pod 상태:"
kubectl get pods -n bonanza-index -o wide 2>/dev/null | grep -E "(index|orderbook|ticker|telegram)" || echo "  Pod 없음"

echo ""
echo "🔍 애플리케이션 서비스 상태:"
kubectl get svc -n bonanza-index | grep -E "(index|orderbook|ticker|telegram)" || kubectl get svc -n bonanza-index

echo ""
echo "📡 Ingress 상태:"
kubectl get ingress -n bonanza-index 2>/dev/null || echo "Ingress 없음"

echo ""
echo "📊 애플리케이션 Pod 상세 상태:"
echo ""

# 전체 서비스 목록 (상태 확인용)
ALL_SERVICES=(
    "index-endpoint"
    "index-calculator"
    "orderbook-collector"
    "ticker-collector"
    "orderbook-storage-worker"
    "ticker-storage-worker"
    "orderbook-aggregator"
    "telegram-log"
    "index-calc-fe"
)

for SERVICE in "${ALL_SERVICES[@]}"; do
    SERVICE_PHASE=$(kubectl get pods -n bonanza-index -l app=$SERVICE -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
    SERVICE_READY=$(kubectl get pods -n bonanza-index -l app=$SERVICE -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
    SERVICE_NODE=$(kubectl get pods -n bonanza-index -l app=$SERVICE -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || echo "N/A")
    echo "$SERVICE:"
    echo "  Phase: $SERVICE_PHASE, Ready: $SERVICE_READY, Node: $SERVICE_NODE"
    echo ""
done

# 문제가 있는 Pod 확인
echo ""
FAILING_PODS=$(kubectl get pods -n bonanza-index -l 'app in (index-endpoint,index-calculator,orderbook-collector,ticker-collector,orderbook-storage-worker,ticker-storage-worker,orderbook-aggregator,telegram-log,index-calc-fe)' --field-selector=status.phase!=Running,status.phase!=Succeeded -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

if [ ! -z "$FAILING_PODS" ]; then
    echo "⚠️  문제가 있는 Pod:"
    kubectl get pods -n bonanza-index -l 'app in (index-endpoint,index-calculator,orderbook-collector,ticker-collector,orderbook-storage-worker,ticker-storage-worker,orderbook-aggregator,telegram-log,index-calc-fe)' --field-selector=status.phase!=Running,status.phase!=Succeeded 2>/dev/null || true
    echo ""
    echo "💡 ImagePullBackOff 오류가 발생한 경우:"
    echo "  - Docker 이미지를 빌드하고 로드해야 합니다"
    echo "  - 이미지 로드 방법:"
    echo "    ./k8s/scripts/load-images.sh"
    echo ""
    echo "💡 자세한 정보 확인:"
    echo "  kubectl describe pod <pod-name> -n bonanza-index"
    echo "  kubectl logs <pod-name> -n bonanza-index"
else
    echo "✅ 모든 애플리케이션 Pod가 정상적으로 실행 중입니다!"
fi

echo ""
echo "================================"
echo "✅ 애플리케이션 서비스 배포 완료!"
echo "================================"
echo ""
echo "💡 전체 시스템 상태 확인:"
echo "  kubectl get pods -n bonanza-index -o wide"
echo "  kubectl get svc -n bonanza-index"
echo ""
echo "💡 데이터베이스 서비스도 배포하려면:"
echo "  kubectl apply -f k8s/questdb/"
echo "  kubectl apply -f k8s/redis/"
echo "  kubectl apply -f k8s/mariadb/"
echo ""


