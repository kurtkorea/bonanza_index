#!/bin/bash

# orderbook-collector 재시작 스크립트
# Active-Active 이중화 모드에서 primary와 secondary를 각각 재시작할 수 있습니다

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$K8S_DIR"

NAMESPACE="bonanza-index"

echo "🔄 orderbook-collector 재시작 스크립트"
echo "================================"
echo ""

# 현재 배포 모드 확인
PRIMARY_EXISTS=$(kubectl get deployment orderbook-collector-primary -n "$NAMESPACE" -o name 2>/dev/null || echo "")
SECONDARY_EXISTS=$(kubectl get deployment orderbook-collector-secondary -n "$NAMESPACE" -o name 2>/dev/null || echo "")
INSTANCE_1_EXISTS=$(kubectl get deployment orderbook-collector-1 -n "$NAMESPACE" -o name 2>/dev/null || echo "")
INSTANCE_2_EXISTS=$(kubectl get deployment orderbook-collector-2 -n "$NAMESPACE" -o name 2>/dev/null || echo "")
SINGLE_EXISTS=$(kubectl get deployment orderbook-collector -n "$NAMESPACE" -o name 2>/dev/null || echo "")

# 배포 모드 결정
DEPLOYMENT_MODE="unknown"
if [ -n "$PRIMARY_EXISTS" ] && [ -n "$SECONDARY_EXISTS" ]; then
    DEPLOYMENT_MODE="active-active"
elif [ -n "$INSTANCE_1_EXISTS" ] && [ -n "$INSTANCE_2_EXISTS" ]; then
    DEPLOYMENT_MODE="multi-instance"
elif [ -n "$SINGLE_EXISTS" ]; then
    DEPLOYMENT_MODE="single"
fi

echo "📊 현재 배포 모드: $DEPLOYMENT_MODE"
echo ""

# 재시작 옵션 메뉴
if [ "$DEPLOYMENT_MODE" = "active-active" ]; then
    echo "재시작할 인스턴스 선택:"
    echo "  1) Primary만 재시작"
    echo "  2) Secondary만 재시작"
    echo "  3) Primary와 Secondary 모두 재시작"
    echo "  0) 취소"
    echo ""
    read -p "선택하세요 (0-3): " SELECTION
    
    case "$SELECTION" in
        1)
            echo ""
            echo "🔄 Primary 인스턴스 재시작 중..."
            kubectl rollout restart deployment orderbook-collector-primary -n "$NAMESPACE"
            echo "✅ Primary 재시작 명령 완료"
            echo ""
            echo "⏳ 재시작 상태 확인 중..."
            kubectl rollout status deployment orderbook-collector-primary -n "$NAMESPACE" --timeout=120s
            echo ""
            echo "📊 Primary Pod 상태:"
            kubectl get pods -n "$NAMESPACE" -l app=orderbook-collector,role=primary
            ;;
        2)
            echo ""
            echo "🔄 Secondary 인스턴스 재시작 중..."
            kubectl rollout restart deployment orderbook-collector-secondary -n "$NAMESPACE"
            echo "✅ Secondary 재시작 명령 완료"
            echo ""
            echo "⏳ 재시작 상태 확인 중..."
            kubectl rollout status deployment orderbook-collector-secondary -n "$NAMESPACE" --timeout=120s
            echo ""
            echo "📊 Secondary Pod 상태:"
            kubectl get pods -n "$NAMESPACE" -l app=orderbook-collector,role=secondary
            ;;
        3)
            echo ""
            echo "🔄 Primary와 Secondary 모두 재시작 중..."
            echo ""
            echo "1️⃣  Primary 재시작 중..."
            kubectl rollout restart deployment orderbook-collector-primary -n "$NAMESPACE"
            echo "✅ Primary 재시작 명령 완료"
            echo ""
            echo "2️⃣  Secondary 재시작 중..."
            kubectl rollout restart deployment orderbook-collector-secondary -n "$NAMESPACE"
            echo "✅ Secondary 재시작 명령 완료"
            echo ""
            echo "⏳ 재시작 상태 확인 중..."
            echo ""
            echo "Primary 상태:"
            kubectl rollout status deployment orderbook-collector-primary -n "$NAMESPACE" --timeout=120s
            echo ""
            echo "Secondary 상태:"
            kubectl rollout status deployment orderbook-collector-secondary -n "$NAMESPACE" --timeout=120s
            echo ""
            echo "📊 전체 Pod 상태:"
            kubectl get pods -n "$NAMESPACE" -l app=orderbook-collector
            ;;
        0)
            echo "취소되었습니다."
            exit 0
            ;;
        *)
            echo "❌ 잘못된 선택입니다."
            exit 1
            ;;
    esac
    
elif [ "$DEPLOYMENT_MODE" = "multi-instance" ]; then
    echo "재시작할 인스턴스 선택:"
    echo "  1) 인스턴스 1만 재시작"
    echo "  2) 인스턴스 2만 재시작"
    echo "  3) 인스턴스 1과 2 모두 재시작"
    echo "  0) 취소"
    echo ""
    read -p "선택하세요 (0-3): " SELECTION
    
    case "$SELECTION" in
        1)
            echo ""
            echo "🔄 인스턴스 1 재시작 중..."
            kubectl rollout restart deployment orderbook-collector-1 -n "$NAMESPACE"
            echo "✅ 인스턴스 1 재시작 명령 완료"
            echo ""
            echo "⏳ 재시작 상태 확인 중..."
            kubectl rollout status deployment orderbook-collector-1 -n "$NAMESPACE" --timeout=120s
            echo ""
            echo "📊 인스턴스 1 Pod 상태:"
            kubectl get pods -n "$NAMESPACE" -l app=orderbook-collector,instance=1
            ;;
        2)
            echo ""
            echo "🔄 인스턴스 2 재시작 중..."
            kubectl rollout restart deployment orderbook-collector-2 -n "$NAMESPACE"
            echo "✅ 인스턴스 2 재시작 명령 완료"
            echo ""
            echo "⏳ 재시작 상태 확인 중..."
            kubectl rollout status deployment orderbook-collector-2 -n "$NAMESPACE" --timeout=120s
            echo ""
            echo "📊 인스턴스 2 Pod 상태:"
            kubectl get pods -n "$NAMESPACE" -l app=orderbook-collector,instance=2
            ;;
        3)
            echo ""
            echo "🔄 인스턴스 1과 2 모두 재시작 중..."
            echo ""
            echo "1️⃣  인스턴스 1 재시작 중..."
            kubectl rollout restart deployment orderbook-collector-1 -n "$NAMESPACE"
            echo "✅ 인스턴스 1 재시작 명령 완료"
            echo ""
            echo "2️⃣  인스턴스 2 재시작 중..."
            kubectl rollout restart deployment orderbook-collector-2 -n "$NAMESPACE"
            echo "✅ 인스턴스 2 재시작 명령 완료"
            echo ""
            echo "⏳ 재시작 상태 확인 중..."
            echo ""
            echo "인스턴스 1 상태:"
            kubectl rollout status deployment orderbook-collector-1 -n "$NAMESPACE" --timeout=120s
            echo ""
            echo "인스턴스 2 상태:"
            kubectl rollout status deployment orderbook-collector-2 -n "$NAMESPACE" --timeout=120s
            echo ""
            echo "📊 전체 Pod 상태:"
            kubectl get pods -n "$NAMESPACE" -l app=orderbook-collector
            ;;
        0)
            echo "취소되었습니다."
            exit 0
            ;;
        *)
            echo "❌ 잘못된 선택입니다."
            exit 1
            ;;
    esac
    
elif [ "$DEPLOYMENT_MODE" = "single" ]; then
    echo "단일 인스턴스 모드입니다."
    read -p "재시작하시겠습니까? (y/N): " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo ""
        echo "🔄 orderbook-collector 재시작 중..."
        kubectl rollout restart deployment orderbook-collector -n "$NAMESPACE"
        echo "✅ 재시작 명령 완료"
        echo ""
        echo "⏳ 재시작 상태 확인 중..."
        kubectl rollout status deployment orderbook-collector -n "$NAMESPACE" --timeout=120s
        echo ""
        echo "📊 Pod 상태:"
        kubectl get pods -n "$NAMESPACE" -l app=orderbook-collector
    else
        echo "취소되었습니다."
        exit 0
    fi
else
    echo "❌ orderbook-collector 배포를 찾을 수 없습니다."
    echo ""
    echo "💡 배포 방법:"
    echo "  - Active-Active 모드: kubectl apply -f k8s/orderbook-collector/deployment-active-active.yaml"
    echo "  - 다중 인스턴스 모드: kubectl apply -f k8s/orderbook-collector/deployment-1.yaml deployment-2.yaml"
    echo "  - 단일 인스턴스 모드: kubectl apply -f k8s/orderbook-collector/deployment.yaml"
    exit 1
fi

echo ""
echo "================================"
echo "✅ 재시작 완료"
echo "================================"
echo ""
echo "💡 로그 확인:"
if [ "$DEPLOYMENT_MODE" = "active-active" ]; then
    echo "  Primary: kubectl logs -n $NAMESPACE -l app=orderbook-collector,role=primary --tail=50"
    echo "  Secondary: kubectl logs -n $NAMESPACE -l app=orderbook-collector,role=secondary --tail=50"
elif [ "$DEPLOYMENT_MODE" = "multi-instance" ]; then
    echo "  인스턴스 1: kubectl logs -n $NAMESPACE -l app=orderbook-collector,instance=1 --tail=50"
    echo "  인스턴스 2: kubectl logs -n $NAMESPACE -l app=orderbook-collector,instance=2 --tail=50"
else
    echo "  kubectl logs -n $NAMESPACE -l app=orderbook-collector --tail=50"
fi
echo ""

