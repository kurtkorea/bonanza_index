#!/bin/bash

# ZFS 관련 모든 서드파티 완전 제거 스크립트
# 주의: 이 스크립트는 모든 ZFS 관련 리소스를 삭제합니다.
# 데이터 백업이 필요한 경우 먼저 백업을 수행하세요.

set -e

NAMESPACE="bonanza-index"
OPENEBS_NAMESPACE="openebs"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "ZFS 관련 모든 서드파티 제거"
echo "=========================================="
echo ""

# 확인 프롬프트
echo -e "${RED}경고: 이 작업은 다음을 모두 삭제합니다:${NC}"
echo "  - QuestDB StatefulSet 및 PVC (데이터 손실)"
echo "  - 모든 ZFSVolume 리소스"
echo "  - 모든 ZFSNode 리소스"
echo "  - 모든 ZFS StorageClass"
echo "  - OpenEBS ZFS Operator (Helm)"
echo "  - 모든 ZFS CRD"
echo "  - CSIDriver 리소스"
echo ""
read -p "정말로 계속하시겠습니까? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "작업이 취소되었습니다."
    exit 1
fi

echo ""
echo "=========================================="
echo "1. QuestDB 리소스 제거"
echo "=========================================="

# QuestDB StatefulSet 삭제
echo -e "${YELLOW}QuestDB StatefulSet 삭제 중...${NC}"
kubectl delete statefulset questdb -n "$NAMESPACE" --ignore-not-found=true || true
echo -e "${GREEN}✓ QuestDB StatefulSet 삭제 완료${NC}"

# QuestDB PVC 삭제
echo -e "${YELLOW}QuestDB PVC 삭제 중...${NC}"
kubectl delete pvc -n "$NAMESPACE" -l app=questdb --ignore-not-found=true || true
kubectl delete pvc questdb-data-questdb-0 -n "$NAMESPACE" --ignore-not-found=true || true
echo -e "${GREEN}✓ QuestDB PVC 삭제 완료${NC}"

echo ""
echo "=========================================="
echo "2. ZFSVolume 리소스 제거"
echo "=========================================="

# 모든 네임스페이스의 ZFSVolume 삭제
echo -e "${YELLOW}ZFSVolume 리소스 삭제 중...${NC}"
for ns in $(kubectl get namespaces -o jsonpath='{.items[*].metadata.name}'); do
    kubectl delete zfsvolume --all -n "$ns" --ignore-not-found=true 2>/dev/null || true
done
echo -e "${GREEN}✓ ZFSVolume 리소스 삭제 완료${NC}"

echo ""
echo "=========================================="
echo "3. StorageClass 제거"
echo "=========================================="

# ZFS 관련 StorageClass 삭제
echo -e "${YELLOW}ZFS StorageClass 삭제 중...${NC}"
kubectl delete storageclass zfs --ignore-not-found=true || true
kubectl delete storageclass zfs-openebs --ignore-not-found=true || true
echo -e "${GREEN}✓ ZFS StorageClass 삭제 완료${NC}"

echo ""
echo "=========================================="
echo "4. ZFSNode 리소스 제거"
echo "=========================================="

# ZFSNode 삭제
echo -e "${YELLOW}ZFSNode 리소스 삭제 중...${NC}"
kubectl delete zfsnode --all --ignore-not-found=true || true
echo -e "${GREEN}✓ ZFSNode 삭제 완료${NC}"

echo ""
echo "=========================================="
echo "5. OpenEBS ZFS Operator 제거 (Helm)"
echo "=========================================="

# Helm으로 설치된 경우 제거
if helm list -n "$OPENEBS_NAMESPACE" 2>/dev/null | grep -q "zfs-localpv"; then
    echo -e "${YELLOW}Helm으로 설치된 OpenEBS ZFS Operator 제거 중...${NC}"
    helm uninstall zfs-localpv -n "$OPENEBS_NAMESPACE" || true
    echo -e "${GREEN}✓ Helm Operator 제거 완료${NC}"
else
    echo -e "${YELLOW}Helm으로 설치된 Operator가 없습니다.${NC}"
fi

# OpenEBS 네임스페이스의 리소스 정리
echo -e "${YELLOW}OpenEBS 네임스페이스 리소스 정리 중...${NC}"
kubectl delete deployment -n "$OPENEBS_NAMESPACE" -l app=openebs-zfs-controller --ignore-not-found=true || true
kubectl delete daemonset -n "$OPENEBS_NAMESPACE" -l app=openebs-zfs-node --ignore-not-found=true || true
kubectl delete service -n "$OPENEBS_NAMESPACE" -l app=openebs-zfs --ignore-not-found=true || true
kubectl delete serviceaccount -n "$OPENEBS_NAMESPACE" -l app=openebs-zfs --ignore-not-found=true || true
kubectl delete clusterrole -l app=openebs-zfs --ignore-not-found=true || true
kubectl delete clusterrolebinding -l app=openebs-zfs --ignore-not-found=true || true
echo -e "${GREEN}✓ OpenEBS 네임스페이스 리소스 정리 완료${NC}"

echo ""
echo "=========================================="
echo "6. CSIDriver 제거"
echo "=========================================="

# CSIDriver 제거
echo -e "${YELLOW}CSIDriver 제거 중...${NC}"
kubectl delete csidriver zfs.csi.openebs.io --ignore-not-found=true || true
echo -e "${GREEN}✓ CSIDriver 제거 완료${NC}"

echo ""
echo "=========================================="
echo "7. CRD 제거"
echo "=========================================="

# CRD 제거 (순서 중요: 의존성 고려)
echo -e "${YELLOW}CRD 제거 중...${NC}"

# ZFSVolume CRD 제거 (먼저)
kubectl delete crd zfsvolumes.zfs.openebs.io --ignore-not-found=true || true
echo -e "${GREEN}✓ zfsvolumes.zfs.openebs.io 삭제 완료${NC}"

# ZFSBackup CRD 제거
kubectl delete crd zfsbackups.zfs.openebs.io --ignore-not-found=true || true
echo -e "${GREEN}✓ zfsbackups.zfs.openebs.io 삭제 완료${NC}"

# ZFSRestore CRD 제거
kubectl delete crd zfsrestores.zfs.openebs.io --ignore-not-found=true || true
echo -e "${GREEN}✓ zfsrestores.zfs.openebs.io 삭제 완료${NC}"

# ZFSNode CRD 제거 (마지막)
kubectl delete crd zfsnodes.zfs.openebs.io --ignore-not-found=true || true
echo -e "${GREEN}✓ zfsnodes.zfs.openebs.io 삭제 완료${NC}"

echo ""
echo "=========================================="
echo "8. 최종 확인"
echo "=========================================="

echo -e "${YELLOW}남은 리소스 확인 중...${NC}"
echo ""

echo "--- QuestDB 리소스 ---"
kubectl get statefulset questdb -n "$NAMESPACE" 2>/dev/null || echo "QuestDB StatefulSet 없음"
kubectl get pvc -n "$NAMESPACE" | grep questdb || echo "QuestDB PVC 없음"
echo ""

echo "--- ZFS 리소스 ---"
kubectl get zfsnode 2>/dev/null || echo "ZFSNode 없음"
kubectl get zfsvolume -A 2>/dev/null || echo "ZFSVolume 없음"
kubectl get storageclass | grep zfs || echo "ZFS StorageClass 없음"
kubectl get csidriver | grep zfs || echo "ZFS CSIDriver 없음"
echo ""

echo "--- ZFS CRD ---"
kubectl get crd | grep zfs || echo "ZFS CRD 없음"
echo ""

echo "--- OpenEBS Operator ---"
kubectl get pods -n "$OPENEBS_NAMESPACE" -l role=openebs-zfs 2>/dev/null || echo "OpenEBS ZFS Pod 없음"
helm list -n "$OPENEBS_NAMESPACE" | grep zfs || echo "Helm 릴리스 없음"
echo ""

echo "=========================================="
echo -e "${GREEN}제거 작업 완료!${NC}"
echo "=========================================="
echo ""
echo -e "${YELLOW}참고사항:${NC}"
echo ""
echo "1. ZFS 풀(bonanza)은 호스트에 남아있습니다."
echo "   필요시 수동으로 제거하세요:"
echo "   sudo zpool destroy bonanza"
echo ""
echo "2. OpenEBS 네임스페이스는 남아있을 수 있습니다."
echo "   필요시 삭제하세요:"
echo "   kubectl delete namespace $OPENEBS_NAMESPACE"
echo ""
echo "3. 모든 리소스가 제거되었는지 확인하세요:"
echo "   kubectl get all -n $NAMESPACE"
echo "   kubectl get all -n $OPENEBS_NAMESPACE"
echo ""
echo "4. 재설치를 위해 다음을 확인하세요:"
echo "   - ZFS 풀이 생성되어 있는지: zpool list"
echo "   - Helm이 설치되어 있는지: helm version"
echo ""

