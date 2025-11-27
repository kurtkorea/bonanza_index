#!/bin/bash

# 호스트 파일 시스템 정리 스크립트
# ZFS 풀, 루프 디바이스, 파일 기반 풀 파일을 정리합니다.

set -e

POOL_NAME="bonanza"
POOL_DIR="/var/lib/zfs-pool"
POOL_FILE="$POOL_DIR/zfs-pool.img"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "호스트 파일 시스템 정리"
echo "=========================================="
echo ""

# 1. ZFS 풀 확인
echo "1. ZFS 풀 확인:"
if zpool list "$POOL_NAME" &>/dev/null; then
    echo -e "${YELLOW}⚠ ZFS 풀 '$POOL_NAME'이 존재합니다.${NC}"
    zpool list "$POOL_NAME"
    echo ""
    read -p "ZFS 풀을 제거하시겠습니까? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        echo "ZFS 풀 제거 중..."
        sudo zpool destroy "$POOL_NAME" -f
        echo -e "${GREEN}✓ ZFS 풀 제거 완료${NC}"
    else
        echo "ZFS 풀을 유지합니다."
    fi
else
    echo -e "${GREEN}✓ ZFS 풀 '$POOL_NAME' 없음${NC}"
fi
echo ""

# 2. 루프 디바이스 확인 및 해제
echo "2. 루프 디바이스 확인:"
if [ -f "$POOL_FILE" ]; then
    LOOP_DEV=$(losetup -j "$POOL_FILE" 2>/dev/null | cut -d: -f1)
    if [ -n "$LOOP_DEV" ]; then
        echo -e "${YELLOW}⚠ 루프 디바이스가 연결되어 있습니다: $LOOP_DEV${NC}"
        losetup "$LOOP_DEV"
        echo ""
        read -p "루프 디바이스를 해제하시겠습니까? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            sudo losetup -d "$LOOP_DEV"
            echo -e "${GREEN}✓ 루프 디바이스 해제 완료${NC}"
        fi
    else
        echo -e "${GREEN}✓ 루프 디바이스 연결 없음${NC}"
    fi
else
    echo -e "${GREEN}✓ 풀 파일 없음${NC}"
fi
echo ""

# 3. 파일 기반 풀 파일 삭제
echo "3. 파일 기반 풀 파일 확인:"
if [ -f "$POOL_FILE" ]; then
    echo -e "${YELLOW}⚠ 파일이 존재합니다: $POOL_FILE${NC}"
    ls -lh "$POOL_FILE"
    echo ""
    read -p "파일을 삭제하시겠습니까? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        sudo rm -f "$POOL_FILE"
        echo -e "${GREEN}✓ 파일 삭제 완료${NC}"
        
        # 디렉토리가 비어있으면 삭제
        if [ -d "$POOL_DIR" ] && [ -z "$(ls -A "$POOL_DIR" 2>/dev/null)" ]; then
            read -p "빈 디렉토리($POOL_DIR)도 삭제하시겠습니까? (yes/no): " confirm_dir
            if [ "$confirm_dir" = "yes" ]; then
                sudo rmdir "$POOL_DIR"
                echo -e "${GREEN}✓ 디렉토리 삭제 완료${NC}"
            fi
        fi
    else
        echo "파일을 유지합니다."
    fi
else
    echo -e "${GREEN}✓ 파일 없음${NC}"
fi
echo ""

# 4. 모든 루프 디바이스 확인
echo "4. 모든 루프 디바이스 확인:"
if losetup -a &>/dev/null; then
    echo "사용 중인 루프 디바이스:"
    losetup -a
else
    echo -e "${GREEN}✓ 사용 중인 루프 디바이스 없음${NC}"
fi
echo ""

echo "=========================================="
echo -e "${GREEN}정리 작업 완료!${NC}"
echo "=========================================="
echo ""
echo "남은 리소스 확인:"
echo "  - ZFS 풀: zpool list"
echo "  - 루프 디바이스: losetup -a"
echo "  - 풀 파일: ls -lh $POOL_FILE"

