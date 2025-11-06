#!/bin/bash

# 마스터 노드용 리소스 삭제 스크립트
# deploy-master.sh에서 배포한 리소스들을 삭제합니다

set -e

# 스크립트 디렉토리에서 상위 디렉토리(k8s/)로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "🗑️  Bonanza Index 마스터 노드 리소스 삭제"
echo "================================"
echo ""

# 현재 노드 확인
CURRENT_NODE=$(kubectl get nodes -o jsonpath='{.items[?(@.metadata.labels.node-role\.kubernetes\.io/control-plane=="true")].metadata.name}' | head -1)
if [ -z "$CURRENT_NODE" ]; then
    echo "⚠️  마스터 노드를 찾을 수 없습니다"
    echo "   이 스크립트는 마스터 노드에서 실행해야 합니다"
    echo ""
    echo "사용 가능한 노드:"
    kubectl get nodes
    exit 1
fi

echo "✅ 마스터 노드: $CURRENT_NODE"
echo ""

# 현재 배포 상태 확인
echo "📊 마스터 노드 배포 상태:"
echo "================================"
echo ""

echo "📦 마스터 노드 Pod 상태:"
kubectl get pods -n bonanza-index -o wide --field-selector=spec.nodeName=$CURRENT_NODE 2>/dev/null || echo "Pod가 없습니다."

echo ""
echo "💾 PVC 상태:"
kubectl get pvc -n bonanza-index 2>/dev/null || echo "PVC가 없습니다."

echo ""
echo "🔍 마스터 노드 서비스 상태:"
kubectl get svc -n bonanza-index 2>/dev/null | grep -E "(redis|nginx|questdb|mariadb)" || echo "서비스가 없습니다."

echo ""
echo "⚙️  ConfigMap 상태:"
kubectl get configmap -n bonanza-index 2>/dev/null | grep -E "(nginx-config|bonanza-common-config)" || echo "ConfigMap이 없습니다."

echo ""
echo "🔐 Secret 상태:"
kubectl get secret -n bonanza-index 2>/dev/null | grep -E "(bonanza-secrets)" || echo "Secret이 없습니다."

# 삭제할 서비스 목록 정의
DB_SERVICES=(
    "questdb:questdb"
    "redis:redis"
    "mariadb:mariadb"
)

# 서비스 선택 메뉴
echo ""
echo "📋 삭제할 서비스 선택:"
echo ""
echo "🗄️  데이터베이스 서비스:"
echo "   0) 전체 DB 서비스 삭제"
echo ""
for i in "${!DB_SERVICES[@]}"; do
    INDEX=$((i + 1))
    SERVICE="${DB_SERVICES[$i]}"
    SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
    
    # 현재 상태 확인
    if [ "$SERVICE_NAME" = "questdb" ] || [ "$SERVICE_NAME" = "mariadb" ]; then
        CURRENT_STATUS=$(kubectl get pods -n bonanza-index -l app=$SERVICE_NAME -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
    else
        CURRENT_STATUS=$(kubectl get pods -n bonanza-index -l app=$SERVICE_NAME -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
    fi
    
    if [ "$CURRENT_STATUS" = "Running" ]; then
        STATUS_ICON="✅"
    elif [ "$CURRENT_STATUS" = "N/A" ]; then
        STATUS_ICON="⚪"
    else
        STATUS_ICON="⚠️ "
    fi
    
    echo "   ${INDEX}) ${STATUS_ICON} ${SERVICE_NAME}"
done

echo ""
echo "🌐 인프라 서비스:"
NGINX_STATUS=$(kubectl get pods -n bonanza-index -l app=nginx -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
if [ "$NGINX_STATUS" = "Running" ]; then
    NGINX_ICON="✅"
elif [ "$NGINX_STATUS" = "N/A" ]; then
    NGINX_ICON="⚪"
else
    NGINX_ICON="⚠️ "
fi
echo "   4) ${NGINX_ICON} nginx"
echo ""
read -p "선택하세요 (0-4, 여러 개 선택 시 쉼표로 구분): " SELECTIONS

# 선택된 서비스 확인
SELECTED_DB_SERVICES=()
SELECTED_NGINX=false

if [ -z "$SELECTIONS" ]; then
    echo "❌ 선택이 없습니다. 종료합니다."
    exit 1
fi

# 선택 파싱 (쉼표로 구분)
if [ "$SELECTIONS" = "0" ]; then
    # 전체 DB 서비스 선택
    SELECTED_DB_SERVICES=("${DB_SERVICES[@]}")
elif [[ "$SELECTIONS" =~ ^[0-9,]+$ ]]; then
    # 쉼표로 구분된 선택 처리
    IFS=',' read -ra SELECTED <<< "$SELECTIONS"
    for SEL in "${SELECTED[@]}"; do
        # 공백 제거
        SEL=$(echo "$SEL" | xargs)
        
        if [ "$SEL" = "0" ]; then
            # 전체 DB 서비스 선택
            SELECTED_DB_SERVICES=("${DB_SERVICES[@]}")
            break
        elif [[ "$SEL" =~ ^[1-9][0-9]*$ ]] && [ "$SEL" -ge 1 ] && [ "$SEL" -le 3 ]; then
            INDEX=$((SEL - 1))
            SELECTED_DB_SERVICES+=("${DB_SERVICES[$INDEX]}")
        elif [ "$SEL" = "4" ]; then
            SELECTED_NGINX=true
        else
            echo ""
            echo "⚠️  잘못된 선택: $SEL (건너뜀)"
        fi
    done
else
    echo "❌ 잘못된 입력입니다. 숫자 또는 쉼표로 구분된 숫자를 입력하세요."
    exit 1
fi

if [ ${#SELECTED_DB_SERVICES[@]} -eq 0 ] && [ "$SELECTED_NGINX" = false ]; then
    echo "❌ 선택된 서비스가 없습니다. 종료합니다."
    exit 1
fi

echo ""
echo "✅ 선택된 삭제 대상:"
if [ ${#SELECTED_DB_SERVICES[@]} -gt 0 ]; then
    echo "🗄️  데이터베이스:"
    for SERVICE in "${SELECTED_DB_SERVICES[@]}"; do
        SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
        echo "   - $SERVICE_NAME"
    done
fi
if [ "$SELECTED_NGINX" = true ]; then
    echo "🌐 인프라:"
    echo "   - nginx"
fi
echo ""

# 삭제 확인
echo "⚠️  주의사항:"
echo "  - ConfigMap 'bonanza-common-config'는 워커 노드에서도 사용하므로 삭제하지 않습니다"
echo "  - Secret 'bonanza-secrets'는 워커 노드에서도 사용하므로 삭제하지 않습니다"
echo "  - Namespace는 삭제하지 않습니다"
echo "  - StorageClass는 삭제하지 않습니다"
echo ""
read -p "정말 삭제하시겠습니까? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ 삭제가 취소되었습니다."
    exit 0
fi

# PVC 삭제 확인 (선택된 DB 서비스에 대해)
DELETE_PVC=false
if [ ${#SELECTED_DB_SERVICES[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  PVC(PersistentVolumeClaim) 삭제 여부 확인 (데이터 손실 가능)"
    read -p "선택된 DB 서비스의 PVC도 삭제하시겠습니까? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        DELETE_PVC=true
        echo "🗑️  PVC 삭제 포함"
    else
        DELETE_PVC=false
        echo "ℹ️  PVC 유지 (데이터 보존)"
    fi
fi

echo ""
echo "⏳ 삭제 시작..."
echo ""

# 선택된 DB 서비스 삭제
if [ ${#SELECTED_DB_SERVICES[@]} -gt 0 ]; then
    echo "🗑️  데이터베이스 서비스 삭제 중..."
    
    for SERVICE in "${SELECTED_DB_SERVICES[@]}"; do
        SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
        
        if [ "$SERVICE_NAME" = "redis" ]; then
            echo "  - Redis 삭제 중..."
            kubectl delete deployment redis -n bonanza-index --ignore-not-found=true
            kubectl delete service redis-service -n bonanza-index --ignore-not-found=true
            if [ "$DELETE_PVC" = true ]; then
                kubectl delete pvc redis-data -n bonanza-index --ignore-not-found=true
            fi
            echo "    ✅ Redis 삭제 완료"
        elif [ "$SERVICE_NAME" = "questdb" ]; then
            echo "  - QuestDB 삭제 중..."
            kubectl delete statefulset questdb -n bonanza-index --ignore-not-found=true
            kubectl delete service questdb-service -n bonanza-index --ignore-not-found=true
            if [ "$DELETE_PVC" = true ]; then
                kubectl delete pvc questdb-data -n bonanza-index --ignore-not-found=true
            fi
            echo "    ✅ QuestDB 삭제 완료"
        elif [ "$SERVICE_NAME" = "mariadb" ]; then
            echo "  - MariaDB 삭제 중..."
            kubectl delete statefulset mariadb -n bonanza-index --ignore-not-found=true
            kubectl delete service mariadb-service -n bonanza-index --ignore-not-found=true
            if [ "$DELETE_PVC" = true ]; then
                kubectl delete pvc mariadb-data -n bonanza-index --ignore-not-found=true
            fi
            echo "    ✅ MariaDB 삭제 완료"
        fi
    done
fi

# Nginx 삭제
if [ "$SELECTED_NGINX" = true ]; then
    echo ""
    echo "🗑️  Nginx 삭제 중..."
    kubectl delete deployment nginx -n bonanza-index --ignore-not-found=true
    kubectl delete service nginx-service -n bonanza-index --ignore-not-found=true
    kubectl delete configmap nginx-config -n bonanza-index --ignore-not-found=true
    echo "  ✅ Nginx 삭제 완료"
fi

echo ""
echo "  ℹ️  bonanza-common-config는 워커 노드에서도 사용하므로 유지"
echo "  ℹ️  bonanza-secrets는 워커 노드에서도 사용하므로 유지"

echo ""
echo "⏳ 리소스 정리 대기 중 (5초)..."
for i in {5..1}; do
    echo -ne "⏳ 남은 시간: ${i}초\r"
    sleep 1
done
echo -ne "⏳ 대기 종료          \n"

echo ""
echo "✅ 마스터 노드 리소스 삭제 상태 확인"
echo "================================"
echo ""

echo "📦 마스터 노드 Pod 상태:"
MASTER_PODS=$(kubectl get pods -n bonanza-index --field-selector=spec.nodeName=$CURRENT_NODE -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")
if [ -z "$MASTER_PODS" ]; then
    echo "  ✅ 마스터 노드에 Pod가 없습니다"
else
    echo "  ⚠️  남아있는 Pod:"
    kubectl get pods -n bonanza-index --field-selector=spec.nodeName=$CURRENT_NODE
fi

echo ""
echo "💾 PVC 상태:"
if [ "$DELETE_PVC" = true ] && [ ${#SELECTED_DB_SERVICES[@]} -gt 0 ]; then
    # 선택된 DB 서비스의 PVC 확인
    REMAINING_PVC=""
    for SERVICE in "${SELECTED_DB_SERVICES[@]}"; do
        SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
        if [ "$SERVICE_NAME" = "redis" ]; then
            if kubectl get pvc redis-data -n bonanza-index &>/dev/null; then
                REMAINING_PVC="$REMAINING_PVC redis-data"
            fi
        elif [ "$SERVICE_NAME" = "questdb" ]; then
            if kubectl get pvc questdb-data -n bonanza-index &>/dev/null; then
                REMAINING_PVC="$REMAINING_PVC questdb-data"
            fi
        elif [ "$SERVICE_NAME" = "mariadb" ]; then
            if kubectl get pvc mariadb-data -n bonanza-index &>/dev/null; then
                REMAINING_PVC="$REMAINING_PVC mariadb-data"
            fi
        fi
    done
    
    if [ -z "$REMAINING_PVC" ]; then
        echo "  ✅ 선택된 DB 서비스의 PVC가 모두 삭제되었습니다"
    else
        echo "  ⚠️  남아있는 PVC:"
        for pvc in $REMAINING_PVC; do
            kubectl get pvc $pvc -n bonanza-index 2>/dev/null || true
        done
    fi
else
    echo "  ℹ️  PVC는 유지됩니다 (데이터 보존)"
    if [ ${#SELECTED_DB_SERVICES[@]} -gt 0 ]; then
        echo "  선택된 DB 서비스의 PVC:"
        for SERVICE in "${SELECTED_DB_SERVICES[@]}"; do
            SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
            if [ "$SERVICE_NAME" = "redis" ]; then
                kubectl get pvc redis-data -n bonanza-index 2>/dev/null || echo "    - redis-data: 없음"
            elif [ "$SERVICE_NAME" = "questdb" ]; then
                kubectl get pvc questdb-data -n bonanza-index 2>/dev/null || echo "    - questdb-data: 없음"
            elif [ "$SERVICE_NAME" = "mariadb" ]; then
                kubectl get pvc mariadb-data -n bonanza-index 2>/dev/null || echo "    - mariadb-data: 없음"
            fi
        done
    fi
fi

echo ""
echo "🔍 서비스 상태:"
# 선택된 서비스에 대한 확인
REMAINING_SVC=""
if [ ${#SELECTED_DB_SERVICES[@]} -gt 0 ]; then
    for SERVICE in "${SELECTED_DB_SERVICES[@]}"; do
        SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
        if [ "$SERVICE_NAME" = "redis" ]; then
            if kubectl get svc redis-service -n bonanza-index &>/dev/null; then
                REMAINING_SVC="$REMAINING_SVC redis-service"
            fi
        elif [ "$SERVICE_NAME" = "questdb" ]; then
            if kubectl get svc questdb-service -n bonanza-index &>/dev/null; then
                REMAINING_SVC="$REMAINING_SVC questdb-service"
            fi
        elif [ "$SERVICE_NAME" = "mariadb" ]; then
            if kubectl get svc mariadb-service -n bonanza-index &>/dev/null; then
                REMAINING_SVC="$REMAINING_SVC mariadb-service"
            fi
        fi
    done
fi
if [ "$SELECTED_NGINX" = true ]; then
    if kubectl get svc nginx-service -n bonanza-index &>/dev/null; then
        REMAINING_SVC="$REMAINING_SVC nginx-service"
    fi
fi

if [ -z "$REMAINING_SVC" ]; then
    echo "  ✅ 선택된 서비스가 모두 삭제되었습니다"
else
    echo "  ⚠️  남아있는 서비스:"
    for svc in $REMAINING_SVC; do
        kubectl get svc $svc -n bonanza-index 2>/dev/null || true
    done
fi

echo ""
echo "⚙️  ConfigMap 상태:"
if [ "$SELECTED_NGINX" = true ]; then
    if kubectl get configmap nginx-config -n bonanza-index &>/dev/null; then
        echo "  ⚠️  nginx-config ConfigMap이 남아있습니다:"
        kubectl get configmap nginx-config -n bonanza-index
    else
        echo "  ✅ nginx-config ConfigMap이 삭제되었습니다"
    fi
else
    echo "  ℹ️  nginx-config는 선택되지 않아 유지됩니다"
fi

echo ""
echo "================================"
echo "✅ 마스터 노드 리소스 삭제 완료!"
echo "================================"
echo ""
echo "💡 참고사항:"
echo "  - Namespace 'bonanza-index'는 유지됩니다"
echo "  - StorageClass는 유지됩니다"
echo "  - ConfigMap 'bonanza-common-config'는 유지됩니다 (워커 노드에서 사용)"
echo "  - Secret 'bonanza-secrets'는 유지됩니다 (워커 노드에서 사용)"
echo ""
echo "💡 워커 노드 리소스도 삭제하려면:"
echo "  ./k8s/scripts/delete-worker.sh"
echo ""


