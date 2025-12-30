#!/bin/bash

# Bonanza Index Kubernetes 배포 상태 확인 스크립트
# 사용법: ./status.sh

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
NC='\033[0m' # No Color

# 메뉴 표시
show_menu() {
    echo ""
    echo "=========================================="
    echo "  Bonanza Index 배포 상태 확인"
    echo "=========================================="
    echo ""
    echo "확인할 항목을 선택하세요:"
    echo ""
    echo "  1) Pod 상태 (Pods)"
    echo "  2) 서비스 상태 (Services)"
    echo "  3) Deployment 상태 (Deployments)"
    echo "  4) 전체 상태 요약 (Summary)"
    echo "  5) 리소스 사용량 (Resource Usage)"
    echo "  6) 이벤트 확인 (Events)"
    echo "  7) 특정 Pod 로그 확인 (Logs)"
    echo "  8) Pod 상세 정보 (Describe Pod)"
    echo "  9) 네임스페이스 전체 상태 (All Resources)"
    echo "  0) 종료"
    echo ""
    echo -n "선택 [0-9]: "
}

# Pod 상태 확인
show_pods() {
    echo ""
    echo -e "${BLUE}📦 Pod 상태${NC}"
    echo "=========================================="
    $KUBECTL get pods -n "$NAMESPACE" -o wide
    echo ""
    
    # Pod 상태 요약
    echo -e "${BLUE}📊 Pod 상태 요약${NC}"
    echo "=========================================="
    pod_status=$($KUBECTL get pods -n "$NAMESPACE" --no-headers 2>/dev/null)
    
    if [ -z "$pod_status" ]; then
        echo "  Pod이 없습니다."
    else
        running=$(echo "$pod_status" | awk '$3 == "Running" {count++} END {print count+0}')
        pending=$(echo "$pod_status" | awk '$3 == "Pending" {count++} END {print count+0}')
        failed=$(echo "$pod_status" | awk '$3 == "Failed" {count++} END {print count+0}')
        crash=$(echo "$pod_status" | awk '$3 == "CrashLoopBackOff" {count++} END {print count+0}')
        completed=$(echo "$pod_status" | awk '$3 == "Completed" {count++} END {print count+0}')
        other=$(echo "$pod_status" | awk '$3 != "Running" && $3 != "Pending" && $3 != "Failed" && $3 != "CrashLoopBackOff" && $3 != "Completed" {count++} END {print count+0}')
        total=$(echo "$pod_status" | wc -l | tr -d ' ')
        
        echo "  총 Pod 수: $total"
        if [ "$running" -gt 0 ]; then
            echo "  ✅ Running: $running"
        fi
        if [ "$pending" -gt 0 ]; then
            echo "  ⏳ Pending: $pending"
        fi
        if [ "$failed" -gt 0 ]; then
            echo "  ❌ Failed: $failed"
        fi
        if [ "$crash" -gt 0 ]; then
            echo "  🔄 CrashLoopBackOff: $crash"
        fi
        if [ "$completed" -gt 0 ]; then
            echo "  ✓ Completed: $completed"
        fi
        if [ "$other" -gt 0 ]; then
            echo "  ⚠️  기타: $other"
        fi
    fi
    echo ""
}

# 서비스 상태 확인
show_services() {
    echo ""
    echo -e "${BLUE}🌐 서비스 상태${NC}"
    echo "=========================================="
    $KUBECTL get svc -n "$NAMESPACE" -o wide
    echo ""
}

# Deployment 상태 확인
show_deployments() {
    echo ""
    echo -e "${BLUE}🚀 Deployment 상태${NC}"
    echo "=========================================="
    $KUBECTL get deployments -n "$NAMESPACE" -o wide
    echo ""
    
    # Deployment 상태 요약
    echo -e "${BLUE}📊 Deployment 상태 요약${NC}"
    echo "=========================================="
    $KUBECTL get deployments -n "$NAMESPACE" --no-headers | awk '{
        desired=$2
        current=$3
        up_to_date=$4
        available=$5
        name=$1
        printf "  %-30s Desired: %s, Current: %s, Up-to-date: %s, Available: %s\n", name, desired, current, up_to_date, available
    }'
    echo ""
}

# 전체 상태 요약
show_summary() {
    echo ""
    echo -e "${BLUE}📋 전체 상태 요약${NC}"
    echo "=========================================="
    
    # Pod 상태
    echo ""
    echo -e "${GREEN}Pod 상태:${NC}"
    pod_status=$($KUBECTL get pods -n "$NAMESPACE" --no-headers 2>/dev/null)
    
    if [ -z "$pod_status" ]; then
        echo "  Pod이 없습니다."
    else
        running=$(echo "$pod_status" | awk '$3 == "Running" {count++} END {print count+0}')
        pending=$(echo "$pod_status" | awk '$3 == "Pending" {count++} END {print count+0}')
        failed=$(echo "$pod_status" | awk '$3 == "Failed" {count++} END {print count+0}')
        crash=$(echo "$pod_status" | awk '$3 == "CrashLoopBackOff" {count++} END {print count+0}')
        completed=$(echo "$pod_status" | awk '$3 == "Completed" {count++} END {print count+0}')
        total=$(echo "$pod_status" | wc -l | tr -d ' ')
        
        echo "  총 Pod: $total (Running: $running, Pending: $pending, Failed: $failed, CrashLoopBackOff: $crash, Completed: $completed)"
    fi
    
    # Service 상태
    echo ""
    echo -e "${GREEN}서비스 상태:${NC}"
    svc_count=$($KUBECTL get svc -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
    echo "  총 Service: $svc_count"
    
    # Deployment 상태
    echo ""
    echo -e "${GREEN}Deployment 상태:${NC}"
    $KUBECTL get deployments -n "$NAMESPACE" --no-headers 2>/dev/null | awk '{
        desired=$2
        current=$3
        name=$1
        if (desired != current) {
            printf "  ⚠️  %s: %d/%d\n", name, current, desired
        } else {
            printf "  ✅ %s: %d/%d\n", name, current, desired
        }
    }'
    
    echo ""
}

# 리소스 사용량 확인
show_resource_usage() {
    echo ""
    echo -e "${BLUE}📊 리소스 사용량${NC}"
    echo "=========================================="
    
    # top 명령어가 사용 가능한지 확인
    if $KUBECTL top nodes &>/dev/null; then
        echo ""
        echo -e "${GREEN}Node 리소스 사용량:${NC}"
        $KUBECTL top nodes 2>/dev/null || echo "  리소스 사용량 정보를 가져올 수 없습니다 (metrics-server 필요)"
        
        echo ""
        echo -e "${GREEN}Pod 리소스 사용량:${NC}"
        $KUBECTL top pods -n "$NAMESPACE" 2>/dev/null || echo "  리소스 사용량 정보를 가져올 수 없습니다 (metrics-server 필요)"
    else
        echo "  ⚠️  metrics-server가 설치되어 있지 않아 리소스 사용량을 확인할 수 없습니다."
        echo ""
        echo "  대신 리소스 요청 및 제한을 확인합니다:"
        echo ""
        $KUBECTL get pods -n "$NAMESPACE" -o custom-columns=NAME:.metadata.name,CPU-REQUEST:.spec.containers[0].resources.requests.cpu,CPU-LIMIT:.spec.containers[0].resources.limits.cpu,MEMORY-REQUEST:.spec.containers[0].resources.requests.memory,MEMORY-LIMIT:.spec.containers[0].resources.limits.memory 2>/dev/null || echo "  리소스 정보를 가져올 수 없습니다"
    fi
    echo ""
}

# 이벤트 확인
show_events() {
    echo ""
    echo -e "${BLUE}📢 최근 이벤트 (최근 20개)${NC}"
    echo "=========================================="
    $KUBECTL get events -n "$NAMESPACE" --sort-by='.lastTimestamp' | tail -20
    echo ""
}

# Pod 로그 확인
show_pod_logs() {
    echo ""
    echo -e "${BLUE}📝 Pod 로그 확인${NC}"
    echo "=========================================="
    
    # Pod 목록 가져오기
    pods=$($KUBECTL get pods -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}')
    
    if [ -z "$pods" ]; then
        echo "  ⚠️  Pod가 없습니다."
        echo ""
        return
    fi
    
    echo "사용 가능한 Pod 목록:"
    echo ""
    pod_array=($pods)
    for i in "${!pod_array[@]}"; do
        echo "  $((i+1))) ${pod_array[$i]}"
    done
    echo ""
    echo -n "Pod 번호 선택 [1-${#pod_array[@]}] (또는 Pod 이름 직접 입력): "
    read -r selection
    
    # 번호로 선택한 경우
    if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le "${#pod_array[@]}" ]; then
        pod_name="${pod_array[$((selection-1))]}"
    else
        pod_name="$selection"
    fi
    
    echo ""
    echo -n "로그 라인 수 (기본: 100): "
    read -r lines
    lines=${lines:-100}
    
    echo ""
    echo -e "${GREEN}Pod: $pod_name 의 로그 (최근 $lines 줄)${NC}"
    echo "=========================================="
    $KUBECTL logs -n "$NAMESPACE" "$pod_name" --tail="$lines" 2>&1 || echo "  ⚠️  로그를 가져올 수 없습니다."
    echo ""
}

# Pod 상세 정보
show_pod_describe() {
    echo ""
    echo -e "${BLUE}🔍 Pod 상세 정보${NC}"
    echo "=========================================="
    
    # Pod 목록 가져오기
    pods=$($KUBECTL get pods -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}')
    
    if [ -z "$pods" ]; then
        echo "  ⚠️  Pod가 없습니다."
        echo ""
        return
    fi
    
    echo "사용 가능한 Pod 목록:"
    echo ""
    pod_array=($pods)
    for i in "${!pod_array[@]}"; do
        echo "  $((i+1))) ${pod_array[$i]}"
    done
    echo ""
    echo -n "Pod 번호 선택 [1-${#pod_array[@]}] (또는 Pod 이름 직접 입력): "
    read -r selection
    
    # 번호로 선택한 경우
    if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le "${#pod_array[@]}" ]; then
        pod_name="${pod_array[$((selection-1))]}"
    else
        pod_name="$selection"
    fi
    
    echo ""
    echo -e "${GREEN}Pod: $pod_name 상세 정보${NC}"
    echo "=========================================="
    $KUBECTL describe pod -n "$NAMESPACE" "$pod_name" 2>&1 || echo "  ⚠️  정보를 가져올 수 없습니다."
    echo ""
}

# 네임스페이스 전체 상태
show_all_resources() {
    echo ""
    echo -e "${BLUE}📋 네임스페이스 전체 리소스${NC}"
    echo "=========================================="
    
    echo ""
    echo -e "${GREEN}Pods:${NC}"
    $KUBECTL get pods -n "$NAMESPACE"
    
    echo ""
    echo -e "${GREEN}Services:${NC}"
    $KUBECTL get svc -n "$NAMESPACE"
    
    echo ""
    echo -e "${GREEN}Deployments:${NC}"
    $KUBECTL get deployments -n "$NAMESPACE"
    
    echo ""
    echo -e "${GREEN}Jobs:${NC}"
    $KUBECTL get jobs -n "$NAMESPACE" 2>/dev/null || echo "  Job이 없습니다."
    
    echo ""
    echo -e "${GREEN}ConfigMaps:${NC}"
    $KUBECTL get configmaps -n "$NAMESPACE" 2>/dev/null || echo "  ConfigMap이 없습니다."
    
    echo ""
    echo -e "${GREEN}Secrets:${NC}"
    $KUBECTL get secrets -n "$NAMESPACE" 2>/dev/null | grep -v "default-token" || echo "  Secret이 없습니다."
    
    echo ""
    echo -e "${GREEN}PersistentVolumeClaims:${NC}"
    $KUBECTL get pvc -n "$NAMESPACE" 2>/dev/null || echo "  PVC가 없습니다."
    
    echo ""
}

# 메인 로직
main() {
    # 네임스페이스 존재 확인
    if ! $KUBECTL get namespace "$NAMESPACE" &>/dev/null; then
        echo "❌ 네임스페이스 '$NAMESPACE'가 존재하지 않습니다."
        echo "   먼저 배포를 실행하세요: ./deploy.sh"
        exit 1
    fi
    
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1)
                show_pods
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            2)
                show_services
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            3)
                show_deployments
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            4)
                show_summary
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            5)
                show_resource_usage
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            6)
                show_events
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            7)
                show_pod_logs
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            8)
                show_pod_describe
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            9)
                show_all_resources
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
                echo "❌ 잘못된 선택입니다. 0-9 사이의 숫자를 입력하세요."
                echo ""
                sleep 1
                ;;
        esac
    done
}

# 스크립트 실행
main

