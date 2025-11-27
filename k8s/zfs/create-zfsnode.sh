#!/bin/bash
# ZFSNode 리소스 생성 스크립트

echo "=== 노드 이름 확인 ==="
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
echo "Node name: $NODE_NAME"

echo ""
echo "=== 기존 ZFSNode 확인 ==="
kubectl get zfsnode

echo ""
echo "=== ZFS 풀 확인 ==="
sudo zpool list

echo ""
read -p "ZFSNode를 생성하시겠습니까? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "=== ZFSNode 생성 중 ==="
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
    echo "=== ZFSNode 확인 ==="
    kubectl get zfsnode -o yaml
    
    echo ""
    echo "✅ ZFSNode가 생성되었습니다."
    echo "   이제 PVC가 바인딩될 수 있습니다."
else
    echo "취소되었습니다."
fi

