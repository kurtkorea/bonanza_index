#!/bin/bash

# StorageClass 생성 스크립트

set -e

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "ZFS StorageClass 생성"
echo "=========================================="
echo ""

# 1. 노드 이름 확인
echo "1. 노드 이름 확인:"
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
if [ -z "$NODE_NAME" ]; then
    echo -e "${RED}✗ 노드를 찾을 수 없습니다.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 노드 이름: $NODE_NAME${NC}"
echo ""

# 2. ZFSNode 확인
echo "2. ZFSNode 확인:"
if ! kubectl get zfsnode "$NODE_NAME" &>/dev/null; then
    echo -e "${YELLOW}⚠ ZFSNode '$NODE_NAME'이 없습니다.${NC}"
    echo "ZFSNode를 먼저 생성해야 합니다:"
    echo "  kubectl apply -f k8s/zfs/zfsnode.yaml"
    echo ""
    read -p "계속하시겠습니까? (StorageClass는 생성되지만 ZFSNode가 없으면 PVC가 바인딩되지 않습니다) (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "작업이 취소되었습니다."
        exit 1
    fi
else
    echo -e "${GREEN}✓ ZFSNode 존재: $NODE_NAME${NC}"
    kubectl get zfsnode "$NODE_NAME"
fi
echo ""

# 3. 기존 StorageClass 확인
echo "3. 기존 StorageClass 확인:"
if kubectl get storageclass zfs-openebs &>/dev/null; then
    echo -e "${YELLOW}⚠ StorageClass 'zfs-openebs'가 이미 존재합니다.${NC}"
    kubectl get storageclass zfs-openebs
    echo ""
    read -p "삭제하고 다시 생성하시겠습니까? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        kubectl delete storageclass zfs-openebs
        echo -e "${GREEN}✓ 기존 StorageClass 삭제 완료${NC}"
    else
        echo "기존 StorageClass를 유지합니다."
        exit 0
    fi
fi
echo ""

# 4. StorageClass 생성
echo "4. StorageClass 생성 중..."
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: zfs-openebs
  annotations:
    storageclass.kubernetes.io/is-default-class: "false"
provisioner: zfs.csi.openebs.io
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
reclaimPolicy: Delete
parameters:
  poolname: "bonanza"
allowedTopologies:
  - matchLabelExpressions:
    - key: kubernetes.io/hostname
      values:
      - $NODE_NAME
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ StorageClass 생성 완료${NC}"
else
    echo -e "${RED}✗ StorageClass 생성 실패${NC}"
    exit 1
fi

echo ""

# 5. 생성 확인
echo "5. 생성 확인:"
kubectl get storageclass zfs-openebs
echo ""
echo "상세 정보:"
kubectl describe storageclass zfs-openebs

echo ""
echo "=========================================="
echo -e "${GREEN}StorageClass 생성 완료!${NC}"
echo "=========================================="
echo ""
echo "다음 단계:"
echo "1. QuestDB 마이그레이션: kubectl apply -f k8s/questdb/statefulset.yaml"
echo "2. PVC 상태 확인: kubectl get pvc -n bonanza-index"

