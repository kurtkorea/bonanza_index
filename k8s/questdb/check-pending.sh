#!/bin/bash
# QuestDB Pending 상태 확인 스크립트

echo "=== QuestDB Pod 상태 ==="
kubectl get pod questdb-0 -n bonanza-index

echo ""
echo "=== Pod 상세 정보 ==="
kubectl describe pod questdb-0 -n bonanza-index

echo ""
echo "=== PVC 상태 ==="
kubectl get pvc -n bonanza-index | grep questdb

echo ""
echo "=== PVC 상세 정보 ==="
kubectl describe pvc questdb-data-questdb-0 -n bonanza-index 2>/dev/null || echo "PVC가 아직 생성되지 않았습니다"

echo ""
echo "=== ZFSVolume 리소스 ==="
kubectl get zfsvolume -n bonanza-index 2>/dev/null || echo "ZFSVolume 리소스가 없습니다"

echo ""
echo "=== ZFSNode 리소스 ==="
kubectl get zfsnode 2>/dev/null || echo "ZFSNode 리소스가 없습니다"

echo ""
echo "=== 최근 이벤트 ==="
kubectl get events -n bonanza-index --sort-by='.lastTimestamp' | tail -20

