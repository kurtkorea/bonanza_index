#!/bin/bash

# 파일 기반 ZFS 풀 생성 스크립트
# 사용 가능한 루프 디바이스를 자동으로 찾아서 사용

set -e

POOL_NAME="bonanza"
POOL_SIZE="200G"
POOL_DIR="/var/lib/zfs-pool"
POOL_FILE="$POOL_DIR/zfs-pool.img"

echo "=========================================="
echo "파일 기반 ZFS 풀 생성"
echo "=========================================="
echo ""

# 1. 디렉토리 생성
echo "1. 디렉토리 생성 중..."
sudo mkdir -p "$POOL_DIR"
echo "✓ 디렉토리 생성 완료: $POOL_DIR"

# 2. 파일 생성
echo ""
echo "2. 파일 생성 중 ($POOL_SIZE)..."
if [ -f "$POOL_FILE" ]; then
    echo "⚠ 파일이 이미 존재합니다: $POOL_FILE"
    read -p "기존 파일을 삭제하고 새로 생성하시겠습니까? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        sudo rm -f "$POOL_FILE"
        sudo truncate -s "$POOL_SIZE" "$POOL_FILE"
        echo "✓ 파일 생성 완료: $POOL_FILE"
    else
        echo "기존 파일을 사용합니다."
    fi
else
    sudo truncate -s "$POOL_SIZE" "$POOL_FILE"
    echo "✓ 파일 생성 완료: $POOL_FILE"
fi

# 3. 사용 가능한 루프 디바이스 찾기
echo ""
echo "3. 사용 가능한 루프 디바이스 찾는 중..."
LOOP_DEVICE=""

# 주의: loop0~7은 대부분 snap 패키지가 사용 중이므로 loop8부터 확인
# snap 패키지가 사용 중인 루프 디바이스는 해제하지 마세요!

# loop8~15 먼저 확인
for i in {8..15}; do
    if [ ! -e "/dev/loop$i" ]; then
        # 루프 디바이스가 없으면 생성
        sudo mknod /dev/loop$i b 7 $i 2>/dev/null || true
        sudo chown --reference=/dev/loop0 /dev/loop$i 2>/dev/null || true
        sudo chmod --reference=/dev/loop0 /dev/loop$i 2>/dev/null || true
    fi
    if ! losetup -a 2>/dev/null | grep -q "/dev/loop$i"; then
        LOOP_DEVICE="/dev/loop$i"
        echo "✓ 사용 가능한 루프 디바이스 발견: $LOOP_DEVICE"
        break
    fi
done

# loop8~15가 없으면 loop0~7 확인 (snap이 사용하지 않는 경우만)
if [ -z "$LOOP_DEVICE" ]; then
    for i in {0..7}; do
        if ! losetup -a 2>/dev/null | grep -q "/dev/loop$i"; then
            LOOP_DEVICE="/dev/loop$i"
            echo "✓ 사용 가능한 루프 디바이스 발견: $LOOP_DEVICE"
            break
        fi
    done
fi

if [ -z "$LOOP_DEVICE" ]; then
    echo "❌ 사용 가능한 루프 디바이스가 없습니다."
    echo ""
    echo "현재 사용 중인 루프 디바이스:"
    losetup -a 2>/dev/null || echo "없음"
    echo ""
    echo "⚠️  주의: 대부분의 루프 디바이스는 snap 패키지가 사용 중입니다."
    echo "   snap 패키지가 사용 중인 루프 디바이스는 해제하지 마세요!"
    echo ""
    echo "해결 방법:"
    echo "1. 더 많은 루프 디바이스 생성 (loop8~15):"
    echo "   for i in {8..15}; do"
    echo "     sudo mknod /dev/loop\$i b 7 \$i"
    echo "     sudo chown --reference=/dev/loop0 /dev/loop\$i"
    echo "     sudo chmod --reference=/dev/loop0 /dev/loop\$i"
    echo "   done"
    echo ""
    echo "2. 또는 파일을 직접 사용하는 방법을 시도하세요 (아래 참조)"
    exit 1
fi

# 4. 루프 디바이스 설정
echo ""
echo "4. 루프 디바이스 설정 중..."
if sudo losetup "$LOOP_DEVICE" "$POOL_FILE" 2>/dev/null; then
    echo "✓ 루프 디바이스 설정 완료: $LOOP_DEVICE -> $POOL_FILE"
else
    echo "⚠ 루프 디바이스 설정 실패. 파일을 직접 사용하는 방법을 시도합니다..."
    LOOP_DEVICE=""
fi

# 5. ZFS 풀 생성
echo ""
echo "5. ZFS 풀 생성 중..."

# 기존 풀이 있으면 확인
if zpool list "$POOL_NAME" &>/dev/null; then
    echo "⚠ ZFS 풀 '$POOL_NAME'이 이미 존재합니다."
    read -p "기존 풀을 삭제하고 새로 생성하시겠습니까? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        sudo zpool destroy "$POOL_NAME" -f
        echo "✓ 기존 풀 삭제 완료"
    else
        echo "기존 풀을 유지합니다."
        exit 0
    fi
fi

# 루프 디바이스 사용 또는 파일 직접 사용
if [ -n "$LOOP_DEVICE" ]; then
    # 루프 디바이스 사용
    if sudo zpool create "$POOL_NAME" "$LOOP_DEVICE"; then
        echo "✓ ZFS 풀 생성 완료: $POOL_NAME (루프 디바이스: $LOOP_DEVICE)"
    else
        echo "❌ ZFS 풀 생성 실패"
        sudo losetup -d "$LOOP_DEVICE" 2>/dev/null || true
        exit 1
    fi
else
    # 파일 직접 사용 (최신 ZFS 버전)
    echo "파일을 직접 사용하여 풀 생성 시도 중..."
    if sudo zpool create "$POOL_NAME" "$POOL_FILE"; then
        echo "✓ ZFS 풀 생성 완료: $POOL_NAME (파일: $POOL_FILE)"
    else
        echo "❌ ZFS 풀 생성 실패"
        echo ""
        echo "해결 방법:"
        echo "1. 사용 가능한 루프 디바이스를 수동으로 찾아보세요:"
        echo "   losetup -a"
        echo "   sudo losetup -d /dev/loopX  # 사용하지 않는 루프 디바이스 해제"
        echo ""
        echo "2. 또는 다른 루프 디바이스를 사용하세요:"
        echo "   sudo losetup /dev/loop1 $POOL_FILE"
        echo "   sudo zpool create $POOL_NAME /dev/loop1"
        exit 1
    fi
fi

# 6. 풀 확인
echo ""
echo "=========================================="
echo "생성 완료!"
echo "=========================================="
echo ""
echo "풀 정보:"
zpool list "$POOL_NAME"
echo ""
echo "데이터셋 정보:"
zfs list "$POOL_NAME"
echo ""
echo "사용된 루프 디바이스:"
if [ -n "$LOOP_DEVICE" ]; then
    losetup "$LOOP_DEVICE"
else
    echo "파일 직접 사용: $POOL_FILE"
fi

