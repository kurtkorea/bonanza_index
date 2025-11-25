#!/bin/bash

# 애플리케이션 서비스 삭제 스크립트
# 단일 노드 구성에서 애플리케이션 서비스만 삭제합니다 (데이터베이스는 유지)

set -e

# 스크립트 디렉토리에서 상위 디렉토리(k8s/)로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "🗑️  Bonanza Index 애플리케이션 서비스 삭제"
echo "================================"
echo ""

# 현재 노드 확인
echo "📊 현재 클러스터 상태:"
echo "================================"
echo ""
echo "노드:"
kubectl get nodes --show-labels
echo ""

# 현재 배포 상태 확인
echo "📦 애플리케이션 Pod 상태:"
kubectl get pods -n bonanza-index -o wide 2>/dev/null | grep -E "(index|orderbook|ticker|telegram|nginx)" || echo "  Pod 없음"

echo ""
echo "🔍 애플리케이션 서비스 상태:"
kubectl get svc -n bonanza-index 2>/dev/null | grep -E "(index|orderbook|ticker|telegram)" || echo "서비스가 없습니다"

echo ""
echo "📡 Ingress 상태:"
kubectl get ingress -n bonanza-index 2>/dev/null || echo "Ingress 없음"

# 배포할 서비스 목록 정의 (deploy-worker.sh와 동일)
APP_SERVICES=(
    "index-endpoint:index-endpoint"
    "index-calculator:index-calculator"
    "orderbook-collector:orderbook-collector"
    "ticker-collector:ticker-collector"
    "orderbook-storage-worker:orderbook-storage-worker"
    "ticker-storage-worker:ticker-storage-worker"
    "telegram-log:telegram-log"
    "index-calc-fe:index-calc-fe"
)

# 서비스 선택 메뉴
echo ""
echo "================================"
echo "📋 삭제할 서비스 선택"
echo "================================"
echo ""
echo "  0) 전체 삭제"
for i in "${!APP_SERVICES[@]}"; do
    INDEX=$((i + 1))
    SERVICE_NAME=$(echo "${APP_SERVICES[$i]}" | cut -d: -f1)
    DEPLOYMENT_NAME=$(echo "${APP_SERVICES[$i]}" | cut -d: -f2)
    
    # 현재 상태 확인
    CURRENT_STATUS=$(kubectl get pods -n bonanza-index -l app=$DEPLOYMENT_NAME -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
    if [ "$CURRENT_STATUS" = "Running" ]; then
        STATUS_ICON="🟢"
    elif [ "$CURRENT_STATUS" = "N/A" ]; then
        STATUS_ICON="⚪"
    else
        STATUS_ICON="🟡"
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
echo "✅ 선택된 서비스 (삭제 대상):"
for SERVICE in "${SELECTED_SERVICES[@]}"; do
    SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
    echo "   - $SERVICE_NAME"
done
echo ""

echo "⚠️  주의사항:"
echo "  - 데이터베이스 리소스(QuestDB, Redis, MariaDB)는 유지됩니다"
echo "  - Nginx는 유지됩니다"
echo "  - Namespace는 삭제하지 않습니다"
echo "  - ConfigMap 'bonanza-common-config'는 유지됩니다"
echo "  - Secret 'bonanza-secrets'는 유지됩니다"
echo ""

# 삭제 확인
read -p "정말 삭제하시겠습니까? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ 삭제가 취소되었습니다."
    exit 0
fi

echo ""
echo "⏳ 삭제 시작..."
echo ""

# 선택된 서비스 삭제
echo "🗑️  선택된 서비스 삭제 중..."
for SERVICE in "${SELECTED_SERVICES[@]}"; do
    DEPLOYMENT_NAME=$(echo "$SERVICE" | cut -d: -f1)
    SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
    
    echo "  🗑️  ${SERVICE_NAME} 삭제 중..."
    
    if [ "$SERVICE_NAME" = "orderbook-collector" ]; then
        # orderbook-collector 다중 인스턴스 삭제
        kubectl delete deployment orderbook-collector-1 -n bonanza-index --ignore-not-found=true
        kubectl delete deployment orderbook-collector-2 -n bonanza-index --ignore-not-found=true
        kubectl delete deployment orderbook-collector -n bonanza-index --ignore-not-found=true
        kubectl delete service orderbook-collector-service-1 -n bonanza-index --ignore-not-found=true
        kubectl delete service orderbook-collector-service-2 -n bonanza-index --ignore-not-found=true
        kubectl delete service orderbook-collector-service -n bonanza-index --ignore-not-found=true
    elif [ "$SERVICE_NAME" = "ticker-collector" ]; then
        # ticker-collector 다중 인스턴스 삭제
        kubectl delete deployment ticker-collector-1 -n bonanza-index --ignore-not-found=true
        kubectl delete deployment ticker-collector-2 -n bonanza-index --ignore-not-found=true
        kubectl delete deployment ticker-collector -n bonanza-index --ignore-not-found=true
        kubectl delete service ticker-collector-service-1 -n bonanza-index --ignore-not-found=true
        kubectl delete service ticker-collector-service-2 -n bonanza-index --ignore-not-found=true
        kubectl delete service ticker-collector-service -n bonanza-index --ignore-not-found=true
    else
        # 일반 서비스 삭제
        kubectl delete deployment $DEPLOYMENT_NAME -n bonanza-index --ignore-not-found=true
        kubectl delete service ${SERVICE_NAME}-service -n bonanza-index --ignore-not-found=true
    fi
done
echo "  ✅ 선택된 서비스 삭제 완료"

# Ingress는 별도 선택 (index-endpoint 또는 index-calc-fe가 선택된 경우)
INGRESS_SELECTED=false
for SERVICE in "${SELECTED_SERVICES[@]}"; do
    SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
    if [ "$SERVICE_NAME" = "index-calc-fe" ] || [ "$SERVICE_NAME" = "index-endpoint" ]; then
        INGRESS_SELECTED=true
        break
    fi
done

if [ "$INGRESS_SELECTED" = true ]; then
    echo ""
    echo "🗑️  Ingress 삭제 중..."
    kubectl delete ingress -n bonanza-index --all --ignore-not-found=true
    echo "  ✅ Ingress 삭제 완료"
fi

echo ""
echo "⏳ 리소스 정리 대기 중 (5초)..."
for i in {5..1}; do
    echo -ne "⏳ 남은 시간: ${i}초\r"
    sleep 1
done
echo -ne "⏳ 대기 종료          \n"

echo ""
echo "✅ 선택된 서비스 삭제 상태 확인"
echo "================================"
echo ""

echo "📦 선택된 서비스 Pod 상태:"
echo ""
for SERVICE in "${SELECTED_SERVICES[@]}"; do
    DEPLOYMENT_NAME=$(echo "$SERVICE" | cut -d: -f1)
    SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
    
    if [ "$SERVICE_NAME" = "orderbook-collector" ] || [ "$SERVICE_NAME" = "ticker-collector" ]; then
        # 다중 인스턴스 서비스 상태 확인
        INSTANCE1_PHASE=$(kubectl get pods -n bonanza-index -l app=$DEPLOYMENT_NAME,instance=1 -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
        INSTANCE2_PHASE=$(kubectl get pods -n bonanza-index -l app=$DEPLOYMENT_NAME,instance=2 -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
        SINGLE_PHASE=$(kubectl get pods -n bonanza-index -l app=$DEPLOYMENT_NAME -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
        
        if [ "$INSTANCE1_PHASE" = "N/A" ] && [ "$INSTANCE2_PHASE" = "N/A" ] && [ "$SINGLE_PHASE" = "N/A" ]; then
            echo "  ✅ ${SERVICE_NAME}: 삭제됨 (모든 인스턴스)"
        else
            if [ "$INSTANCE1_PHASE" != "N/A" ]; then
                echo "  ⚠️  ${SERVICE_NAME} (인스턴스 1): Phase=$INSTANCE1_PHASE"
            fi
            if [ "$INSTANCE2_PHASE" != "N/A" ]; then
                echo "  ⚠️  ${SERVICE_NAME} (인스턴스 2): Phase=$INSTANCE2_PHASE"
            fi
            if [ "$SINGLE_PHASE" != "N/A" ]; then
                echo "  ⚠️  ${SERVICE_NAME} (단일 인스턴스): Phase=$SINGLE_PHASE"
            fi
        fi
    else
        # 일반 서비스 상태 확인
        SERVICE_PHASE=$(kubectl get pods -n bonanza-index -l app=$DEPLOYMENT_NAME -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
        SERVICE_READY=$(kubectl get pods -n bonanza-index -l app=$DEPLOYMENT_NAME -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
        
        if [ "$SERVICE_PHASE" = "N/A" ]; then
            echo "  ✅ ${SERVICE_NAME}: 삭제됨"
        else
            echo "  ⚠️  ${SERVICE_NAME}: Phase=$SERVICE_PHASE, Ready=$SERVICE_READY"
        fi
    fi
done

echo ""
echo "🔍 선택된 서비스 상태:"
echo ""
for SERVICE in "${SELECTED_SERVICES[@]}"; do
    SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
    
    if [ "$SERVICE_NAME" = "orderbook-collector" ]; then
        # orderbook-collector 다중 인스턴스 서비스 확인
        if kubectl get service orderbook-collector-service-1 -n bonanza-index &>/dev/null; then
            echo "  ⚠️  orderbook-collector-service-1: 아직 존재함"
        else
            echo "  ✅ orderbook-collector-service-1: 삭제됨"
        fi
        if kubectl get service orderbook-collector-service-2 -n bonanza-index &>/dev/null; then
            echo "  ⚠️  orderbook-collector-service-2: 아직 존재함"
        else
            echo "  ✅ orderbook-collector-service-2: 삭제됨"
        fi
        if kubectl get service orderbook-collector-service -n bonanza-index &>/dev/null; then
            echo "  ⚠️  orderbook-collector-service: 아직 존재함"
        else
            echo "  ✅ orderbook-collector-service: 삭제됨"
        fi
    elif [ "$SERVICE_NAME" = "ticker-collector" ]; then
        # ticker-collector 다중 인스턴스 서비스 확인
        if kubectl get service ticker-collector-service-1 -n bonanza-index &>/dev/null; then
            echo "  ⚠️  ticker-collector-service-1: 아직 존재함"
        else
            echo "  ✅ ticker-collector-service-1: 삭제됨"
        fi
        if kubectl get service ticker-collector-service-2 -n bonanza-index &>/dev/null; then
            echo "  ⚠️  ticker-collector-service-2: 아직 존재함"
        else
            echo "  ✅ ticker-collector-service-2: 삭제됨"
        fi
        if kubectl get service ticker-collector-service -n bonanza-index &>/dev/null; then
            echo "  ⚠️  ticker-collector-service: 아직 존재함"
        else
            echo "  ✅ ticker-collector-service: 삭제됨"
        fi
    else
        # 일반 서비스 확인
        if kubectl get service ${SERVICE_NAME}-service -n bonanza-index &>/dev/null; then
            echo "  ⚠️  ${SERVICE_NAME}-service: 아직 존재함"
        else
            echo "  ✅ ${SERVICE_NAME}-service: 삭제됨"
        fi
    fi
done

if [ "$INGRESS_SELECTED" = true ]; then
    echo ""
    echo "📡 Ingress 상태:"
    INGRESS=$(kubectl get ingress -n bonanza-index -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")
    if [ -z "$INGRESS" ]; then
        echo "  ✅ Ingress가 삭제되었습니다"
    else
        echo "  ⚠️  남아있는 Ingress:"
        kubectl get ingress -n bonanza-index
    fi
fi

echo ""
echo "================================"
echo "✅ 선택된 서비스 삭제 완료!"
echo "================================"
echo ""

# 전체 서비스 목록 (상태 확인용)
ALL_SERVICES=(
    "index-endpoint"
    "index-calculator"
    "orderbook-collector"
    "ticker-collector"
    "orderbook-storage-worker"
    "ticker-storage-worker"
    "telegram-log"
    "index-calc-fe"
)

echo "📊 전체 애플리케이션 서비스 상태:"
echo ""
for SERVICE in "${ALL_SERVICES[@]}"; do
    if [ "$SERVICE" = "orderbook-collector" ]; then
        # orderbook-collector는 다중 인스턴스이므로 각각 확인
        echo "$SERVICE (인스턴스 1):"
        SERVICE_PHASE=$(kubectl get pods -n bonanza-index -l app=orderbook-collector,instance=1 -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
        SERVICE_READY=$(kubectl get pods -n bonanza-index -l app=orderbook-collector,instance=1 -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
        SERVICE_NODE=$(kubectl get pods -n bonanza-index -l app=orderbook-collector,instance=1 -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || echo "N/A")
        echo "  Phase: $SERVICE_PHASE, Ready: $SERVICE_READY, Node: $SERVICE_NODE"
        echo ""
        echo "$SERVICE (인스턴스 2):"
        SERVICE_PHASE=$(kubectl get pods -n bonanza-index -l app=orderbook-collector,instance=2 -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
        SERVICE_READY=$(kubectl get pods -n bonanza-index -l app=orderbook-collector,instance=2 -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
        SERVICE_NODE=$(kubectl get pods -n bonanza-index -l app=orderbook-collector,instance=2 -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || echo "N/A")
        echo "  Phase: $SERVICE_PHASE, Ready: $SERVICE_READY, Node: $SERVICE_NODE"
        echo ""
    elif [ "$SERVICE" = "ticker-collector" ]; then
        # ticker-collector는 다중 인스턴스이므로 각각 확인
        echo "$SERVICE (인스턴스 1):"
        SERVICE_PHASE=$(kubectl get pods -n bonanza-index -l app=ticker-collector,instance=1 -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
        SERVICE_READY=$(kubectl get pods -n bonanza-index -l app=ticker-collector,instance=1 -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
        SERVICE_NODE=$(kubectl get pods -n bonanza-index -l app=ticker-collector,instance=1 -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || echo "N/A")
        echo "  Phase: $SERVICE_PHASE, Ready: $SERVICE_READY, Node: $SERVICE_NODE"
        echo ""
        echo "$SERVICE (인스턴스 2):"
        SERVICE_PHASE=$(kubectl get pods -n bonanza-index -l app=ticker-collector,instance=2 -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
        SERVICE_READY=$(kubectl get pods -n bonanza-index -l app=ticker-collector,instance=2 -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
        SERVICE_NODE=$(kubectl get pods -n bonanza-index -l app=ticker-collector,instance=2 -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || echo "N/A")
        echo "  Phase: $SERVICE_PHASE, Ready: $SERVICE_READY, Node: $SERVICE_NODE"
        echo ""
    else
        SERVICE_PHASE=$(kubectl get pods -n bonanza-index -l app=$SERVICE -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
        SERVICE_READY=$(kubectl get pods -n bonanza-index -l app=$SERVICE -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
        SERVICE_NODE=$(kubectl get pods -n bonanza-index -l app=$SERVICE -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || echo "N/A")
        echo "$SERVICE:"
        echo "  Phase: $SERVICE_PHASE, Ready: $SERVICE_READY, Node: $SERVICE_NODE"
        echo ""
    fi
done

echo "💡 참고사항:"
echo "  - 데이터베이스 리소스(QuestDB, Redis, MariaDB)는 유지됩니다"
echo "  - Nginx는 유지됩니다"
echo "  - Namespace 'bonanza-index'는 유지됩니다"
echo "  - ConfigMap 'bonanza-common-config'는 유지됩니다"
echo "  - Secret 'bonanza-secrets'는 유지됩니다"
echo ""
echo "💡 데이터베이스 리소스도 삭제하려면:"
echo "  ./k8s/scripts/delete-master.sh"
echo ""
echo "💡 전체 시스템 재배포:"
echo "  kubectl apply -f k8s/"
echo ""
echo "💡 선택된 서비스 재배포:"
echo "  ./k8s/scripts/deploy-worker.sh"
echo ""


