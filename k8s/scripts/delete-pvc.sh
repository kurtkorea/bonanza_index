#!/bin/bash

# PVC 삭제 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"

echo "🗑️  PVC 삭제 스크립트"
echo "================================"
echo ""

# PVC 목록 확인
echo "📋 현재 PVC 목록:"
echo "--------------------------------"
PVC_LIST=$(kubectl get pvc -n "$NAMESPACE" --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null || echo "")

if [ -z "$PVC_LIST" ]; then
    echo "   ✅ PVC가 없습니다"
    exit 0
fi

# PVC 배열로 변환
PVC_ARRAY=()
while IFS= read -r pvc; do
    if [ ! -z "$pvc" ]; then
        PVC_ARRAY+=("$pvc")
    fi
done <<< "$PVC_LIST"

# PVC 상세 정보 표시
echo ""
for pvc in "${PVC_ARRAY[@]}"; do
    STATUS=$(kubectl get pvc "$pvc" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
    CAPACITY=$(kubectl get pvc "$pvc" -n "$NAMESPACE" -o jsonpath='{.status.capacity.storage}' 2>/dev/null || echo "Unknown")
    echo "   - $pvc (상태: $STATUS, 용량: $CAPACITY)"
done
echo ""

# 사용 중인 Pod 확인
echo "⚠️  주의사항:"
echo "--------------------------------"
echo "   - PVC를 삭제하면 데이터가 영구적으로 삭제됩니다"
echo "   - StatefulSet이나 Pod가 사용 중이면 먼저 삭제해야 할 수 있습니다"
echo "   - 삭제 전에 백업을 권장합니다"
echo ""

# PVC 선택 메뉴
echo "📋 삭제할 PVC 선택:"
echo ""
echo "   0) 전체 PVC 삭제"
echo ""
for i in "${!PVC_ARRAY[@]}"; do
    INDEX=$((i + 1))
    PVC_NAME="${PVC_ARRAY[$i]}"
    STATUS=$(kubectl get pvc "$PVC_NAME" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
    
    if [ "$STATUS" = "Bound" ]; then
        STATUS_ICON="✅"
    else
        STATUS_ICON="⚠️ "
    fi
    
    echo "   ${INDEX}) ${STATUS_ICON} ${PVC_NAME}"
done
echo ""
read -p "선택하세요 (0-${#PVC_ARRAY[@]}, 여러 개 선택 시 쉼표로 구분): " SELECTIONS

# 선택된 PVC 확인
SELECTED_PVCS=()

if [ -z "$SELECTIONS" ]; then
    echo "❌ 선택이 없습니다. 종료합니다."
    exit 1
fi

# 선택 파싱 (쉼표로 구분)
if [ "$SELECTIONS" = "0" ]; then
    SELECTED_PVCS=("${PVC_ARRAY[@]}")
elif [[ "$SELECTIONS" =~ ^[0-9,]+$ ]]; then
    IFS=',' read -ra SELECTED <<< "$SELECTIONS"
    for SEL in "${SELECTED[@]}"; do
        SEL=$(echo "$SEL" | xargs)
        
        if [ "$SEL" = "0" ]; then
            SELECTED_PVCS=("${PVC_ARRAY[@]}")
            break
        elif [[ "$SEL" =~ ^[1-9][0-9]*$ ]] && [ "$SEL" -ge 1 ] && [ "$SEL" -le ${#PVC_ARRAY[@]} ]; then
            INDEX=$((SEL - 1))
            SELECTED_PVCS+=("${PVC_ARRAY[$INDEX]}")
        else
            echo "⚠️  잘못된 선택: $SEL (건너뜀)"
        fi
    done
else
    echo "❌ 잘못된 입력입니다. 숫자 또는 쉼표로 구분된 숫자를 입력하세요."
    exit 1
fi

if [ ${#SELECTED_PVCS[@]} -eq 0 ]; then
    echo "❌ 선택된 PVC가 없습니다. 종료합니다."
    exit 1
fi

echo ""
echo "✅ 선택된 PVC:"
for pvc in "${SELECTED_PVCS[@]}"; do
    echo "   - $pvc"
done
echo ""

# 사용 중인 Pod 확인
echo "🔍 사용 중인 Pod 확인:"
echo "--------------------------------"
PODS_USING_PVC=()
for pvc in "${SELECTED_PVCS[@]}"; do
    # StatefulSet이나 Pod가 이 PVC를 사용하는지 확인
    USERS=$(kubectl get pods -n "$NAMESPACE" -o json 2>/dev/null | \
        jq -r ".items[] | select(.spec.volumes[]?.persistentVolumeClaim?.claimName==\"$pvc\") | .metadata.name" 2>/dev/null || echo "")
    
    if [ ! -z "$USERS" ]; then
        echo "   ⚠️  $pvc를 사용 중인 Pod:"
        echo "$USERS" | while read -r pod; do
            if [ ! -z "$pod" ]; then
                POD_STATUS=$(kubectl get pod "$pod" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
                echo "      - $pod ($POD_STATUS)"
                PODS_USING_PVC+=("$pod")
            fi
        done
    else
        echo "   ✅ $pvc를 사용 중인 Pod 없음"
    fi
done
echo ""

# Pod 삭제 여부 확인
if [ ${#PODS_USING_PVC[@]} -gt 0 ]; then
    echo "⚠️  PVC를 사용 중인 Pod가 있습니다."
    echo ""
    read -p "이 Pod들을 먼저 삭제하시겠습니까? (y/N): " DELETE_PODS
    if [[ "$DELETE_PODS" =~ ^[Yy]$ ]]; then
        echo ""
        echo "🗑️  Pod 삭제 중..."
        for pod in "${PODS_USING_PVC[@]}"; do
            if [ ! -z "$pod" ]; then
                echo "   - $pod 삭제 중..."
                kubectl delete pod "$pod" -n "$NAMESPACE" --ignore-not-found=true
            fi
        done
        echo ""
        echo "⏳ Pod 삭제 완료 대기 중 (5초)..."
        sleep 5
    else
        echo "⚠️  Pod를 삭제하지 않으면 PVC 삭제가 실패할 수 있습니다."
        echo ""
        read -p "그래도 계속하시겠습니까? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            echo "❌ PVC 삭제가 취소되었습니다."
            exit 0
        fi
    fi
fi

# 최종 확인
echo ""
echo "⚠️  최종 확인:"
echo "--------------------------------"
echo "   삭제할 PVC:"
for pvc in "${SELECTED_PVCS[@]}"; do
    echo "   - $pvc"
done
echo ""
echo "   ⚠️  이 작업은 되돌릴 수 없습니다!"
echo "   ⚠️  모든 데이터가 영구적으로 삭제됩니다!"
echo ""
read -p "정말 삭제하시겠습니까? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ PVC 삭제가 취소되었습니다."
    exit 0
fi

# PVC 삭제
echo ""
echo "🗑️  PVC 삭제 중..."
echo "--------------------------------"
for pvc in "${SELECTED_PVCS[@]}"; do
    echo "   - $pvc 삭제 중..."
    if kubectl delete pvc "$pvc" -n "$NAMESPACE" 2>/dev/null; then
        echo "      ✅ 삭제 완료"
    else
        echo "      ⚠️  삭제 실패 (이미 삭제되었거나 사용 중일 수 있음)"
    fi
done
echo ""

# 삭제 확인
echo "⏳ 삭제 완료 대기 중 (3초)..."
sleep 3

echo ""
echo "📋 남아있는 PVC 확인:"
echo "--------------------------------"
REMAINING_PVCS=$(kubectl get pvc -n "$NAMESPACE" --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null || echo "")
if [ -z "$REMAINING_PVCS" ]; then
    echo "   ✅ 모든 PVC가 삭제되었습니다"
else
    echo "   남아있는 PVC:"
    echo "$REMAINING_PVCS" | while read -r pvc; do
        if [ ! -z "$pvc" ]; then
            echo "   - $pvc"
        fi
    done
fi

echo ""
echo "================================"
echo "✅ PVC 삭제 완료"
echo "================================"
echo ""

