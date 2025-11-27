#!/bin/bash
# QuestDB PVC Pending 문제 해결 스크립트

echo "=== PVC 상세 정보 ==="
kubectl describe pvc questdb-data-questdb-0 -n bonanza-index

echo ""
echo "=== StorageClass 확인 ==="
kubectl get storageclass zfs -o yaml

echo ""
echo "=== ZFS CSI Driver Pod 상태 ==="
kubectl get pods -n bonanza-index -l 'app in (zfs-csi-controller,zfs-csi-node)'

echo ""
echo "=== ZFSNode 리소스 확인 ==="
kubectl get zfsnode -o yaml

echo ""
echo "=== ZFSVolume 리소스 확인 ==="
kubectl get zfsvolume -n bonanza-index

echo ""
echo "=== 최근 이벤트 ==="
kubectl get events -n bonanza-index --field-selector involvedObject.name=questdb-data-questdb-0 --sort-by='.lastTimestamp'

echo ""
echo "=== ZFS CSI Controller 로그 (최근 50줄) ==="
kubectl logs -n bonanza-index -l app=zfs-csi-controller --tail=50

echo ""
echo "=== ZFS CSI Node Driver 로그 (최근 50줄) ==="
kubectl logs -n bonanza-index -l app=zfs-csi-node --tail=50

