#!/bin/bash
# ZFS CSI Driver Pod 로그 확인 스크립트

echo "=== Controller Pod 로그 ==="
kubectl logs -n bonanza-index -l app=zfs-csi-controller --tail=50

echo ""
echo "=== Node Driver Pod 로그 ==="
kubectl logs -n bonanza-index -l app=zfs-csi-node --tail=50

echo ""
echo "=== Pod 이벤트 ==="
kubectl get events -n bonanza-index --sort-by='.lastTimestamp' | grep zfs

echo ""
echo "=== Pod 상태 ==="
kubectl get pods -n bonanza-index -l 'app in (zfs-csi-controller,zfs-csi-node)'

