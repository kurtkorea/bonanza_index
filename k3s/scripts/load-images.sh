#!/bin/bash

# Docker 이미지를 k3s 노드에 로드하는 스크립트
# 사용법: ./load-images.sh [image-file1.tar.gz] [image-file2.tar.gz] ...

# set -e 제거 (에러 발생 시에도 계속 진행)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K3S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$K3S_DIR/.." && pwd)"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

IMAGE_PREFIX="bonanza-index"

# 서비스 목록
declare -a SERVICES=(
    "index-calculator"
    "index-endpoint"
    "orderbook-collector"
    "ticker-collector"
    "orderbook-storage-worker"
    "ticker-storage-worker"
    "telegram-log"
    "index-calc-fe"
)

# 메뉴 표시
show_menu() {
    echo ""
    echo "=========================================="
    echo "  Docker 이미지 로드 (k3s)"
    echo "=========================================="
    echo ""
    echo "이미지를 로드하는 방법을 선택하세요:"
    echo ""
    echo "  1) 현재 디렉토리의 tar.gz 파일 로드"
    echo "  2) tar.gz 파일 경로 지정하여 로드"
    echo "  3) Docker에서 직접 저장 후 로드 (메뉴 선택)"
    echo "  4) Docker에서 모든 이미지 한 번에 로드"
    echo "  5) 로드된 이미지 확인"
    echo "  6) 필요한 모든 이미지 목록 확인"
    echo "  0) 종료"
    echo ""
    echo -n "선택 [0-6]: "
}

# tar.gz 파일에서 이미지 로드
load_from_file() {
    local file=$1
    
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ 파일을 찾을 수 없습니다: $file${NC}"
        return 1
    fi
    
    echo ""
    echo -e "${BLUE}📦 이미지 로드 중: $file${NC}"
    echo "=========================================="
    
    # 파일이 gzip으로 압축되어 있는지 확인
    if [[ "$file" == *.tar.gz ]] || [[ "$file" == *.tgz ]]; then
        # gzip 압축 해제 후 로드
        echo "  압축 해제 및 이미지 로드 중..."
        gunzip -c "$file" | sudo k3s ctr images import - 2>&1 | while IFS= read -r line; do
            echo "    $line"
        done
    elif [[ "$file" == *.tar ]]; then
        # tar 파일 직접 로드
        echo "  이미지 로드 중..."
        sudo k3s ctr images import "$file" 2>&1 | while IFS= read -r line; do
            echo "    $line"
        done
    else
        echo -e "${RED}❌ 지원하지 않는 파일 형식입니다. .tar 또는 .tar.gz 파일을 사용하세요.${NC}"
        return 1
    fi
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo -e "${GREEN}✅ 이미지 로드 완료: $file${NC}"
        return 0
    else
        echo -e "${RED}❌ 이미지 로드 실패: $file${NC}"
        return 1
    fi
}

# 현재 디렉토리의 tar.gz 파일 로드
load_from_current_dir() {
    echo ""
    echo -e "${BLUE}📁 현재 디렉토리: $(pwd)${NC}"
    echo ""
    
    # tar.gz 파일 찾기
    files=($(ls -1 *.tar.gz 2>/dev/null | grep -E "(index-calculator|index-endpoint|orderbook-collector|ticker-collector|orderbook-storage-worker|ticker-storage-worker|telegram-log)" || true))
    
    if [ ${#files[@]} -eq 0 ]; then
        echo -e "${YELLOW}⚠️  현재 디렉토리에 이미지 파일(.tar.gz)이 없습니다.${NC}"
        echo ""
        echo "이미지 파일을 생성하려면:"
        echo "  docker save bonanza-index/<service>:latest | gzip > <service>.tar.gz"
        return 1
    fi
    
    echo "발견된 이미지 파일:"
    for i in "${!files[@]}"; do
        echo "  $((i+1))) ${files[$i]}"
    done
    echo ""
    echo -n "모든 파일을 로드하시겠습니까? (yes/no): "
    read -r confirm
    
    if [ "$confirm" != "yes" ]; then
        echo "취소되었습니다."
        return 1
    fi
    
    echo ""
    local success=0
    local failed=0
    
    for file in "${files[@]}"; do
        if load_from_file "$file"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))
        fi
        echo ""
    done
    
    echo "=========================================="
    echo "📊 로드 결과"
    echo "=========================================="
    echo "✅ 성공: $success"
    echo "❌ 실패: $failed"
    echo ""
}

# 파일 경로 지정하여 로드
load_from_path() {
    echo ""
    echo -n "이미지 파일 경로 입력 (.tar 또는 .tar.gz): "
    read -r filepath
    
    if [ -z "$filepath" ]; then
        echo "취소되었습니다."
        return 1
    fi
    
    # 절대 경로 또는 현재 디렉토리 기준 경로 처리
    if [[ "$filepath" != /* ]]; then
        filepath="$(pwd)/$filepath"
    fi
    
    load_from_file "$filepath"
}

# 단일 이미지 로드 함수
load_single_image() {
    local service=$1
    local img="${IMAGE_PREFIX}/${service}:latest"
    
    # Docker 이미지 존재 확인
    if ! docker image inspect "$img" &>/dev/null; then
        echo -e "${YELLOW}⚠️  $img 건너뜀 (Docker에 없음)${NC}"
        echo ""
        return 1
    fi
    
    echo -e "${BLUE}📦 $img 로드 중...${NC}"
    
    # 이미지 저장 및 로드
    import_output=$(docker save "$img" 2>&1 | sudo k3s ctr images import - 2>&1)
    
    # 출력 내용으로 성공 여부 판단
    if echo "$import_output" | grep -qiE "sha256:[a-f0-9]{64}"; then
        echo -e "${GREEN}✅ $img 로드 완료${NC}"
        return 0
    elif echo "$import_output" | grep -qiE "already exists|is up to date"; then
        echo -e "${YELLOW}⚠️  $img 이미 로드되어 있음${NC}"
        return 0
    elif echo "$import_output" | grep -qiE "unpacking|imported|loaded|saved"; then
        echo -e "${GREEN}✅ $img 로드 완료${NC}"
        return 0
    else
        echo -e "${RED}❌ $img 로드 실패${NC}"
        if [ -n "$import_output" ]; then
            echo "$import_output" | tail -5 | sed 's/^/   /'
        fi
        return 1
    fi
}

# 서비스 선택 메뉴
show_service_menu() {
    echo ""
    echo "=========================================="
    echo "  서비스 선택"
    echo "=========================================="
    echo ""
    echo "로드할 서비스를 선택하세요:"
    echo ""
    for i in "${!SERVICES[@]}"; do
        local service="${SERVICES[$i]}"
        local img="${IMAGE_PREFIX}/${service}:latest"
        local docker_status=""
        
        if docker image inspect "$img" &>/dev/null; then
            docker_status="${GREEN}[Docker]${NC}"
        else
            docker_status="${YELLOW}[없음]${NC}"
        fi
        
        printf "  %d) %-30s %s\n" $((i+1)) "$service" "$docker_status"
    done
    echo ""
    echo "  $(( ${#SERVICES[@]} + 1 ))) 모든 서비스"
    echo "  0) 취소"
    echo ""
    echo -n "선택 [0-$(( ${#SERVICES[@]} + 1 ))]: "
}

# Docker에서 직접 저장 후 로드 (메뉴 선택)
save_and_load_from_docker_menu() {
    show_service_menu
    read -r choice
    
    if [ "$choice" = "0" ]; then
        echo "취소되었습니다."
        return 1
    fi
    
    local selected_services=()
    
    if [ "$choice" = "$(( ${#SERVICES[@]} + 1 ))" ]; then
        # 모든 서비스 선택
        selected_services=("${SERVICES[@]}")
    elif [ "$choice" -ge 1 ] && [ "$choice" -le ${#SERVICES[@]} ]; then
        # 개별 서비스 선택
        selected_services=("${SERVICES[$((choice-1))]}")
    else
        echo -e "${RED}❌ 잘못된 선택입니다.${NC}"
        return 1
    fi
    
    echo ""
    echo "선택된 서비스:"
    for service in "${selected_services[@]}"; do
        echo "  - ${IMAGE_PREFIX}/${service}:latest"
    done
    echo ""
    
    # Docker에서 이미지 존재 확인
    missing_images=()
    for service in "${selected_services[@]}"; do
        local img="${IMAGE_PREFIX}/${service}:latest"
        if ! docker image inspect "$img" &>/dev/null; then
            missing_images+=("$img")
        fi
    done
    
    if [ ${#missing_images[@]} -gt 0 ]; then
        echo -e "${YELLOW}⚠️  다음 이미지가 Docker에 없습니다:${NC}"
        for img in "${missing_images[@]}"; do
            echo "  - $img"
        done
        echo ""
        echo "이미지를 먼저 빌드하세요: ./build-images.sh"
        echo ""
        echo -n "계속하시겠습니까? (yes/no): "
        read -r confirm
        if [ "$confirm" != "yes" ]; then
            return 1
        fi
    fi
    
    echo ""
    local success=0
    local failed=0
    
    for service in "${selected_services[@]}"; do
        if load_single_image "$service"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))
        fi
        echo ""
    done
    
    echo "=========================================="
    echo "📊 로드 결과"
    echo "=========================================="
    echo "✅ 성공: $success"
    echo "❌ 실패: $failed"
    echo ""
}

# Docker에서 모든 이미지 한 번에 로드
save_and_load_all_from_docker() {
    echo ""
    echo "Docker에서 모든 이미지를 저장한 후 k3s에 로드합니다."
    echo ""
    
    # 필요한 이미지 목록
    declare -a images=()
    for service in "${SERVICES[@]}"; do
        images+=("${IMAGE_PREFIX}/${service}:latest")
    done
    
    echo "로드할 이미지 목록:"
    for img in "${images[@]}"; do
        echo "  - $img"
    done
    echo ""
    
    # Docker에서 이미지 존재 확인
    missing_images=()
    for img in "${images[@]}"; do
        if ! docker image inspect "$img" &>/dev/null; then
            missing_images+=("$img")
        fi
    done
    
    if [ ${#missing_images[@]} -gt 0 ]; then
        echo -e "${YELLOW}⚠️  다음 이미지가 Docker에 없습니다:${NC}"
        for img in "${missing_images[@]}"; do
            echo "  - $img"
        done
        echo ""
        echo "이미지를 먼저 빌드하세요: ./build-images.sh"
        echo ""
        echo -n "계속하시겠습니까? (yes/no): "
        read -r confirm
        if [ "$confirm" != "yes" ]; then
            return 1
        fi
    fi
    
    echo ""
    local success=0
    local failed=0
    
    for img in "${images[@]}"; do
        # Docker 이미지 존재 확인
        if ! docker image inspect "$img" &>/dev/null; then
            echo -e "${YELLOW}⚠️  $img 건너뜀 (Docker에 없음)${NC}"
            echo ""
            continue
        fi
        
        echo -e "${BLUE}📦 $img 로드 중...${NC}"
        
        # 이미지 저장 및 로드
        import_output=$(docker save "$img" 2>&1 | sudo k3s ctr images import - 2>&1)
        
        # 출력 내용으로 성공 여부 판단
        if echo "$import_output" | grep -qiE "sha256:[a-f0-9]{64}"; then
            echo -e "${GREEN}✅ $img 로드 완료${NC}"
            success=$((success + 1))
        elif echo "$import_output" | grep -qiE "already exists|is up to date"; then
            echo -e "${YELLOW}⚠️  $img 이미 로드되어 있음${NC}"
            success=$((success + 1))
        elif echo "$import_output" | grep -qiE "unpacking|imported|loaded|saved"; then
            echo -e "${GREEN}✅ $img 로드 완료${NC}"
            success=$((success + 1))
        else
            echo -e "${RED}❌ $img 로드 실패${NC}"
            if [ -n "$import_output" ]; then
                echo "$import_output" | tail -5 | sed 's/^/   /'
            fi
            failed=$((failed + 1))
        fi
        echo ""
    done
    
    echo "=========================================="
    echo "📊 로드 결과"
    echo "=========================================="
    echo "✅ 성공: $success"
    echo "❌ 실패: $failed"
    echo ""
}

# 로드된 이미지 확인
check_loaded_images() {
    echo ""
    echo -e "${BLUE}📋 k3s에 로드된 이미지 목록${NC}"
    echo "=========================================="
    
    images=$(sudo k3s ctr images list 2>/dev/null | grep "$IMAGE_PREFIX" || echo "")
    
    if [ -z "$images" ]; then
        echo -e "${YELLOW}⚠️  로드된 이미지가 없습니다.${NC}"
        echo ""
        echo "이미지를 로드하려면 옵션 1, 2, 또는 3을 사용하세요."
    else
        echo "$images" | while IFS= read -r line; do
            echo "  $line"
        done
    fi
    
    echo ""
}

# 필요한 이미지 목록 확인
show_required_images() {
    echo ""
    echo -e "${BLUE}📋 필요한 이미지 목록${NC}"
    echo "=========================================="
    echo ""
    
    declare -a images=()
    for service in "${SERVICES[@]}"; do
        images+=("${IMAGE_PREFIX}/${service}:latest")
    done
    
    echo "필요한 이미지:"
    for img in "${images[@]}"; do
        # Docker에 있는지 확인 (더 정확한 방법)
        docker_exists=""
        if docker image inspect "$img" &>/dev/null; then
            docker_exists="${GREEN}[Docker]${NC}"
        else
            docker_exists="${YELLOW}[Docker 없음]${NC}"
        fi
        
        # k3s에 있는지 확인
        k3s_exists=""
        if sudo k3s ctr images list 2>/dev/null | grep -q "${img}" 2>/dev/null; then
            k3s_exists="${GREEN}[k3s]${NC}"
        else
            k3s_exists="${RED}[k3s 없음]${NC}"
        fi
        
        printf "  %-50s %s %s\n" "$img" "$docker_exists" "$k3s_exists"
    done
    
    echo ""
    echo "이미지 파일 생성 명령어:"
    echo "  docker save <image-name> | gzip > <image-name>.tar.gz"
    echo ""
}

# 메인 로직
main() {
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1)
                load_from_current_dir
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            2)
                load_from_path
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            3)
                save_and_load_from_docker_menu
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            4)
                save_and_load_all_from_docker
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            5)
                check_loaded_images
                echo "계속하려면 Enter를 누르세요..."
                read -r
                ;;
            6)
                show_required_images
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
                echo "❌ 잘못된 선택입니다. 0-6 사이의 숫자를 입력하세요."
                echo ""
                sleep 1
                ;;
        esac
    done
}

# 스크립트 실행
main

