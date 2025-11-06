#!/bin/bash

# nginx 로그 접근 스크립트 (access.log, error.log)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "📝 Nginx Log 접근"
echo "================================"
echo ""

# nginx Pod 찾기
NGINX_POD=$(kubectl get pods -n bonanza-index -l app=nginx -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$NGINX_POD" ]; then
    echo "❌ nginx Pod를 찾을 수 없습니다"
    exit 1
fi

echo "✅ Nginx Pod: $NGINX_POD"
echo ""

# 로그 파일 선택 메뉴
echo "📋 로그 파일 선택:"
echo ""
echo "   1) access.log"
echo "   2) error.log"
echo ""
read -p "선택하세요 (1-2): " LOG_TYPE

case $LOG_TYPE in
    1)
        LOG_FILE="access.log"
        LOG_NAME="Access"
        ;;
    2)
        LOG_FILE="error.log"
        LOG_NAME="Error"
        ;;
    *)
        echo "❌ 잘못된 선택입니다"
        exit 1
        ;;
esac

echo ""
echo "📋 ${LOG_NAME} Log 접근 방법 선택:"
echo ""
echo "   1) 실시간 로그 보기 (tail -f)"
echo "   2) 최근 로그 보기 (tail -n)"
echo "   3) 전체 로그 보기 (cat)"
echo "   4) 로컬로 파일 복사 (kubectl cp)"
if [ "$LOG_TYPE" = "1" ]; then
    echo "   5) 특정 IP/경로 필터링"
else
    echo "   5) 특정 키워드 필터링 (ERROR, WARN 등)"
fi
echo ""
read -p "선택하세요 (1-5): " SELECTION

case $SELECTION in
    1)
        echo ""
        echo "📝 실시간 ${LOG_FILE} 보기 (Ctrl+C로 종료)"
        echo "================================"
        kubectl exec "$NGINX_POD" -n bonanza-index -- tail -f /var/log/nginx/${LOG_FILE} 2>&1 || {
            echo ""
            echo "⚠️  ${LOG_FILE} 파일이 없거나 접근할 수 없습니다"
        }
        ;;
    2)
        echo ""
        read -p "최근 몇 줄을 보시겠습니까? (기본값: 50): " LINES
        LINES=${LINES:-50}
        echo ""
        echo "📝 최근 ${LINES}줄 보기"
        echo "================================"
        kubectl exec "$NGINX_POD" -n bonanza-index -- tail -n "$LINES" /var/log/nginx/${LOG_FILE} 2>&1 || {
            echo ""
            echo "⚠️  ${LOG_FILE} 파일이 없거나 접근할 수 없습니다"
        }
        ;;
    3)
        echo ""
        echo "📝 전체 ${LOG_FILE} 보기"
        echo "================================"
        kubectl exec "$NGINX_POD" -n bonanza-index -- cat /var/log/nginx/${LOG_FILE} 2>&1 || {
            echo ""
            echo "⚠️  ${LOG_FILE} 파일이 없거나 접근할 수 없습니다"
        }
        ;;
    4)
        echo ""
        OUTPUT_FILE="nginx-${LOG_FILE%.log}-$(date +%Y%m%d-%H%M%S).log"
        echo "📥 ${LOG_FILE}를 로컬로 복사 중..."
        echo "   대상 파일: $OUTPUT_FILE"
        echo ""
        
        if kubectl cp "$NGINX_POD:/var/log/nginx/${LOG_FILE}" "$OUTPUT_FILE" -n bonanza-index 2>/dev/null; then
            echo "✅ 파일 복사 완료: $OUTPUT_FILE"
            echo ""
            echo "📝 파일 내용 미리보기 (최근 20줄):"
            tail -n 20 "$OUTPUT_FILE" 2>/dev/null || echo "파일이 비어있습니다"
        else
            echo "❌ 파일 복사 실패"
        fi
        ;;
    5)
        echo ""
        if [ "$LOG_TYPE" = "1" ]; then
            read -p "필터링할 IP 주소 또는 경로를 입력하세요: " FILTER
        else
            read -p "필터링할 키워드를 입력하세요 (예: ERROR, WARN, crit): " FILTER
        fi
        if [ -z "$FILTER" ]; then
            echo "❌ 필터를 입력해주세요"
            exit 1
        fi
        echo ""
        read -p "최근 몇 줄에서 검색하시겠습니까? (기본값: 100): " LINES
        LINES=${LINES:-100}
        echo ""
        echo "📝 필터링된 로그 보기 (키워드: '$FILTER', 최근 ${LINES}줄에서 검색)"
        echo "================================"
        kubectl exec "$NGINX_POD" -n bonanza-index -- tail -n "$LINES" /var/log/nginx/${LOG_FILE} 2>&1 | grep -i "$FILTER" || {
            echo ""
            echo "⚠️  결과가 없거나 파일에 접근할 수 없습니다"
        }
        ;;
    *)
        echo "❌ 잘못된 선택입니다"
        exit 1
        ;;
esac

echo ""



