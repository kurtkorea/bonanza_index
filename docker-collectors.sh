#!/bin/bash

# orderbook-collector와 ticker-collector를 Docker로 관리하는 스크립트
# 주의: 이 스크립트는 개발/테스트 목적으로 사용됩니다.
# 프로덕션 환경에서는 Kubernetes (k3s)로 배포하는 것을 권장합니다.
# Kubernetes 배포: ./k8s/scripts/deploy-worker.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 함수: 로그 출력
log_info() {
    echo -e "${GREEN}ℹ️  $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 메뉴 표시
show_menu() {
    echo ""
    echo "🐳 Docker Collector 관리"
    echo "================================"
    echo ""
    echo "  1) 빌드 (Build)"
    echo "  2) 시작 (Start)"
    echo "  3) 중지 (Stop)"
    echo "  4) 재시작 (Restart)"
    echo "  5) 상태 확인 (Status)"
    echo "  6) 로그 확인 (Logs)"
    echo "  7) 전체 재빌드 및 시작 (Rebuild & Start)"
    echo "  8) 종료 (Exit)"
    echo ""
}

# Docker Compose를 사용한 빌드
build_containers() {
    log_info "Docker 이미지 빌드 중..."
    docker-compose build
    log_info "빌드 완료"
}

# Docker Compose를 사용한 시작
start_containers() {
    log_info "컨테이너 시작 중..."
    docker-compose up -d
    log_info "시작 완료"
    
    echo ""
    log_info "컨테이너 상태:"
    docker-compose ps
}

# Docker Compose를 사용한 중지
stop_containers() {
    log_info "컨테이너 중지 중..."
    docker-compose stop
    log_info "중지 완료"
}

# Docker Compose를 사용한 재시작
restart_containers() {
    log_info "컨테이너 재시작 중..."
    docker-compose restart
    log_info "재시작 완료"
    
    echo ""
    log_info "컨테이너 상태:"
    docker-compose ps
}

# 상태 확인
check_status() {
    echo ""
    log_info "컨테이너 상태:"
    docker-compose ps
    
    echo ""
    log_info "컨테이너 리소스 사용량:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" $(docker-compose ps -q) 2>/dev/null || log_warn "실행 중인 컨테이너가 없습니다"
}

# 로그 확인
show_logs() {
    echo ""
    echo "로그 확인 옵션:"
    echo "  1) orderbook-collector 로그"
    echo "  2) ticker-collector 로그"
    echo "  3) 전체 로그"
    echo "  4) 실시간 로그 (tail -f)"
    echo ""
    read -p "선택하세요 (1-4): " LOG_CHOICE
    
    case $LOG_CHOICE in
        1)
            docker-compose logs -f orderbook-collector
            ;;
        2)
            docker-compose logs -f ticker-collector
            ;;
        3)
            docker-compose logs -f
            ;;
        4)
            docker-compose logs -f --tail=100
            ;;
        *)
            log_error "잘못된 선택입니다"
            ;;
    esac
}

# 전체 재빌드 및 시작
rebuild_and_start() {
    log_info "전체 재빌드 및 시작 중..."
    docker-compose down
    docker-compose build --no-cache
    docker-compose up -d
    log_info "완료"
    
    echo ""
    log_info "컨테이너 상태:"
    docker-compose ps
}

# 메인 루프
main() {
    while true; do
        show_menu
        read -p "선택하세요 (1-8): " CHOICE
        
        case $CHOICE in
            1)
                build_containers
                ;;
            2)
                start_containers
                ;;
            3)
                stop_containers
                ;;
            4)
                restart_containers
                ;;
            5)
                check_status
                ;;
            6)
                show_logs
                ;;
            7)
                rebuild_and_start
                ;;
            8)
                log_info "종료합니다"
                exit 0
                ;;
            *)
                log_error "잘못된 선택입니다"
                ;;
        esac
        
        echo ""
        read -p "계속하시겠습니까? (Enter to continue, q to quit): " CONTINUE
        if [ "$CONTINUE" = "q" ] || [ "$CONTINUE" = "Q" ]; then
            exit 0
        fi
    done
}

# 스크립트 실행
main

