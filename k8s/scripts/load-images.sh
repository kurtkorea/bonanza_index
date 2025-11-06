#!/bin/bash

# 워커 노드에서 실행할 이미지 로드 스크립트
# /tmp 디렉토리의 tar.gz 이미지 파일들을 containerd에 로드

set -e

echo "📦 이미지 로드 스크립트"
echo "================================"
echo ""

# /tmp 디렉토리에서 tar.gz 파일 찾기
IMAGE_FILES=$(ls /tmp/*.tar.gz 2>/dev/null || echo "")

if [ -z "$IMAGE_FILES" ]; then
    echo "❌ /tmp 디렉토리에 tar.gz 이미지 파일이 없습니다"
    exit 1
fi

echo "📋 발견된 이미지 파일:"
for FILE in $IMAGE_FILES; do
    FILENAME=$(basename "$FILE")
    echo "   - $FILENAME"
done
echo ""

# containerd socket 확인
CONTAINERD_SOCKET=""
if [ -f "/run/k3s/containerd/containerd.sock" ]; then
    CONTAINERD_SOCKET="/run/k3s/containerd/containerd.sock"
elif [ -f "/run/containerd/containerd.sock" ]; then
    CONTAINERD_SOCKET="/run/containerd/containerd.sock"
else
    echo "❌ containerd socket을 찾을 수 없습니다"
    echo "   찾은 위치:"
    find /run /var/run -name "containerd.sock" 2>/dev/null || echo "   없음"
    exit 1
fi

echo "✅ containerd socket: $CONTAINERD_SOCKET"
echo ""

# 각 이미지 파일 로드
SUCCESS=0
FAILED=0

for FILE in $IMAGE_FILES; do
    FILENAME=$(basename "$FILE")
    SERVICE_NAME=$(echo "$FILENAME" | sed 's/.tar.gz$//')
    
    echo "📥 ${FILENAME} 로드 중..."
    
    if sudo ctr --address "$CONTAINERD_SOCKET" -n k8s.io images import "$FILE" 2>&1; then
        echo "   ✅ ${SERVICE_NAME} 로드 완료"
        SUCCESS=$((SUCCESS + 1))
        
        # 이미지 확인
        IMAGE_NAME=$(sudo ctr --address "$CONTAINERD_SOCKET" -n k8s.io images list 2>/dev/null | grep "$SERVICE_NAME" | head -1 || echo "")
        if [ ! -z "$IMAGE_NAME" ]; then
            echo "      이미지: $IMAGE_NAME"
        fi
    else
        echo "   ❌ ${SERVICE_NAME} 로드 실패"
        FAILED=$((FAILED + 1))
    fi
    echo ""
done

echo "================================"
echo "📊 결과 요약"
echo "================================"
echo "   ✅ 성공: $SUCCESS"
echo "   ❌ 실패: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "✅ 모든 이미지 로드 완료"
    echo ""
    echo "💡 로드된 이미지 확인:"
    echo "   sudo ctr --address $CONTAINERD_SOCKET -n k8s.io images list | grep bonanza-index"
else
    echo "⚠️  일부 이미지 로드 실패"
    echo ""
    echo "💡 수동으로 로드:"
    echo "   sudo ctr --address $CONTAINERD_SOCKET -n k8s.io images import /tmp/<image-name>.tar.gz"
fi

echo ""

