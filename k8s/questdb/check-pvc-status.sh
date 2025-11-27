#!/bin/bash
# QuestDB PVC 상태 확인 및 문제 해결 스크립트

echo "=== PVC 상태 ==="
kubectl get pvc questdb-data-questdb-0 -n bonanza-index

echo ""
echo "=== PVC 상세 정보 ==="
kubectl describe pvc questdb-data-questdb-0 -n bonanza-index

echo ""
echo "=== ZFSNode 리소스 확인 ==="
kubectl get zfsnode

if [ $(kubectl get zfsnode --no-headers 2>/dev/null | wc -l) -eq 0 ]; then
    echo ""
    echo "⚠️  ZFSNode가 없습니다. 생성이 필요합니다."
    echo ""
    NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
    echo "노드 이름: $NODE_NAME"
    echo ""
    read -p "ZFSNode를 생성하시겠습니까? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cat <<EOF | kubectl apply -f -
apiVersion: zfs.openebs.io/v1
kind: ZFSNode
metadata:
  name: $NODE_NAME
spec:
  poolName: "bonanza"
  nodeID: "$NODE_NAME"
EOF
        echo ""
        echo "✅ ZFSNode가 생성되었습니다."
        echo "   잠시 후 PVC가 바인딩될 것입니다."
    fi
else
    echo ""
    echo "=== ZFSNode 상세 정보 ==="
    kubectl get zfsnode -o yaml
fi

echo ""
echo "=== ZFSVolume 리소스 확인 ==="
kubectl get zfsvolume -n bonanza-index

echo ""
echo "=== PVC 이벤트 ==="
kubectl get events -n bonanza-index --field-selector involvedObject.name=questdb-data-questdb-0 --sort-by='.lastTimestamp' | tail -10

echo ""
echo "=== ZFS CSI Controller 로그 (최근 20줄) ==="
kubectl logs -n bonanza-index -l app=zfs-csi-controller --tail=20

echo ""
echo "=== Pod 상태 ==="
kubectl get pod questdb-0 -n bonanza-index

