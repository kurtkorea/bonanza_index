#!/bin/bash
# QuestDB PVC 바인딩 문제 해결 스크립트

echo "=== 1. ZFSNode 확인 ==="
ZFSNODE_COUNT=$(kubectl get zfsnode --no-headers 2>/dev/null | wc -l)
if [ "$ZFSNODE_COUNT" -eq 0 ]; then
    echo "⚠️  ZFSNode가 없습니다. 생성합니다..."
    NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
    echo "노드 이름: $NODE_NAME"
    
    cat <<EOF | kubectl apply -f -
apiVersion: zfs.openebs.io/v1
kind: ZFSNode
metadata:
  name: $NODE_NAME
spec:
  poolName: "bonanza"
  nodeID: "$NODE_NAME"
EOF
    echo "✅ ZFSNode 생성 완료"
    sleep 2
else
    echo "✅ ZFSNode가 존재합니다:"
    kubectl get zfsnode
fi

echo ""
echo "=== 2. StorageClass 확인 ==="
kubectl get storageclass zfs -o yaml | grep -A 2 volumeBindingMode

echo ""
echo "=== 3. PVC 상태 확인 ==="
kubectl get pvc questdb-data-questdb-0 -n bonanza-index

echo ""
echo "=== 4. ZFSVolume 리소스 확인 ==="
kubectl get zfsvolume -n bonanza-index

echo ""
echo "=== 5. ZFS CSI Controller 로그 (최근 30줄) ==="
kubectl logs -n bonanza-index -l app=zfs-csi-controller --tail=30 | grep -i "questdb\|volume\|create\|error" || kubectl logs -n bonanza-index -l app=zfs-csi-controller --tail=30

echo ""
echo "=== 6. Pod 상태 ==="
kubectl get pod questdb-0 -n bonanza-index

echo ""
echo "💡 다음 단계:"
echo "   - StorageClass가 WaitForFirstConsumer 모드인 경우, Immediate로 변경하거나"
echo "   - Pod가 정상적으로 스케줄링되었는지 확인하세요"
echo "   - ZFS CSI Controller 로그에서 볼륨 생성 오류를 확인하세요"

