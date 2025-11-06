#!/bin/bash

# Redis 로그 보기 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

echo "📝 Redis Log 접근"
echo "================================"
echo ""

# Redis Pod 찾기
REDIS_POD=$(kubectl get pods -n bonanza-index -l app=redis -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$REDIS_POD" ]; then
    echo "❌ Redis Pod를 찾을 수 없습니다"
    echo ""
    echo "💡 Redis Pod 상태 확인:"
    kubectl get pods -n bonanza-index -l app=redis 2>/dev/null || echo "  Pod가 존재하지 않습니다"
    echo ""
    echo "💡 Redis 배포 확인:"
    kubectl get deployment -n bonanza-index redis 2>/dev/null || echo "  Deployment가 존재하지 않습니다"
    exit 1
fi

echo "✅ Redis Pod: $REDIS_POD"
echo ""

# Pod 상태 확인
POD_STATUS=$(kubectl get pod "$REDIS_POD" -n bonanza-index -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
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
echo "   7) Redis 명령어 실행 (redis-cli)"
echo ""
read -p "선택하세요 (1-7): " SELECTION

case $SELECTION in
    1)
        echo ""
        echo "📝 실시간 Redis 로그 보기 (Ctrl+C로 종료)"
        echo "================================"
        kubectl logs -f "$REDIS_POD" -n bonanza-index 2>&1 || {
            echo ""
            echo "⚠️  로그를 가져올 수 없습니다"
            echo "   Pod 상태를 확인해주세요: kubectl get pod $REDIS_POD -n bonanza-index"
        }
        ;;
    2)
        echo ""
        read -p "최근 몇 줄을 보시겠습니까? (기본값: 100): " LINES
        LINES=${LINES:-100}
        echo ""
        echo "📝 최근 ${LINES}줄 보기"
        echo "================================"
        kubectl logs "$REDIS_POD" -n bonanza-index --tail="$LINES" 2>&1 || {
            echo ""
            echo "⚠️  로그를 가져올 수 없습니다"
        }
        ;;
    3)
        echo ""
        echo "📝 전체 Redis 로그 보기"
        echo "================================"
        echo "⚠️  로그가 많을 수 있습니다..."
        kubectl logs "$REDIS_POD" -n bonanza-index 2>&1 || {
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
        kubectl logs "$REDIS_POD" -n bonanza-index --previous --tail="$LINES" 2>&1 || {
            echo ""
            echo "⚠️  이전 컨테이너 로그가 없거나 접근할 수 없습니다"
        }
        ;;
    5)
        echo ""
        OUTPUT_FILE="redis-log-$(date +%Y%m%d-%H%M%S).log"
        read -p "최근 몇 줄을 저장하시겠습니까? (기본값: 전체, Enter는 전체): " LINES
        echo ""
        echo "📥 Redis 로그를 로컬로 저장 중..."
        echo "   대상 파일: $OUTPUT_FILE"
        echo ""
        
        if [ -z "$LINES" ]; then
            kubectl logs "$REDIS_POD" -n bonanza-index > "$OUTPUT_FILE" 2>&1
        else
            kubectl logs "$REDIS_POD" -n bonanza-index --tail="$LINES" > "$OUTPUT_FILE" 2>&1
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
        kubectl logs "$REDIS_POD" -n bonanza-index --tail="$LINES" 2>&1 | grep -i "$FILTER" || {
            echo ""
            echo "⚠️  해당 키워드가 포함된 로그를 찾을 수 없습니다"
        }
        ;;
    7)
        echo ""
        echo "📝 Redis 명령어 실행 (redis-cli)"
        echo "================================"
        echo ""
        echo "📋 Redis 명령어 옵션:"
        echo ""
        echo "   1) INFO (서버 정보)"
        echo "   2) PING (연결 테스트)"
        echo "   3) DBSIZE (키 개수)"
        echo "   4) CLIENT LIST (클라이언트 목록)"
        echo "   5) MONITOR (실시간 명령 모니터링)"
        echo "   6) CONFIG GET (설정 조회)"
        echo "   7) 커스텀 명령어 입력"
        echo ""
        read -p "선택하세요 (1-7): " REDIS_CMD
        
        case $REDIS_CMD in
            1)
                echo ""
                echo "📊 Redis 서버 정보:"
                echo "================================"
                kubectl exec "$REDIS_POD" -n bonanza-index -- redis-cli INFO 2>&1 || {
                    echo ""
                    echo "⚠️  Redis 명령 실행 실패"
                }
                ;;
            2)
                echo ""
                echo "🏓 Redis PING 테스트:"
                echo "================================"
                kubectl exec "$REDIS_POD" -n bonanza-index -- redis-cli PING 2>&1 || {
                    echo ""
                    echo "⚠️  Redis 연결 실패"
                }
                ;;
            3)
                echo ""
                echo "📊 Redis 데이터베이스 크기:"
                echo "================================"
                kubectl exec "$REDIS_POD" -n bonanza-index -- redis-cli DBSIZE 2>&1 || {
                    echo ""
                    echo "⚠️  Redis 명령 실행 실패"
                }
                ;;
            4)
                echo ""
                echo "📋 Redis 클라이언트 목록:"
                echo "================================"
                kubectl exec "$REDIS_POD" -n bonanza-index -- redis-cli CLIENT LIST 2>&1 || {
                    echo ""
                    echo "⚠️  Redis 명령 실행 실패"
                }
                ;;
            5)
                echo ""
                echo "📺 Redis 실시간 모니터링 (Ctrl+C로 종료):"
                echo "================================"
                kubectl exec "$REDIS_POD" -n bonanza-index -- redis-cli MONITOR 2>&1 || {
                    echo ""
                    echo "⚠️  Redis 모니터링 실패"
                }
                ;;
            6)
                echo ""
                read -p "조회할 설정 키를 입력하세요 (예: maxmemory, appendonly): " CONFIG_KEY
                if [ -z "$CONFIG_KEY" ]; then
                    echo "❌ 설정 키를 입력해주세요"
                    exit 1
                fi
                echo ""
                echo "📋 Redis 설정 조회: $CONFIG_KEY"
                echo "================================"
                kubectl exec "$REDIS_POD" -n bonanza-index -- redis-cli CONFIG GET "$CONFIG_KEY" 2>&1 || {
                    echo ""
                    echo "⚠️  Redis 명령 실행 실패"
                }
                ;;
            7)
                echo ""
                read -p "실행할 Redis 명령어를 입력하세요 (예: KEYS *, GET key): " CUSTOM_CMD
                if [ -z "$CUSTOM_CMD" ]; then
                    echo "❌ 명령어를 입력해주세요"
                    exit 1
                fi
                echo ""
                echo "📝 커스텀 Redis 명령 실행: $CUSTOM_CMD"
                echo "================================"
                kubectl exec "$REDIS_POD" -n bonanza-index -- redis-cli $CUSTOM_CMD 2>&1 || {
                    echo ""
                    echo "⚠️  Redis 명령 실행 실패"
                }
                ;;
            *)
                echo "❌ 잘못된 선택입니다"
                exit 1
                ;;
        esac
        ;;
    *)
        echo "❌ 잘못된 선택입니다"
        exit 1
        ;;
esac

echo ""
echo ""
echo "💡 추가 정보:"
echo "  - Redis Pod 상태: kubectl get pod $REDIS_POD -n bonanza-index"
echo "  - Redis Pod 상세: kubectl describe pod $REDIS_POD -n bonanza-index"
echo "  - Redis Deployment: kubectl get deployment redis -n bonanza-index"
echo "  - Redis 서비스: kubectl get svc redis-service -n bonanza-index"
echo "  - Redis CLI 직접 접속: kubectl exec -it $REDIS_POD -n bonanza-index -- redis-cli"
echo ""


