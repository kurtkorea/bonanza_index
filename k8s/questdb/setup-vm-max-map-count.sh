#!/bin/bash

# QuestDB를 위한 vm.max_map_count 설정 스크립트
# 이 스크립트는 호스트 노드에서 실행해야 합니다.

set -e

RECOMMENDED_VALUE=1048576
CURRENT_VALUE=$(sysctl -n vm.max_map_count)

echo "현재 vm.max_map_count 값: $CURRENT_VALUE"
echo "권장 값: $RECOMMENDED_VALUE"

if [ "$CURRENT_VALUE" -ge "$RECOMMENDED_VALUE" ]; then
    echo "✅ 현재 값이 이미 권장 값 이상입니다."
    exit 0
fi

echo ""
echo "값을 $RECOMMENDED_VALUE 로 설정합니다..."

# 임시 설정 (즉시 적용)
sudo sysctl -w vm.max_map_count=$RECOMMENDED_VALUE

# 영구 설정
if [ -d /etc/sysctl.d ]; then
    # /etc/sysctl.d/ 디렉토리가 있는 경우 (Ubuntu, Debian, CentOS 등)
    echo "vm.max_map_count=$RECOMMENDED_VALUE" | sudo tee /etc/sysctl.d/99-questdb.conf
    echo "✅ /etc/sysctl.d/99-questdb.conf 파일에 설정 추가됨"
elif [ -f /etc/sysctl.conf ]; then
    # /etc/sysctl.conf 파일 사용
    if ! grep -q "vm.max_map_count" /etc/sysctl.conf; then
        echo "vm.max_map_count=$RECOMMENDED_VALUE" | sudo tee -a /etc/sysctl.conf
        echo "✅ /etc/sysctl.conf 파일에 설정 추가됨"
    else
        sudo sed -i "s/^vm.max_map_count=.*/vm.max_map_count=$RECOMMENDED_VALUE/" /etc/sysctl.conf
        echo "✅ /etc/sysctl.conf 파일의 설정 업데이트됨"
    fi
else
    echo "⚠️  sysctl 설정 파일을 찾을 수 없습니다."
    echo "수동으로 설정을 추가해주세요."
    exit 1
fi

# 설정 확인
NEW_VALUE=$(sysctl -n vm.max_map_count)
echo ""
echo "설정 완료!"
echo "현재 vm.max_map_count 값: $NEW_VALUE"

if [ "$NEW_VALUE" -ge "$RECOMMENDED_VALUE" ]; then
    echo "✅ 성공적으로 설정되었습니다."
else
    echo "❌ 설정에 실패했습니다. 수동으로 확인해주세요."
    exit 1
fi

