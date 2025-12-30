#!/bin/bash

# Bonanza Index Kubernetes 배포 스크립트
# 사용법: ./deploy.sh

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
    echo "  Bonanza Index Kubernetes 배포"
    echo "=========================================="
    echo ""
    echo "배포할 항목을 선택하세요:"
    echo ""
    echo "  1) minio"
    echo "  2) orderbook-storage-worker"
    echo "  3) ticker-storage-worker"
    echo "  4) orderbook-collector"
    echo "  5) ticker-collector"
    echo "  6) index-calculator"
    echo "  7) index-endpoint"
    echo "  8) telegram-log"
    echo "  9) index-calc-fe"
    echo " 10) 모든 서비스 배포 (All Services)"
    echo "  0) 종료"
    echo ""
    echo -n "선택 [0-10]: "
}

# MinIO 배포
deploy_minio() {
    echo ""
    echo -e "${BLUE}🚀 MinIO 배포 중...${NC}"
    echo "=========================================="
    
    $KUBECTL apply -f minio-deployment.yaml
    $KUBECTL apply -f minio-service.yaml
    $KUBECTL apply -f minio-console-service.yaml
    
    # MinIO가 준비될 때까지 대기
    echo "  - MinIO 준비 대기 중..."
    $KUBECTL wait --for=condition=ready pod -l app=minio -n "$NAMESPACE" --timeout=120s || true
    
    # MinIO 버킷 초기화
    echo "  - MinIO 버킷 초기화 중..."
    $KUBECTL apply -f minio-job-init-bucket.yaml
    
    echo -e "${GREEN}✅ MinIO 배포 완료${NC}"
    echo ""
}

# 서비스 배포 함수
deploy_service() {
    local service=$1
    local wait_for_ready=${2:-false}  # 두 번째 인자로 ready 대기 여부
    local deployment_file="${service}-deployment.yaml"
    local service_file="${service}-service.yaml"
    
    echo ""
    echo -e "${BLUE}🚀 $service 배포 중...${NC}"
    echo "=========================================="
    
    # Deployment 배포
    if [ -f "$deployment_file" ]; then
        $KUBECTL apply -f "$deployment_file"
    else
        echo -e "${RED}❌ 파일을 찾을 수 없습니다: $deployment_file${NC}"
        return 1
    fi
    
    # Service 배포
    if [ -f "$service_file" ]; then
        $KUBECTL apply -f "$service_file"
    else
        echo -e "${YELLOW}⚠️  Service 파일이 없습니다: $service_file${NC}"
    fi
    
    # ready 대기가 필요한 경우
    if [ "$wait_for_ready" = "true" ]; then
        echo "  - $service 준비 대기 중..."
        $KUBECTL wait --for=condition=ready pod -l app="$service" -n "$NAMESPACE" --timeout=120s || true
    fi
    
    echo -e "${GREEN}✅ $service 배포 완료${NC}"
    echo ""
}

# ticker-collector 마스터 배포
deploy_ticker_collector_master() {
    echo ""
    echo -e "${BLUE}🚀 ticker-collector-master 배포 중...${NC}"
    echo "=========================================="
    
    $KUBECTL apply -f ticker-collector-master-deployment.yaml
    $KUBECTL apply -f ticker-collector-service.yaml
    
    echo -e "${GREEN}✅ ticker-collector-master 배포 완료${NC}"
    echo ""
}

# ticker-collector 슬레이브 배포
deploy_ticker_collector_slave() {
    echo ""
    echo -e "${BLUE}🚀 ticker-collector-slave 배포 중...${NC}"
    echo "=========================================="
    
    $KUBECTL apply -f ticker-collector-slave-deployment.yaml
    $KUBECTL apply -f ticker-collector-service.yaml
    
    echo -e "${GREEN}✅ ticker-collector-slave 배포 완료${NC}"
    echo ""
}

# ticker-collector 마스터/슬레이브 모두 배포
deploy_ticker_collector_both() {
    echo ""
    echo -e "${BLUE}🚀 ticker-collector (마스터 + 슬레이브) 배포 중...${NC}"
    echo "=========================================="
    
    $KUBECTL apply -f ticker-collector-master-deployment.yaml
    $KUBECTL apply -f ticker-collector-slave-deployment.yaml
    $KUBECTL apply -f ticker-collector-service.yaml
    
    echo -e "${GREEN}✅ ticker-collector (마스터 + 슬레이브) 배포 완료${NC}"
    echo ""
}

# orderbook-collector 마스터 배포
deploy_orderbook_collector_master() {
    echo ""
    echo -e "${BLUE}🚀 orderbook-collector-master 배포 중...${NC}"
    echo "=========================================="
    
    $KUBECTL apply -f orderbook-collector-master-deployment.yaml
    $KUBECTL apply -f orderbook-collector-service.yaml
    
    echo -e "${GREEN}✅ orderbook-collector-master 배포 완료${NC}"
    echo ""
}

# orderbook-collector 슬레이브 배포
deploy_orderbook_collector_slave() {
    echo ""
    echo -e "${BLUE}🚀 orderbook-collector-slave 배포 중...${NC}"
    echo "=========================================="
    
    $KUBECTL apply -f orderbook-collector-slave-deployment.yaml
    $KUBECTL apply -f orderbook-collector-service.yaml
    
    echo -e "${GREEN}✅ orderbook-collector-slave 배포 완료${NC}"
    echo ""
}

# orderbook-collector 마스터/슬레이브 모두 배포
deploy_orderbook_collector_both() {
    echo ""
    echo -e "${BLUE}🚀 orderbook-collector (마스터 + 슬레이브) 배포 중...${NC}"
    echo "=========================================="
    
    $KUBECTL apply -f orderbook-collector-master-deployment.yaml
    $KUBECTL apply -f orderbook-collector-slave-deployment.yaml
    $KUBECTL apply -f orderbook-collector-service.yaml
    
    echo -e "${GREEN}✅ orderbook-collector (마스터 + 슬레이브) 배포 완료${NC}"
    echo ""
}

# orderbook-collector 배포 메뉴
show_orderbook_collector_menu() {
    echo ""
    echo "=========================================="
    echo "  orderbook-collector 배포 옵션"
    echo "=========================================="
    echo ""
    echo "배포할 옵션을 선택하세요:"
    echo ""
    echo "  1) orderbook-collector (기본, replicas: 2, 리더 선출 모드)"
    echo "  2) orderbook-collector-master (replicas: 1, 리더 선출 활성화)"
    echo "  3) orderbook-collector-slave (replicas: 1, 리더 선출 비활성화)"
    echo "  4) orderbook-collector-master + orderbook-collector-slave (둘 다 배포)"
    echo "  0) 취소"
    echo ""
    echo -n "선택 [0-4]: "
}

# ticker-collector 배포 메뉴
show_ticker_collector_menu() {
    echo ""
    echo "=========================================="
    echo "  ticker-collector 배포 옵션"
    echo "=========================================="
    echo ""
    echo "배포할 옵션을 선택하세요:"
    echo ""
    echo "  1) ticker-collector (기본, replicas: 2, 리더 선출 모드)"
    echo "  2) ticker-collector-master (replicas: 1, 리더 선출 활성화)"
    echo "  3) ticker-collector-slave (replicas: 1, 리더 선출 비활성화)"
    echo "  4) ticker-collector-master + ticker-collector-slave (둘 다 배포)"
    echo "  0) 취소"
    echo ""
    echo -n "선택 [0-4]: "
}

# 모든 서비스 배포
deploy_all() {
    echo ""
    echo -e "${BLUE}🚀 모든 서비스 배포 중...${NC}"
    echo "=========================================="
    echo ""
    
    # MinIO 먼저 배포 (다른 서비스들이 의존)
    deploy_minio
    
    # Telegram Log 먼저 배포 (collector들이 의존)
    deploy_service "telegram-log" "true"
    
    # Storage Workers 배포 (다른 서비스들이 의존)
    deploy_service "orderbook-storage-worker"
    deploy_service "ticker-storage-worker"
    
    # Collectors 배포 (telegram-log가 준비된 후)
    deploy_service "orderbook-collector"
    deploy_service "ticker-collector"
    
    # Calculator 배포
    deploy_service "index-calculator"
    
    # Endpoint 배포
    deploy_service "index-endpoint"
    
    # Frontend 배포
    deploy_service "index-calc-fe"
    
    echo "=========================================="
    echo -e "${GREEN}✅ 모든 서비스 배포 완료${NC}"
    echo ""
    
    # 배포 상태 확인
    echo "배포 상태 확인:"
    $KUBECTL get pods -n "$NAMESPACE"
    echo ""
    echo "서비스 상태 확인:"
    $KUBECTL get svc -n "$NAMESPACE"
    echo ""
}

# 메인 로직
main() {
    cd "$K3S_DIR" || {
        echo "❌ 오류: k3s 디렉토리로 이동할 수 없습니다: $K3S_DIR"
        exit 1
    }
    
    # 네임스페이스 생성
    if ! $KUBECTL get namespace "$NAMESPACE" &>/dev/null; then
        echo "네임스페이스 생성 중..."
        $KUBECTL apply -f namespace.yaml
        echo ""
    fi
    
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1)
                deploy_minio
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            2)
                deploy_service "orderbook-storage-worker"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            3)
                deploy_service "ticker-storage-worker"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            4)
                while true; do
                    show_orderbook_collector_menu
                    read -r orderbook_choice
                    
                    case $orderbook_choice in
                        1)
                            deploy_service "orderbook-collector"
                            break
                            ;;
                        2)
                            deploy_orderbook_collector_master
                            break
                            ;;
                        3)
                            deploy_orderbook_collector_slave
                            break
                            ;;
                        4)
                            deploy_orderbook_collector_both
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
            5)
                while true; do
                    show_ticker_collector_menu
                    read -r ticker_choice
                    
                    case $ticker_choice in
                        1)
                            deploy_service "ticker-collector"
                            break
                            ;;
                        2)
                            deploy_ticker_collector_master
                            break
                            ;;
                        3)
                            deploy_ticker_collector_slave
                            break
                            ;;
                        4)
                            deploy_ticker_collector_both
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
                deploy_service "index-calculator"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            7)
                deploy_service "index-endpoint"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            8)
                deploy_service "telegram-log"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            9)
                deploy_service "index-calc-fe"
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            10)
                deploy_all
                echo "배포 완료. 계속하려면 Enter를 누르세요..."
                read -r
                ;;
            0)
                echo ""
                echo "종료합니다."
                exit 0
                ;;
            *)
                echo ""
                echo "❌ 잘못된 선택입니다. 0-10 사이의 숫자를 입력하세요."
                echo ""
                sleep 1
                ;;
        esac
    done
}

# 스크립트 실행
main
