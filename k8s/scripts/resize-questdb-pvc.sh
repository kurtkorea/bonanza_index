#!/bin/bash

set -e

echo "📦 QuestDB PVC 크기 확장"
echo "================================"
echo ""

# 현재 크기 확인
CURRENT_SIZE=$(kubectl get pvc questdb-data-questdb-0 -n bonanza-index -o jsonpath='{.spec.resources.requests.storage}' 2>/dev/null || echo "N/A")
echo "현재 PVC 크기: $CURRENT_SIZE"
echo ""

# 새 크기 입력
read -p "새로운 크기를 입력하세요 (예: 200Gi, 500Gi): " NEW_SIZE
echo ""

if [ -z "$NEW_SIZE" ]; then
    echo "❌ 크기가 입력되지 않았습니다."
    exit 1
fi

# 새 크기 유효성 검사 (숫자와 단위 확인)
if ! echo "$NEW_SIZE" | grep -qE '^[0-9]+(Gi|Ti|Mi)$'; then
    echo "❌ 잘못된 형식입니다. 예: 200Gi, 1Ti, 512Mi"
    exit 1
fi

echo "⚠️  PVC 크기를 $CURRENT_SIZE → $NEW_SIZE 로 확장합니다."
read -p "계속하시겠습니까? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 취소되었습니다."
    exit 0
fi

echo ""
echo "📝 PVC 크기 확장 중..."

# PVC 편집
kubectl patch pvc questdb-data-questdb-0 -n bonanza-index -p '{"spec":{"resources":{"requests":{"storage":"'$NEW_SIZE'"}}}}'

echo "⏳ PVC 크기 변경 대기 중..."
sleep 5

# 상태 확인
echo ""
echo "📊 PVC 상태 확인:"
kubectl get pvc questdb-data-questdb-0 -n bonanza-index

# 확장 진행 상태 확인
echo ""
echo "🔍 PVC 상세 정보:"
kubectl describe pvc questdb-data-questdb-0 -n bonanza-index | grep -A 5 "Conditions:"

echo ""
echo "✅ PVC 크기 확장 요청 완료!"
echo ""
echo "💡 참고:"
echo "  - PVC 크기 확장은 StorageClass가 allowVolumeExpansion을 지원해야 합니다."
echo "  - local-path StorageClass는 확장을 지원합니다."
echo "  - 확장이 완료되기까지 시간이 걸릴 수 있습니다."
echo "  - StatefulSet의 volumeClaimTemplates도 업데이트해야"
echo "    향후 새로 생성되는 Pod도 동일한 크기를 사용합니다."

