#!/bin/bash

echo "🚀 Bonanza Index 배포 상태"
echo "================================"
echo ""

echo "📦 Pod 상태:"
kubectl get pods -n bonanza-index
echo ""

echo "💾 PVC 상태:"
kubectl get pvc -n bonanza-index
echo ""

echo "🔍 서비스 상태:"
kubectl get svc -n bonanza-index
echo ""

echo "📍 노드별 배치:"
kubectl get pods -n bonanza-index -o wide --sort-by=.spec.nodeName
echo ""

echo "🗄️  데이터베이스 Pod (마스터):"
kubectl get pods -n bonanza-index -o wide | grep -E "(questdb|redis|mariadb|nginx)" || echo "데이터베이스 Pod 없음"
echo ""

echo "📊 데이터베이스 Pod 상세 상태:"
echo ""
echo "QuestDB:"
QUESTDB_PHASE=$(kubectl get pod questdb-0 -n bonanza-index -o jsonpath='{.status.phase}' 2>/dev/null || echo "N/A")
QUESTDB_READY=$(kubectl get pod questdb-0 -n bonanza-index -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $QUESTDB_PHASE, Ready: $QUESTDB_READY"

echo ""
echo "MariaDB:"
MARIADB_PHASE=$(kubectl get pod mariadb-0 -n bonanza-index -o jsonpath='{.status.phase}' 2>/dev/null || echo "N/A")
MARIADB_READY=$(kubectl get pod mariadb-0 -n bonanza-index -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $MARIADB_PHASE, Ready: $MARIADB_READY"

echo ""
echo "Redis:"
REDIS_PHASE=$(kubectl get pods -n bonanza-index -l app=redis -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
REDIS_READY=$(kubectl get pods -n bonanza-index -l app=redis -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $REDIS_PHASE, Ready: $REDIS_READY"

echo ""
echo "Nginx:"
NGINX_PHASE=$(kubectl get pods -n bonanza-index -l app=nginx -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "N/A")
NGINX_READY=$(kubectl get pods -n bonanza-index -l app=nginx -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "N/A")
echo "  Phase: $NGINX_PHASE, Ready: $NGINX_READY"

echo ""
echo "🔧 애플리케이션 Pod (워커):"
kubectl get pods -n bonanza-index -o wide | grep -vE "(questdb|redis|mariadb|nginx)" || echo "애플리케이션 Pod 없음"
echo ""

echo "📡 Ingress 상태:"
kubectl get ingress -n bonanza-index 2>/dev/null || echo "Ingress 없음"
echo ""

# 문제가 있는 Pod 확인
FAILING_PODS=$(kubectl get pods -n bonanza-index --field-selector=status.phase!=Running,status.phase!=Succeeded -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
if [ ! -z "$FAILING_PODS" ]; then
    echo "⚠️  문제가 있는 Pod:"
    kubectl get pods -n bonanza-index --field-selector=status.phase!=Running,status.phase!=Succeeded
    echo ""
    echo "💡 문제 진단:"
    echo "  kubectl describe pod <pod-name> -n bonanza-index"
    echo "  kubectl logs <pod-name> -n bonanza-index"
else
    echo "✅ 모든 Pod가 정상적으로 실행 중입니다!"
fi
echo ""
