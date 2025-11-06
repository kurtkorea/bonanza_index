#!/bin/bash

# 마스터 노드용 배포 스크립트
# 데이터베이스 서비스 (QuestDB, Redis, MariaDB) 및 Nginx를 배포합니다

set -e

# 스크립트 디렉토리에서 상위 디렉토리(k8s/)로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "🚀 Bonanza Index 마스터 노드 배포 시작..."
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

# Namespace 생성 (없는 경우)
echo "📦 Namespace 확인 및 생성..."
if ! kubectl get namespace bonanza-index &>/dev/null; then
    echo "  - Namespace 생성 중..."
    kubectl apply -f namespace.yaml
else
    echo "  - Namespace 이미 존재"
fi
echo ""

# 배포할 서비스 목록 정의 (삭제를 위해 먼저 정의)
DB_SERVICES=(
    "questdb:questdb"
    "redis:redis"
    "mariadb:mariadb"
)

# 서비스 선택 메뉴 (삭제 전에 선택)
echo ""
echo "📋 배포할 서비스 선택:"
echo ""
echo "🗄️  데이터베이스 서비스:"
echo "   0) 전체 DB 서비스 배포"
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
echo "✅ 선택된 서비스:"
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

# 기존 선택된 서비스 리소스 삭제
echo "🗑️  선택된 서비스 리소스 삭제 중..."
for SERVICE in "${SELECTED_DB_SERVICES[@]}"; do
    SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
    
    if [ "$SERVICE_NAME" = "redis" ]; then
        kubectl delete deployment redis -n bonanza-index --ignore-not-found=true
    elif [ "$SERVICE_NAME" = "questdb" ]; then
        kubectl delete statefulset questdb -n bonanza-index --ignore-not-found=true
    elif [ "$SERVICE_NAME" = "mariadb" ]; then
        kubectl delete statefulset mariadb -n bonanza-index --ignore-not-found=true
    fi
done

if [ "$SELECTED_NGINX" = true ]; then
    kubectl delete deployment nginx -n bonanza-index --ignore-not-found=true
    kubectl delete configmap nginx-config -n bonanza-index --ignore-not-found=true
fi

# PVC 삭제 여부 확인 (선택된 DB 서비스에 대해)
if [ ${#SELECTED_DB_SERVICES[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  PVC 삭제 여부 확인 (데이터 손실 가능)"
    read -p "선택된 DB 서비스의 PVC를 삭제하시겠습니까? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  PVC 삭제 중..."
        for SERVICE in "${SELECTED_DB_SERVICES[@]}"; do
            SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
            if [ "$SERVICE_NAME" = "redis" ]; then
                kubectl delete pvc redis-data -n bonanza-index --ignore-not-found=true
            elif [ "$SERVICE_NAME" = "questdb" ]; then
                kubectl delete pvc questdb-data -n bonanza-index --ignore-not-found=true
            elif [ "$SERVICE_NAME" = "mariadb" ]; then
                kubectl delete pvc mariadb-data -n bonanza-index --ignore-not-found=true
            fi
        done
    else
        echo "ℹ️  PVC 유지 (기존 데이터 보존)"
    fi
fi

echo ""
for i in {5..1}; do
    echo -ne "⏳ 대기 중... (${i})\r"
    sleep 1
done
echo -ne "⏳ 대기 종료          \n"

# StorageClass 생성
echo ""
echo "💾 StorageClass 확인..."
kubectl apply -f storageclass-local-path-immediate.yaml

# 공통 ConfigMap 및 Secret 확인
echo ""
echo "⚙️  공통 리소스 확인..."
kubectl apply -f configmap-common.yaml
kubectl apply -f secret.yaml


# 데이터베이스 서비스 배포
if [ ${#SELECTED_DB_SERVICES[@]} -gt 0 ]; then
    echo ""
    echo "🗄️  데이터베이스 서비스 배포 중..."
    
    for SERVICE in "${SELECTED_DB_SERVICES[@]}"; do
        SERVICE_NAME=$(echo "$SERVICE" | cut -d: -f1)
        DEPLOYMENT_NAME=$(echo "$SERVICE" | cut -d: -f2)
        
        if [ "$SERVICE_NAME" = "redis" ]; then
            # Redis PVC는 Deployment이므로 명시적으로 생성 필요
            if ! kubectl get pvc redis-data -n bonanza-index &>/dev/null; then
                echo "  - Redis PVC 생성 중..."
                kubectl apply -f redis/pvc.yaml
            fi
            echo "  - Redis 배포 중..."
            kubectl apply -f redis/
        elif [ "$SERVICE_NAME" = "questdb" ]; then
            echo "  - QuestDB 배포 중..."
            kubectl apply -f questdb/
        elif [ "$SERVICE_NAME" = "mariadb" ]; then
            echo "  - MariaDB 배포 중..."
            kubectl apply -f mariadb/
        fi
    done
fi

# Nginx 배포
if [ "$SELECTED_NGINX" = true ]; then
    echo ""
    echo "🌐 Nginx 배포 중..."
    echo "  - ConfigMap 적용 중..."
    kubectl apply -f nginx/configmap.yaml
    echo "  - Deployment 적용 중..."
    kubectl apply -f nginx/deployment.yaml
    echo "  - Service 적용 중..."
    kubectl apply -f nginx/service.yaml
fi

echo ""
echo "⏳ 마스터 노드 배포 완료 대기 중 (15초)..."
for i in {15..1}; do
    echo -ne "⏳ 남은 시간: ${i}초\r"
    sleep 1
done
echo -ne "⏳ 대기 종료          \n"

echo ""
echo "✅ 마스터 노드 배포 상태 확인"
echo "================================"
echo ""

echo "📦 마스터 노드 Pod 상태:"
kubectl get pods -n bonanza-index -o wide --field-selector=spec.nodeName=$CURRENT_NODE

echo ""
echo "💾 PVC 상태:"
kubectl get pvc -n bonanza-index

echo ""
echo "🔍 마스터 노드 서비스 상태:"
kubectl get svc -n bonanza-index -l 'app in (redis,nginx)' || kubectl get svc -n bonanza-index | grep -E "(redis|nginx|questdb|mariadb)"

echo ""
echo "📊 데이터베이스 Pod 상세 상태:"
echo ""

echo "QuestDB:"
QUESTDB_PHASE=$(kubectl get pod questdb-0 -n bonanza-index -o jsonpath='{.status.phase}' 2>/dev/null || echo "N/A")
QUESTDB_READY=$(kubectl get pod questdb-0 -n bonanza-index -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
QUESTDB_NODE=$(kubectl get pod questdb-0 -n bonanza-index -o jsonpath='{.spec.nodeName}' 2>/dev/null || echo "N/A")
echo "  Phase: $QUESTDB_PHASE, Ready: $QUESTDB_READY, Node: $QUESTDB_NODE"

echo ""
echo "MariaDB:"
MARIADB_PHASE=$(kubectl get pod mariadb-0 -n bonanza-index -o jsonpath='{.status.phase}' 2>/dev/null || echo "N/A")
MARIADB_READY=$(kubectl get pod mariadb-0 -n bonanza-index -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
MARIADB_NODE=$(kubectl get pod mariadb-0 -n bonanza-index -o jsonpath='{.spec.nodeName}' 2>/dev/null || echo "N/A")
echo "  Phase: $MARIADB_PHASE, Ready: $MARIADB_READY, Node: $MARIADB_NODE"

echo ""
echo "Redis:"
REDIS_PHASE=$(kubectl get pods -n bonanza-index -l app=redis -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
REDIS_READY=$(kubectl get pods -n bonanza-index -l app=redis -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
REDIS_NODE=$(kubectl get pods -n bonanza-index -l app=redis -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || echo "N/A")
echo "  Phase: $REDIS_PHASE, Ready: $REDIS_READY, Node: $REDIS_NODE"

echo ""
echo "Nginx:"
NGINX_PHASE=$(kubectl get pods -n bonanza-index -l app=nginx -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
NGINX_READY=$(kubectl get pods -n bonanza-index -l app=nginx -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
NGINX_NODE=$(kubectl get pods -n bonanza-index -l app=nginx -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || echo "N/A")
echo "  Phase: $NGINX_PHASE, Ready: $NGINX_READY, Node: $NGINX_NODE"

# 문제가 있는 Pod 확인
echo ""
FAILING_PODS=$(kubectl get pods -n bonanza-index --field-selector=spec.nodeName=$CURRENT_NODE --field-selector=status.phase!=Running,status.phase!=Succeeded -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
if [ ! -z "$FAILING_PODS" ]; then
    echo "⚠️  마스터 노드에서 문제가 있는 Pod:"
    kubectl get pods -n bonanza-index --field-selector=spec.nodeName=$CURRENT_NODE --field-selector=status.phase!=Running,status.phase!=Succeeded
    echo ""
    echo "💡 자세한 정보 확인:"
    echo "  kubectl describe pod <pod-name> -n bonanza-index"
    echo "  kubectl logs <pod-name> -n bonanza-index"
else
    echo "✅ 마스터 노드의 모든 Pod가 정상적으로 실행 중입니다!"
fi

echo ""
echo "================================"
echo "✅ 마스터 노드 배포 완료!"
echo "================================"
echo ""
echo "💡 다음 단계:"
echo "  워커 노드에 애플리케이션을 배포하려면:"
echo "  ./k8s/scripts/deploy-worker.sh"
echo ""


