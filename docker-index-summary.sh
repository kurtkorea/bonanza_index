#!/bin/bash

# index-summary를 Docker로 관리하는 스크립트
# 주의: 이 스크립트는 index-summary를 Docker로만 배포합니다.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
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

log_title() {
    echo -e "${CYAN}$1${NC}"
}

# 메뉴 표시
show_menu() {
    echo ""
    log_title "🐳 Docker Index-Summary 관리"
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

# Docker Compose 파일 경로
COMPOSE_FILE="docker-compose.index-summary.yml"

# Docker Compose를 사용한 빌드
build_container() {
    log_info "Docker 이미지 빌드 중..."
    docker-compose -f "$COMPOSE_FILE" build index-summary
    log_info "빌드 완료"
}

# Docker Compose를 사용한 시작
start_container() {
    log_info "컨테이너 시작 중..."
    docker-compose -f "$COMPOSE_FILE" up -d index-summary
    log_info "시작 완료"
    
    echo ""
    log_info "컨테이너 상태:"
    docker-compose -f "$COMPOSE_FILE" ps index-summary
}

# Docker Compose를 사용한 중지
stop_container() {
    log_info "컨테이너 중지 중..."
    docker-compose -f "$COMPOSE_FILE" stop index-summary
    log_info "중지 완료"
}

# Docker Compose를 사용한 재시작
restart_container() {
    log_info "컨테이너 재시작 중..."
    docker-compose -f "$COMPOSE_FILE" restart index-summary
    log_info "재시작 완료"
    
    echo ""
    log_info "컨테이너 상태:"
    docker-compose -f "$COMPOSE_FILE" ps index-summary
}

# 상태 확인
check_status() {
    echo ""
    log_info "컨테이너 상태:"
    docker-compose -f "$COMPOSE_FILE" ps index-summary
    
    echo ""
    log_info "컨테이너 리소스 사용량:"
    CONTAINER_ID=$(docker-compose -f "$COMPOSE_FILE" ps -q index-summary 2>/dev/null)
    if [ -n "$CONTAINER_ID" ]; then
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" "$CONTAINER_ID"
    else
        log_warn "실행 중인 컨테이너가 없습니다"
    fi
}

# 로그 확인
show_logs() {
    echo ""
    echo "로그 확인 옵션:"
    echo "  1) 실시간 로그 (tail -f)"
    echo "  2) 최근 100줄 로그"
    echo "  3) 최근 500줄 로그"
    echo "  4) 전체 로그"
    echo ""
    read -p "선택하세요 (1-4): " LOG_CHOICE
    
    case $LOG_CHOICE in
        1)
            docker-compose -f "$COMPOSE_FILE" logs -f index-summary
            ;;
        2)
            docker-compose -f "$COMPOSE_FILE" logs --tail=100 index-summary
            ;;
        3)
            docker-compose -f "$COMPOSE_FILE" logs --tail=500 index-summary
            ;;
        4)
            docker-compose -f "$COMPOSE_FILE" logs index-summary
            ;;
        *)
            log_error "잘못된 선택입니다"
            ;;
    esac
}

# 전체 재빌드 및 시작
rebuild_and_start() {
    log_info "전체 재빌드 및 시작 중..."
    docker-compose -f "$COMPOSE_FILE" stop index-summary 2>/dev/null || true
    docker-compose -f "$COMPOSE_FILE" rm -f index-summary 2>/dev/null || true
    docker-compose -f "$COMPOSE_FILE" build --no-cache index-summary
    docker-compose -f "$COMPOSE_FILE" up -d index-summary
    log_info "완료"
    
    echo ""
    log_info "컨테이너 상태:"
    docker-compose -f "$COMPOSE_FILE" ps index-summary
}

# 메인 루프
main() {
    while true; do
        show_menu
        read -p "선택하세요 (1-8): " CHOICE
        
        case $CHOICE in
            1)
                build_container
                ;;
            2)
                start_container
                ;;
            3)
                stop_container
                ;;
            4)
                restart_container
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

