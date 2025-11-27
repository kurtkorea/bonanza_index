#!/bin/bash

# 루프 디바이스 정리 스크립트
# 파일 기반 ZFS 풀과 연결된 루프 디바이스를 해제합니다.

set -e

POOL_FILE="/var/lib/zfs-pool/zfs-pool.img"

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "루프 디바이스 정리"
echo "=========================================="
echo ""

# 1. 현재 사용 중인 루프 디바이스 확인
echo "1. 사용 중인 루프 디바이스 확인:"
if losetup -a &>/dev/null; then
    echo "사용 중인 루프 디바이스:"
    losetup -a
    echo ""
else
    echo -e "${GREEN}✓ 사용 중인 루프 디바이스 없음${NC}"
    exit 0
fi

# 2. 특정 파일과 연결된 루프 디바이스 찾기
echo "2. ZFS 풀 파일과 연결된 루프 디바이스 확인:"
if [ -f "$POOL_FILE" ]; then
    LOOP_INFO=$(losetup -j "$POOL_FILE" 2>/dev/null)
    if [ -n "$LOOP_INFO" ]; then
        LOOP_DEV=$(echo "$LOOP_INFO" | cut -d: -f1)
        echo -e "${YELLOW}⚠ 루프 디바이스가 연결되어 있습니다:${NC}"
        echo "  파일: $POOL_FILE"
        echo "  루프 디바이스: $LOOP_DEV"
        echo ""
        
        # snap 패키지가 사용 중인지 확인
        if echo "$LOOP_INFO" | grep -q "snapd"; then
            echo -e "${RED}⚠ 경고: 이 루프 디바이스는 snap 패키지가 사용 중입니다!${NC}"
            echo "  snap 패키지가 사용 중인 루프 디바이스는 해제하지 마세요."
            echo "  해제하면 snap 패키지가 작동하지 않을 수 있습니다."
            echo ""
            exit 1
        fi
        
        # ZFS 풀 확인
        POOL_NAME=$(zpool list -H -o name 2>/dev/null | grep -v "^$" | head -1 || echo "")
        if [ -n "$POOL_NAME" ]; then
            echo -e "${RED}⚠ 경고: ZFS 풀 '$POOL_NAME'이 활성 상태입니다.${NC}"
            echo "  루프 디바이스를 해제하기 전에 ZFS 풀을 먼저 제거해야 합니다."
            echo ""
            read -p "ZFS 풀을 제거하고 루프 디바이스를 해제하시겠습니까? (yes/no): " confirm
            if [ "$confirm" = "yes" ]; then
                echo "ZFS 풀 제거 중..."
                sudo zpool destroy "$POOL_NAME" -f
                echo -e "${GREEN}✓ ZFS 풀 제거 완료${NC}"
                
                echo ""
                echo "루프 디바이스 해제 중..."
                sudo losetup -d "$LOOP_DEV"
                echo -e "${GREEN}✓ 루프 디바이스 해제 완료: $LOOP_DEV${NC}"
            else
                echo "작업이 취소되었습니다."
                exit 0
            fi
        else
            echo "ZFS 풀이 없습니다. 루프 디바이스를 안전하게 해제할 수 있습니다."
            echo ""
            read -p "루프 디바이스를 해제하시겠습니까? (yes/no): " confirm
            if [ "$confirm" = "yes" ]; then
                sudo losetup -d "$LOOP_DEV"
                echo -e "${GREEN}✓ 루프 디바이스 해제 완료: $LOOP_DEV${NC}"
            else
                echo "작업이 취소되었습니다."
            fi
        fi
    else
        echo -e "${GREEN}✓ 파일과 연결된 루프 디바이스 없음${NC}"
    fi
else
    echo "풀 파일이 없습니다: $POOL_FILE"
fi

echo ""

# 3. 모든 루프 디바이스 일괄 해제 옵션
echo "3. 모든 루프 디바이스 확인:"
LOOP_COUNT=$(losetup -a 2>/dev/null | wc -l)
if [ "$LOOP_COUNT" -gt 0 ]; then
    echo "총 $LOOP_COUNT 개의 루프 디바이스가 사용 중입니다."
    echo ""
    read -p "모든 루프 디바이스를 확인하시겠습니까? (yes/no): " confirm_all
    if [ "$confirm_all" = "yes" ]; then
        echo ""
        echo "각 루프 디바이스 정보:"
        losetup -a | while read line; do
            LOOP_DEV=$(echo "$line" | cut -d: -f1)
            FILE_PATH=$(echo "$line" | cut -d: -f2 | tr -d '()' | awk '{print $1}')
            echo "  $LOOP_DEV -> $FILE_PATH"
        done
    fi
else
    echo -e "${GREEN}✓ 사용 중인 루프 디바이스 없음${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}정리 작업 완료!${NC}"
echo "=========================================="
echo ""
echo "참고사항:"
echo "  - 루프 디바이스는 '삭제'가 아니라 '해제(detach)'입니다."
echo "  - 해제 후에도 루프 디바이스는 시스템에 남아있지만 사용되지 않습니다."
echo "  - 파일($POOL_FILE)은 별도로 삭제해야 합니다."
echo ""
echo "수동 해제 방법:"
echo "  sudo losetup -d /dev/loopX"
echo ""
echo "모든 루프 디바이스 확인:"
echo "  losetup -a"

