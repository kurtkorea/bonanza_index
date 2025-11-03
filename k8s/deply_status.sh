#!/bin/bash
echo "🚀 Bonanza Index 배포 상태"
echo "================================"
echo ""
echo "📦 Pod 상태:"
kubectl get pods -n bonanza-index
echo ""
echo "🌐 서비스:"
kubectl get svc -n bonanza-index
echo ""
echo "📍 노드별 배치:"
kubectl get pods -n bonanza-index -o wide --sort-by=.spec.nodeName
echo ""
echo "🗄️  데이터베이스 Pod (마스터):"
kubectl get pods -n bonanza-index -o wide | grep -E "(questdb|redis|mariadb|nginx)"
echo ""
echo "🔧 애플리케이션 Pod (워커):"
kubectl get pods -n bonanza-index -o wide | grep -vE "(questdb|redis|mariadb|nginx)"