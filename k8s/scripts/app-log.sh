#!/bin/bash

# 애플리케이션 Pod 로그 보기 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "📝 애플리케이션 Pod Log 접근"
echo "================================"
echo ""

# deploy-worker.sh에서 배포하는 서비스 목록
APP_SERVICES=(
    "index-endpoint"
    "index-calculator"
    "orderbook-collector"
    "ticker-collector"
    "orderbook-storage-worker"
    "ticker-storage-worker"
    "orderbook-aggregator"
    "telegram-log"
    "index-calc-fe"
)

# 서비스 선택 메뉴
echo "📋 서비스 선택:"
echo ""
for i in "${!APP_SERVICES[@]}"; do
    INDEX=$((i + 1))
    echo "   ${INDEX}) ${APP_SERVICES[$i]}"
done
echo ""
read -p "선택하세요 (1-${#APP_SERVICES[@]}): " SERVICE_SELECTION

if [[ ! "$SERVICE_SELECTION" =~ ^[1-9][0-9]*$ ]] || [ "$SERVICE_SELECTION" -lt 1 ] || [ "$SERVICE_SELECTION" -gt "${#APP_SERVICES[@]}" ]; then
    echo "❌ 잘못된 선택입니다"
    exit 1
fi

SERVICE_INDEX=$((SERVICE_SELECTION - 1))
SERVICE="${APP_SERVICES[$SERVICE_INDEX]}"

echo ""
echo "✅ 선택된 서비스: $SERVICE"
echo ""

# Pod 찾기
APP_POD=$(kubectl get pods -n bonanza-index -l app=$SERVICE -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$APP_POD" ]; then
    echo "❌ $SERVICE Pod를 찾을 수 없습니다"
    echo ""
    echo "💡 Pod 상태 확인:"
    kubectl get pods -n bonanza-index -l app=$SERVICE 2>/dev/null || echo "  Pod가 존재하지 않습니다"
    echo ""
    echo "💡 모든 Pod 확인:"
    kubectl get pods -n bonanza-index
    exit 1
fi

# 여러 Pod가 있는 경우 선택
POD_COUNT=$(kubectl get pods -n bonanza-index -l app=$SERVICE --no-headers 2>/dev/null | wc -l)

if [ "$POD_COUNT" -gt 1 ]; then
    echo "⚠️  $SERVICE Pod가 ${POD_COUNT}개 있습니다:"
    kubectl get pods -n bonanza-index -l app=$SERVICE
    echo ""
    read -p "Pod 이름을 입력하세요 (기본값: $APP_POD): " SELECTED_POD
    if [ ! -z "$SELECTED_POD" ]; then
        APP_POD="$SELECTED_POD"
    fi
fi

echo ""
echo "✅ Pod: $APP_POD"
echo ""

# Pod 상태 확인
POD_STATUS=$(kubectl get pod "$APP_POD" -n bonanza-index -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
echo "📊 Pod 상태: $POD_STATUS"
echo ""

# 메뉴 표시
echo "📋 접근 방법 선택:"
echo ""
echo "   1) 실시간 로그 보기 (tail -f)"
echo "   2) 최근 로그 보기 (tail -n)"
echo "   3) 전체 로그 보기"
echo "   4) 이전 컨테이너 로그 보기 (이전 컨테이너가 있는 경우)"
echo "   5) 로그 파일로 저장"
echo "   6) 특정 키워드 필터링"
echo ""
read -p "선택하세요 (1-6): " SELECTION

case $SELECTION in
    1)
        echo ""
        echo "📝 실시간 $SERVICE 로그 보기 (Ctrl+C로 종료)"
        echo "================================"
        kubectl logs -f "$APP_POD" -n bonanza-index 2>&1 || {
            echo ""
            echo "⚠️  로그를 가져올 수 없습니다"
            echo "   Pod 상태를 확인해주세요: kubectl get pod $APP_POD -n bonanza-index"
        }
        ;;
    2)
        echo ""
        read -p "최근 몇 줄을 보시겠습니까? (기본값: 100): " LINES
        LINES=${LINES:-100}
        echo ""
        echo "📝 최근 ${LINES}줄 보기"
        echo "================================"
        kubectl logs "$APP_POD" -n bonanza-index --tail="$LINES" 2>&1 || {
            echo ""
            echo "⚠️  로그를 가져올 수 없습니다"
        }
        ;;
    3)
        echo ""
        echo "📝 전체 $SERVICE 로그 보기"
        echo "================================"
        echo "⚠️  로그가 많을 수 있습니다..."
        kubectl logs "$APP_POD" -n bonanza-index 2>&1 || {
            echo ""
            echo "⚠️  로그를 가져올 수 없습니다"
        }
        ;;
    4)
        echo ""
        echo "📝 이전 컨테이너 로그 보기"
        echo "================================"
        read -p "최근 몇 줄을 보시겠습니까? (기본값: 100): " LINES
        LINES=${LINES:-100}
        echo ""
        kubectl logs "$APP_POD" -n bonanza-index --previous --tail="$LINES" 2>&1 || {
            echo ""
            echo "⚠️  이전 컨테이너 로그가 없거나 접근할 수 없습니다"
        }
        ;;
    5)
        echo ""
        OUTPUT_FILE="${SERVICE}-log-$(date +%Y%m%d-%H%M%S).log"
        read -p "최근 몇 줄을 저장하시겠습니까? (기본값: 전체, Enter는 전체): " LINES
        echo ""
        echo "📥 $SERVICE 로그를 로컬로 저장 중..."
        echo "   대상 파일: $OUTPUT_FILE"
        echo ""
        
        if [ -z "$LINES" ]; then
            kubectl logs "$APP_POD" -n bonanza-index > "$OUTPUT_FILE" 2>&1
        else
            kubectl logs "$APP_POD" -n bonanza-index --tail="$LINES" > "$OUTPUT_FILE" 2>&1
        fi
        
        if [ -f "$OUTPUT_FILE" ] && [ -s "$OUTPUT_FILE" ]; then
            FILE_SIZE=$(wc -l < "$OUTPUT_FILE" 2>/dev/null || echo "0")
            echo "✅ 파일 저장 완료: $OUTPUT_FILE (${FILE_SIZE}줄)"
            echo ""
            echo "📝 파일 내용 미리보기 (최근 20줄):"
            tail -n 20 "$OUTPUT_FILE" 2>/dev/null || echo "파일이 비어있습니다"
        else
            echo "❌ 파일 저장 실패 또는 로그가 없습니다"
        fi
        ;;
    6)
        echo ""
        read -p "필터링할 키워드를 입력하세요 (예: ERROR, WARN, exception, failed): " FILTER
        if [ -z "$FILTER" ]; then
            echo "❌ 키워드를 입력해주세요"
            exit 1
        fi
        echo ""
        read -p "최근 몇 줄에서 검색하시겠습니까? (기본값: 1000): " LINES
        LINES=${LINES:-1000}
        echo ""
        echo "📝 필터링된 로그 보기 (키워드: '$FILTER', 최근 ${LINES}줄에서 검색)"
        echo "================================"
        kubectl logs "$APP_POD" -n bonanza-index --tail="$LINES" 2>&1 | grep -i "$FILTER" || {
            echo ""
            echo "⚠️  해당 키워드가 포함된 로그를 찾을 수 없습니다"
        }
        ;;
    *)
        echo "❌ 잘못된 선택입니다"
        exit 1
        ;;
esac

echo ""
echo ""
echo "💡 추가 정보:"
echo "  - Pod 상태: kubectl get pod $APP_POD -n bonanza-index"
echo "  - Pod 상세: kubectl describe pod $APP_POD -n bonanza-index"
echo "  - 모든 $SERVICE Pod: kubectl get pods -n bonanza-index -l app=$SERVICE"
echo "  - Deployment: kubectl get deployment $SERVICE -n bonanza-index"
echo ""

