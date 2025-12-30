#!/bin/bash

# Bonanza Index Kubernetes 배포 삭제 스크립트
# 사용법: ./undeploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K3S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# k3s 환경에서 kubectl 명령어 확인
if command -v kubectl &> /dev/null; then
    KUBECTL="kubectl"
elif command -v k3s &> /dev/null; then
    KUBECTL="k3s kubectl"
else
    echo "❌ 오류: kubectl 또는 k3s 명령어를 찾을 수 없습니다."
    echo "   k3s가 설치되어 있는지 확인하세요."
    exit 1
fi

NAMESPACE="bonanza-index"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 메뉴 표시
show_menu() {
    echo ""
    echo "=========================================="
    echo "  Bonanza Index 배포 삭제"
    echo "=========================================="
    echo ""
    echo "삭제할 항목을 선택하세요:"
    echo ""
    echo "  1) telegram-log"
    echo "  2) index-calc-fe"
    echo "  3) index-endpoint"
    echo "  4) index-calculator"
    echo "  5) ticker-collector"
    echo "  6) orderbook-collector"
    echo "  7) ticker-storage-worker"
    echo "  8) orderbook-storage-worker"
    echo "  9) minio"
    echo "  10) 모든 서비스 삭제 (All Services)"
    echo "  11) 네임스페이스 삭제 (Namespace - 모든 리소스 포함)"
    echo "  0) 종료"
    echo ""
    echo -n "선택 [0-11]: "
}

# 서비스 삭제 함수
delete_service() {
    local service=$1
    local deployment_name=$service
    local service_name="${service}"
    
    echo ""
    echo -e "${BLUE}🗑️  $service 삭제 중...${NC}"
    echo "=========================================="
    
    # Deployment 삭제
    if $KUBECTL get deployment "$deployment_name" -n "$NAMESPACE" &>/dev/null; then
        echo "  - Deployment 삭제: $deployment_name"
        $KUBECTL delete deployment "$deployment_name" -n "$NAMESPACE" --wait=false
        echo -e "    ${GREEN}✅ Deployment 삭제 요청 완료${NC}"
    else
        echo "  - Deployment가 존재하지 않음: $deployment_name"
    fi
    
    # Service 삭제
    case $service in
        minio)
            # MinIO는 여러 서비스가 있음
            for svc in "minio-service" "minio-console-service"; do
                if $KUBECTL get service "$svc" -n "$NAMESPACE" &>/dev/null; then
                    echo "  - Service 삭제: $svc"
                    $KUBECTL delete service "$svc" -n "$NAMESPACE"
                    echo -e "    ${GREEN}✅ Service 삭제 완료: $svc${NC}"
                else
                    echo "  - Service가 존재하지 않음: $svc"
                fi
            done
            ;;
        index-calc-fe)
            # index-calc-fe는 service 이름이 다름
            if $KUBECTL get service "index-calc-fe-service" -n "$NAMESPACE" &>/dev/null; then
                echo "  - Service 삭제: index-calc-fe-service"
                $KUBECTL delete service "index-calc-fe-service" -n "$NAMESPACE"
                echo -e "    ${GREEN}✅ Service 삭제 완료${NC}"
            else
                echo "  - Service가 존재하지 않음: index-calc-fe-service"
            fi
            ;;
        *)
            # 기본적으로 서비스 이름은 deployment 이름과 동일
            if $KUBECTL get service "$service_name" -n "$NAMESPACE" &>/dev/null; then
                echo "  - Service 삭제: $service_name"
                $KUBECTL delete service "$service_name" -n "$NAMESPACE"
                echo -e "    ${GREEN}✅ Service 삭제 완료${NC}"
            else
                echo "  - Service가 존재하지 않음: $service_name"
            fi
            ;;
    esac
    
    # MinIO의 경우 Job도 삭제
    if [ "$service" = "minio" ]; then
        if $KUBECTL get job "minio-init-bucket" -n "$NAMESPACE" &>/dev/null; then
            echo "  - Job 삭제: minio-init-bucket"
            $KUBECTL delete job "minio-init-bucket" -n "$NAMESPACE" --wait=false
            echo -e "    ${GREEN}✅ Job 삭제 요청 완료${NC}"
        fi
    fi
    
    echo ""
}

# orderbook-collector 기본 삭제
delete_orderbook_collector_default() {
    delete_service "orderbook-collector"
}

# orderbook-collector 마스터 삭제
delete_orderbook_collector_master() {
    echo ""
    echo -e "${BLUE}🗑️  orderbook-collector-master 삭제 중...${NC}"
    echo "=========================================="
    
    if $KUBECTL get deployment "orderbook-collector-master" -n "$NAMESPACE" &>/dev/null; then
        echo "  - Deployment 삭제: orderbook-collector-master"
        $KUBECTL delete deployment "orderbook-collector-master" -n "$NAMESPACE" --wait=false
        echo -e "    ${GREEN}✅ Deployment 삭제 요청 완료${NC}"
    else
        echo "  - Deployment가 존재하지 않음: orderbook-collector-master"
    fi
    
    echo ""
}

# orderbook-collector 슬레이브 삭제
delete_orderbook_collector_slave() {
    echo ""
    echo -e "${BLUE}🗑️  orderbook-collector-slave 삭제 중...${NC}"
    echo "=========================================="
    
    if $KUBECTL get deployment "orderbook-collector-slave" -n "$NAMESPACE" &>/dev/null; then
        echo "  - Deployment 삭제: orderbook-collector-slave"
        $KUBECTL delete deployment "orderbook-collector-slave" -n "$NAMESPACE" --wait=false
        echo -e "    ${GREEN}✅ Deployment 삭제 요청 완료${NC}"
    else
        echo "  - Deployment가 존재하지 않음: orderbook-collector-slave"
    fi
    
    echo ""
}

# orderbook-collector 모두 삭제 (기본 + 마스터 + 슬레이브)
delete_orderbook_collector_all() {
    echo ""
    echo -e "${BLUE}🗑️  orderbook-collector 모두 삭제 중...${NC}"
    echo "=========================================="
    
    # 기본 orderbook-collector 삭제
    delete_orderbook_collector_default
    
    # 마스터 삭제
    delete_orderbook_collector_master
    
    # 슬레이브 삭제
    delete_orderbook_collector_slave
    
    # Service 삭제 (한 번만)
    if $KUBECTL get service "orderbook-collector" -n "$NAMESPACE" &>/dev/null; then
        echo "  - Service 삭제: orderbook-collector"
        $KUBECTL delete service "orderbook-collector" -n "$NAMESPACE"
        echo -e "    ${GREEN}✅ Service 삭제 완료${NC}"
    fi
    
    echo ""
}

# orderbook-collector 삭제 메뉴
show_orderbook_collector_delete_menu() {
    echo ""
    echo "=========================================="
    echo "  orderbook-collector 삭제 옵션"
    echo "=========================================="
    echo ""
    echo "삭제할 옵션을 선택하세요:"
    echo ""
    echo "  1) orderbook-collector (기본, replicas: 2)"
    echo "  2) orderbook-collector-master"
    echo "  3) orderbook-collector-slave"
    echo "  4) orderbook-collector 모두 삭제 (기본 + 마스터 + 슬레이브)"
    echo "  0) 취소"
    echo ""
    echo -n "선택 [0-4]: "
}

# ticker-collector 기본 삭제
delete_ticker_collector_default() {
    delete_service "ticker-collector"
}

# ticker-collector 마스터 삭제
delete_ticker_collector_master() {
    echo ""
    echo -e "${BLUE}🗑️  ticker-collector-master 삭제 중...${NC}"
    echo "=========================================="
    
    if $KUBECTL get deployment "ticker-collector-master" -n "$NAMESPACE" &>/dev/null; then
        echo "  - Deployment 삭제: ticker-collector-master"
        $KUBECTL delete deployment "ticker-collector-master" -n "$NAMESPACE" --wait=false
        echo -e "    ${GREEN}✅ Deployment 삭제 요청 완료${NC}"
    else
        echo "  - Deployment가 존재하지 않음: ticker-collector-master"
    fi
    
    echo ""
}

# ticker-collector 슬레이브 삭제
delete_ticker_collector_slave() {
    echo ""
    echo -e "${BLUE}🗑️  ticker-collector-slave 삭제 중...${NC}"
    echo "=========================================="
    
    if $KUBECTL get deployment "ticker-collector-slave" -n "$NAMESPACE" &>/dev/null; then
        echo "  - Deployment 삭제: ticker-collector-slave"
        $KUBECTL delete deployment "ticker-collector-slave" -n "$NAMESPACE" --wait=false
        echo -e "    ${GREEN}✅ Deployment 삭제 요청 완료${NC}"
    else
        echo "  - Deployment가 존재하지 않음: ticker-collector-slave"
    fi
    
    echo ""
}

# ticker-collector 모두 삭제 (기본 + 마스터 + 슬레이브)
delete_ticker_collector_all() {
    echo ""
    echo -e "${BLUE}🗑️  ticker-collector 모두 삭제 중...${NC}"
    echo "=========================================="
    
    # 기본 ticker-collector 삭제
    delete_ticker_collector_default
    
    # 마스터 삭제
    delete_ticker_collector_master
    
    # 슬레이브 삭제
    delete_ticker_collector_slave
    
    # Service 삭제 (한 번만)
    if $KUBECTL get service "ticker-collector" -n "$NAMESPACE" &>/dev/null; then
        echo "  - Service 삭제: ticker-collector"
        $KUBECTL delete service "ticker-collector" -n "$NAMESPACE"
        echo -e "    ${GREEN}✅ Service 삭제 완료${NC}"
    fi
    
    echo ""
}

# ticker-collector 삭제 메뉴
show_ticker_collector_delete_menu() {
    echo ""
    echo "=========================================="
    echo "  ticker-collector 삭제 옵션"
    echo "=========================================="
    echo ""
    echo "삭제할 옵션을 선택하세요:"
    echo ""
    echo "  1) ticker-collector (기본, replicas: 2)"
    echo "  2) ticker-collector-master"
    echo "  3) ticker-collector-slave"
    echo "  4) ticker-collector 모두 삭제 (기본 + 마스터 + 슬레이브)"
    echo "  0) 취소"
    echo ""
    echo -n "선택 [0-4]: "
}

# 모든 서비스 삭제
delete_all_services() {
    echo ""
    echo -e "${RED}⚠️  모든 서비스를 삭제하시겠습니까?${NC}"
    echo "  삭제 대상:"
    echo "    - telegram-log"
    echo "    - index-calc-fe"
    echo "    - index-endpoint"
    echo "    - index-calculator"
    echo "    - ticker-collector (기본 + 마스터 + 슬레이브)"
    echo "    - orderbook-collector (기본 + 마스터 + 슬레이브)"
    echo "    - ticker-storage-worker"
    echo "    - orderbook-storage-worker"
    echo "    - minio"
    echo ""
    echo -n "계속하시겠습니까? (yes/no): "
    read -r confirm
    
    if [ "$confirm" != "yes" ]; then
        echo "취소되었습니다."
        return 1
    fi
    
    echo ""
    echo -e "${BLUE}🗑️  모든 서비스 삭제 중...${NC}"
    echo "=========================================="
    
    # 역순으로 삭제 (의존성 고려)
    delete_service "telegram-log"
    delete_service "index-calc-fe"
    delete_service "index-endpoint"
    delete_service "index-calculator"
    # ticker-collector 모두 삭제 (기본 + 마스터 + 슬레이브)
    delete_ticker_collector_all
    # orderbook-collector 모두 삭제 (기본 + 마스터 + 슬레이브)
    delete_orderbook_collector_all
    delete_service "ticker-storage-worker"
    delete_service "orderbook-storage-worker"
    delete_service "minio"
    
    echo ""
    echo -e "${GREEN}✅ 모든 서비스 삭제 요청 완료${NC}"
    echo ""
    echo "Pod 삭제 상태 확인:"
    $KUBECTL get pods -n "$NAMESPACE" 2>/dev/null || echo "  Pod가 없습니다."
    echo ""
}

# 네임스페이스 삭제 (모든 리소스 포함)
delete_namespace() {
    echo ""
    echo -e "${RED}⚠️  경고: 네임스페이스를 삭제하면 모든 리소스가 삭제됩니다!${NC}"
    echo "  삭제될 항목:"
    echo "    - 모든 Pod, Service, Deployment"
    echo "    - 모든 ConfigMap, Secret"
    echo "    - 모든 Job, PVC"
    echo "    - 네임스페이스 자체"
    echo ""
    echo -n "정말로 네임스페이스 '$NAMESPACE'를 삭제하시겠습니까? (yes/no): "
    read -r confirm
    
    if [ "$confirm" != "yes" ]; then
        echo "취소되었습니다."
        return 1
    fi
    
    echo ""
    echo -e "${BLUE}🗑️  네임스페이스 삭제 중...${NC}"
    echo "=========================================="
    
    if $KUBECTL get namespace "$NAMESPACE" &>/dev/null; then
        echo "  - 네임스페이스 삭제: $NAMESPACE"
        $KUBECTL delete namespace "$NAMESPACE"
        echo -e "    ${GREEN}✅ 네임스페이스 삭제 완료${NC}"
        
        echo ""
        echo "네임스페이스 삭제 대기 중..."
        while $KUBECTL get namespace "$NAMESPACE" &>/dev/null; do
            echo "  네임스페이스가 삭제될 때까지 대기 중..."
            sleep 2
        done
        echo -e "${GREEN}✅ 네임스페이스 삭제 완료${NC}"
    else
        echo "  - 네임스페이스가 존재하지 않음: $NAMESPACE"
    fi
    
    echo ""
}

# 메인 로직
main() {
    cd "$K3S_DIR" || {
        echo "❌ 오류: k3s 디렉토리로 이동할 수 없습니다: $K3S_DIR"
        exit 1
    }
    
    # 네임스페이스 존재 확인
    if ! $KUBECTL get namespace "$NAMESPACE" &>/dev/null; then
        echo "⚠️  네임스페이스 '$NAMESPACE'가 존재하지 않습니다."
        echo "   삭제할 리소스가 없습니다."
        exit 0
    fi
    
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1)
                delete_service "telegram-log"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            2)
                delete_service "index-calc-fe"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            3)
                delete_service "index-endpoint"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            4)
                delete_service "index-calculator"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            5)
                while true; do
                    show_ticker_collector_delete_menu
                    read -r ticker_choice
                    
                    case $ticker_choice in
                        1)
                            delete_ticker_collector_default
                            break
                            ;;
                        2)
                            delete_ticker_collector_master
                            break
                            ;;
                        3)
                            delete_ticker_collector_slave
                            break
                            ;;
                        4)
                            delete_ticker_collector_all
                            break
                            ;;
                        0)
                            echo "취소되었습니다."
                            break
                            ;;
                        *)
                            echo ""
                            echo "❌ 잘못된 선택입니다. 0-4 사이의 숫자를 입력하세요."
                            echo ""
                            sleep 1
                            ;;
                    esac
                done
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            6)
                while true; do
                    show_orderbook_collector_delete_menu
                    read -r orderbook_choice
                    
                    case $orderbook_choice in
                        1)
                            delete_orderbook_collector_default
                            break
                            ;;
                        2)
                            delete_orderbook_collector_master
                            break
                            ;;
                        3)
                            delete_orderbook_collector_slave
                            break
                            ;;
                        4)
                            delete_orderbook_collector_all
                            break
                            ;;
                        0)
                            echo "취소되었습니다."
                            break
                            ;;
                        *)
                            echo ""
                            echo "❌ 잘못된 선택입니다. 0-4 사이의 숫자를 입력하세요."
                            echo ""
                            sleep 1
                            ;;
                    esac
                done
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            7)
                delete_service "ticker-storage-worker"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            8)
                delete_service "orderbook-storage-worker"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            9)
                delete_service "minio"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            10)
                delete_all_services
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            11)
                delete_namespace
                echo "네임스페이스가 삭제되었습니다. 종료합니다."
                exit 0
                ;;
            0)
                echo ""
                echo "종료합니다."
                exit 0
                ;;
            *)
                echo ""
                echo "❌ 잘못된 선택입니다. 0-11 사이의 숫자를 입력하세요."
                echo ""
                sleep 1
                ;;
        esac
        
        # 삭제 후 상태 확인 (네임스페이스가 아직 존재하는 경우)
        if [ $choice -ge 1 ] && [ $choice -le 10 ]; then
            if $KUBECTL get namespace "$NAMESPACE" &>/dev/null; then
                echo ""
                echo "현재 Pod 상태:"
                $KUBECTL get pods -n "$NAMESPACE" 2>/dev/null | head -10 || echo "  Pod가 없습니다."
                echo ""
            fi
        fi
    done
}

# 스크립트 실행
main

