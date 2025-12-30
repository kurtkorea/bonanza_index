#!/bin/bash

# Bonanza Index Kubernetes 실시간 로그 확인 스크립트
# 사용법: ./logs.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 서비스별 Pod 이름 가져오기
get_pod_name() {
    local service_name=$1
    local role=${2:-""}  # role이 지정되면 해당 role의 pod 반환
    local pod_name
    
    if [ -n "$role" ]; then
        pod_name=$($KUBECTL get pods -n "$NAMESPACE" -l app="$service_name",role="$role" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    else
        pod_name=$($KUBECTL get pods -n "$NAMESPACE" -l app="$service_name" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    fi
    echo "$pod_name"
}

# Deployment 이름으로 Pod 이름 가져오기
get_pod_by_deployment() {
    local deployment_name=$1
    # Deployment의 selector label을 사용하여 pod 찾기
    # orderbook-collector-master -> app: orderbook-collector, role: master
    # ticker-collector-master -> app: ticker-collector, role: master
    local app_label
    local role_label
    
    if [[ "$deployment_name" == *"-master" ]]; then
        app_label="${deployment_name%-master}"
        role_label="master"
    elif [[ "$deployment_name" == *"-slave" ]]; then
        app_label="${deployment_name%-slave}"
        role_label="slave"
    else
        # 기본 deployment인 경우
        app_label="$deployment_name"
        role_label=""
    fi
    
    local pod_name
    if [ -n "$role_label" ]; then
        pod_name=$($KUBECTL get pods -n "$NAMESPACE" -l app="$app_label",role="$role_label" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    else
        pod_name=$($KUBECTL get pods -n "$NAMESPACE" -l app="$app_label" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    fi
    echo "$pod_name"
}

# 모든 Pod 이름 가져오기
get_all_pods() {
    $KUBECTL get pods -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null
}

# 실시간 로그 확인
show_logs() {
    local pod_name=$1
    local follow=${2:-true}
    local tail_lines=${3:-100}
    local previous=${4:-false}
    
    if [ -z "$pod_name" ]; then
        echo -e "${RED}❌ Pod 이름이 제공되지 않았습니다.${NC}"
        return 1
    fi
    
    # Pod 존재 확인
    if ! $KUBECTL get pod -n "$NAMESPACE" "$pod_name" &>/dev/null; then
        echo -e "${RED}❌ Pod '$pod_name'을 찾을 수 없습니다.${NC}"
        return 1
    fi
    
    echo ""
    if [ "$previous" = true ]; then
        echo -e "${CYAN}📝 Pod: ${GREEN}$pod_name${NC}${CYAN} 의 이전 컨테이너 로그 (재시작 전)${NC}"
    else
        echo -e "${CYAN}📝 Pod: ${GREEN}$pod_name${NC}${CYAN} 의 로그${NC}"
    fi
    echo "=========================================="
    echo -e "${YELLOW}종료하려면 Ctrl+C를 누르세요${NC}"
    echo ""
    
    local log_cmd="$KUBECTL logs -n $NAMESPACE $pod_name --tail=$tail_lines"
    
    if [ "$previous" = true ]; then
        log_cmd="$log_cmd --previous"
    fi
    
    if [ "$follow" = true ]; then
        log_cmd="$log_cmd -f"
    fi
    
    $log_cmd 2>&1
}

# 서비스별 로그 확인
show_service_logs() {
    local service_name=$1
    local previous=${2:-false}
    local role=${3:-""}  # role이 지정되면 해당 role의 pod 사용
    local pod_name
    
    if [ -n "$role" ]; then
        pod_name=$(get_pod_name "$service_name" "$role")
    else
        pod_name=$(get_pod_name "$service_name")
    fi
    
    if [ -z "$pod_name" ]; then
        if [ -n "$role" ]; then
            echo -e "${RED}❌ '$service_name' 서비스의 '$role' Pod을 찾을 수 없습니다.${NC}"
        else
            echo -e "${RED}❌ '$service_name' 서비스의 Pod을 찾을 수 없습니다.${NC}"
        fi
        echo ""
        return 1
    fi
    
    show_logs "$pod_name" true 100 "$previous"
}

# Deployment 이름으로 로그 확인
show_deployment_logs() {
    local deployment_name=$1
    local previous=${2:-false}
    local pod_name=$(get_pod_by_deployment "$deployment_name")
    
    if [ -z "$pod_name" ]; then
        echo -e "${RED}❌ '$deployment_name' Deployment의 Pod을 찾을 수 없습니다.${NC}"
        echo ""
        return 1
    fi
    
    show_logs "$pod_name" true 100 "$previous"
}

# 메뉴 표시
show_menu() {
    clear
    echo ""
    echo "=========================================="
    echo "  Bonanza Index 실시간 로그 확인"
    echo "=========================================="
    echo ""
    echo "확인할 서비스를 선택하세요:"
    echo ""
    echo "  1) orderbook-collector"
    echo "  2) ticker-collector"
    echo "  3) orderbook-storage-worker"
    echo "  4) ticker-storage-worker"
    echo "  5) index-calculator"
    echo "  6) index-endpoint"
    echo "  7) telegram-log"
    echo "  8) index-calc-fe"
    echo "  9) minio"
    echo " 10) 모든 Pod 목록에서 선택"
    echo " 11) 특정 Pod 이름으로 직접 확인"
    echo " 12) 이전 컨테이너 로그 확인 (재시작 전 로그)"
    echo "  0) 종료"
    echo ""
    echo -n "선택 [0-12]: "
}

# Pod 목록에서 선택
select_from_pods() {
    echo ""
    echo -e "${BLUE}📦 Pod 목록${NC}"
    echo "=========================================="
    
    local pods=$(get_all_pods)
    
    if [ -z "$pods" ]; then
        echo -e "${RED}  ⚠️  Pod가 없습니다.${NC}"
        echo ""
        return 1
    fi
    
    local pod_array=($pods)
    echo ""
    for i in "${!pod_array[@]}"; do
        local pod_name="${pod_array[$i]}"
        local status=$($KUBECTL get pod -n "$NAMESPACE" "$pod_name" -o jsonpath='{.status.phase}' 2>/dev/null)
        local app_label=$($KUBECTL get pod -n "$NAMESPACE" "$pod_name" -o jsonpath='{.metadata.labels.app}' 2>/dev/null)
        
        if [ -n "$app_label" ]; then
            echo "  $((i+1))) $pod_name (app: $app_label, status: $status)"
        else
            echo "  $((i+1))) $pod_name (status: $status)"
        fi
    done
    echo ""
    echo -n "Pod 번호 선택 [1-${#pod_array[@]}] (또는 Pod 이름 직접 입력): "
    read -r selection
    
    local pod_name
    if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le "${#pod_array[@]}" ]; then
        pod_name="${pod_array[$((selection-1))]}"
    else
        pod_name="$selection"
    fi
    
    if [ -n "$pod_name" ]; then
        show_logs "$pod_name" true 100
    fi
}

# 직접 Pod 이름 입력
input_pod_name() {
    echo ""
    echo -e "${BLUE}📝 Pod 이름 입력${NC}"
    echo "=========================================="
    echo -n "Pod 이름: "
    read -r pod_name
    
    if [ -z "$pod_name" ]; then
        echo -e "${RED}❌ Pod 이름을 입력해주세요.${NC}"
        echo ""
        return 1
    fi
    
    show_logs "$pod_name" true 100
}

# orderbook-collector 로그 메뉴
show_orderbook_collector_logs_menu() {
    echo ""
    echo "=========================================="
    echo "  orderbook-collector 로그 확인"
    echo "=========================================="
    echo ""
    echo "확인할 옵션을 선택하세요:"
    echo ""
    echo "  1) orderbook-collector (기본)"
    echo "  2) orderbook-collector-master"
    echo "  3) orderbook-collector-slave"
    echo "  0) 취소"
    echo ""
    echo -n "선택 [0-3]: "
    read -r orderbook_choice
    
    case $orderbook_choice in
        1)
            show_service_logs "orderbook-collector"
            ;;
        2)
            show_deployment_logs "orderbook-collector-master"
            ;;
        3)
            show_deployment_logs "orderbook-collector-slave"
            ;;
        0)
            return 0
            ;;
        *)
            echo -e "${RED}❌ 잘못된 선택입니다.${NC}"
            ;;
    esac
}

# ticker-collector 로그 메뉴
show_ticker_collector_logs_menu() {
    echo ""
    echo "=========================================="
    echo "  ticker-collector 로그 확인"
    echo "=========================================="
    echo ""
    echo "확인할 옵션을 선택하세요:"
    echo ""
    echo "  1) ticker-collector (기본)"
    echo "  2) ticker-collector-master"
    echo "  3) ticker-collector-slave"
    echo "  0) 취소"
    echo ""
    echo -n "선택 [0-3]: "
    read -r ticker_choice
    
    case $ticker_choice in
        1)
            show_service_logs "ticker-collector"
            ;;
        2)
            show_deployment_logs "ticker-collector-master"
            ;;
        3)
            show_deployment_logs "ticker-collector-slave"
            ;;
        0)
            return 0
            ;;
        *)
            echo -e "${RED}❌ 잘못된 선택입니다.${NC}"
            ;;
    esac
}

# 이전 컨테이너 로그 확인 메뉴
show_previous_logs_menu() {
    echo ""
    echo -e "${BLUE}📜 이전 컨테이너 로그 확인 (재시작 전 로그)${NC}"
    echo "=========================================="
    echo ""
    echo "이전 로그를 확인할 서비스를 선택하세요:"
    echo ""
    echo "  1) orderbook-collector"
    echo "  2) ticker-collector"
    echo "  3) orderbook-storage-worker"
    echo "  4) ticker-storage-worker"
    echo "  5) index-calculator"
    echo "  6) index-endpoint"
    echo "  7) telegram-log"
    echo "  8) index-calc-fe"
    echo "  9) minio"
    echo " 10) Pod 목록에서 선택"
    echo " 11) Pod 이름 직접 입력"
    echo "  0) 뒤로 가기"
    echo ""
    echo -n "선택 [0-11]: "
    read -r choice
    
    case $choice in
        1)
            echo ""
            echo "orderbook-collector 이전 로그 옵션:"
            echo "  1) orderbook-collector (기본)"
            echo "  2) orderbook-collector-master"
            echo "  3) orderbook-collector-slave"
            echo -n "선택 [1-3]: "
            read -r orderbook_choice
            case $orderbook_choice in
                1)
                    show_service_logs "orderbook-collector" true
                    ;;
                2)
                    show_deployment_logs "orderbook-collector-master" true
                    ;;
                3)
                    show_deployment_logs "orderbook-collector-slave" true
                    ;;
                *)
                    echo -e "${RED}❌ 잘못된 선택입니다.${NC}"
                    ;;
            esac
            ;;
        2)
            echo ""
            echo "ticker-collector 이전 로그 옵션:"
            echo "  1) ticker-collector (기본)"
            echo "  2) ticker-collector-master"
            echo "  3) ticker-collector-slave"
            echo -n "선택 [1-3]: "
            read -r ticker_choice
            case $ticker_choice in
                1)
                    show_service_logs "ticker-collector" true
                    ;;
                2)
                    show_deployment_logs "ticker-collector-master" true
                    ;;
                3)
                    show_deployment_logs "ticker-collector-slave" true
                    ;;
                *)
                    echo -e "${RED}❌ 잘못된 선택입니다.${NC}"
                    ;;
            esac
            ;;
        3)
            show_service_logs "orderbook-storage-worker" true
            ;;
        4)
            show_service_logs "ticker-storage-worker" true
            ;;
        5)
            show_service_logs "index-calculator" true
            ;;
        6)
            show_service_logs "index-endpoint" true
            ;;
        7)
            show_service_logs "telegram-log" true
            ;;
        8)
            show_service_logs "index-calc-fe" true
            ;;
        9)
            show_service_logs "minio" true
            ;;
        10)
            echo ""
            local pods=$(get_all_pods)
            if [ -z "$pods" ]; then
                echo -e "${RED}  ⚠️  Pod가 없습니다.${NC}"
                return 1
            fi
            local pod_array=($pods)
            for i in "${!pod_array[@]}"; do
                echo "  $((i+1))) ${pod_array[$i]}"
            done
            echo ""
            echo -n "Pod 번호 선택 [1-${#pod_array[@]}]: "
            read -r pod_selection
            if [[ "$pod_selection" =~ ^[0-9]+$ ]] && [ "$pod_selection" -ge 1 ] && [ "$pod_selection" -le "${#pod_array[@]}" ]; then
                show_logs "${pod_array[$((pod_selection-1))]}" false 1000 true
            fi
            ;;
        11)
            echo ""
            echo -n "Pod 이름: "
            read -r pod_name
            if [ -n "$pod_name" ]; then
                show_logs "$pod_name" false 1000 true
            fi
            ;;
        0)
            return 0
            ;;
        *)
            echo -e "${RED}❌ 잘못된 선택입니다.${NC}"
            ;;
    esac
}

# 메인 로직
main() {
    # 네임스페이스 존재 확인
    if ! $KUBECTL get namespace "$NAMESPACE" &>/dev/null; then
        echo -e "${RED}❌ 네임스페이스 '$NAMESPACE'가 존재하지 않습니다.${NC}"
        echo "   먼저 배포를 실행하세요: ./deploy.sh"
        exit 1
    fi
    
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1)
                show_orderbook_collector_logs_menu
                echo ""
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            2)
                show_ticker_collector_logs_menu
                echo ""
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            3)
                show_service_logs "orderbook-storage-worker"
                ;;
            4)
                show_service_logs "ticker-storage-worker"
                ;;
            5)
                show_service_logs "index-calculator"
                ;;
            6)
                show_service_logs "index-endpoint"
                ;;
            7)
                show_service_logs "telegram-log"
                ;;
            8)
                show_service_logs "index-calc-fe"
                ;;
            9)
                show_service_logs "minio"
                ;;
            10)
                select_from_pods
                echo ""
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            11)
                input_pod_name
                echo ""
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            12)
                show_previous_logs_menu
                echo ""
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            0)
                echo ""
                echo "종료합니다."
                exit 0
                ;;
            *)
                echo ""
                echo -e "${RED}❌ 잘못된 선택입니다. 0-12 사이의 숫자를 입력하세요.${NC}"
                echo ""
                sleep 1
                ;;
        esac
    done
}

# 스크립트 실행
main

