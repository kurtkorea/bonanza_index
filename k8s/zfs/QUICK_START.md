# ZFS Storage 및 QuestDB 마이그레이션 빠른 시작 가이드

## 빠른 설치 (5분)

### 1. ZFS 풀 생성

```bash
# 디스크 기반 (권장)
sudo zpool create bonanza /dev/sdb

# 또는 파일 기반 (테스트용)
sudo mkdir -p /var/lib/zfs-pool
sudo truncate -s 200G /var/lib/zfs-pool/zfs-pool.img
sudo losetup /dev/loop0 /var/lib/zfs-pool/zfs-pool.img
sudo zpool create bonanza /dev/loop0
```

### 2. Helm 설치

```bash
sudo snap install helm --classic
```

### 3. OpenEBS ZFS Operator 설치

```bash
helm repo add openebs-zfs https://openebs.github.io/zfs-localpv
helm repo update
helm install zfs-localpv openebs-zfs/zfs-localpv --namespace openebs --create-namespace
```

### 4. ZFSNode 생성 (자동 생성 안 될 경우)

```bash
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
cat <<EOF | kubectl apply -f -
apiVersion: zfs.openebs.io/v1
kind: ZFSNode
metadata:
  name: $NODE_NAME
spec:
  pools:
    - name: bonanza
      type: striped
EOF
```

### 5. StorageClass 생성

```bash
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: zfs-openebs
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
```

### 6. QuestDB 마이그레이션

```bash
# StatefulSet 수정 (storageClassName: zfs-openebs, storage: 150Gi)
# k8s/questdb/statefulset.yaml 편집

# 마이그레이션 실행
kubectl delete statefulset questdb -n bonanza-index
kubectl delete pvc questdb-data-questdb-0 -n bonanza-index
kubectl apply -f k8s/questdb/statefulset.yaml

# 확인
kubectl get pod questdb-0 -n bonanza-index
kubectl get pvc questdb-data-questdb-0 -n bonanza-index
```

## 상태 확인

```bash
# Operator 상태
kubectl get pods -n openebs -l role=openebs-zfs

# ZFSNode 상태
kubectl get zfsnode

# StorageClass 확인
kubectl get storageclass zfs-openebs

# QuestDB 상태
kubectl get pod questdb-0 -n bonanza-index
kubectl get pvc questdb-data-questdb-0 -n bonanza-index
kubectl get zfsvolume -n bonanza-index
```

## 자주 발생하는 문제

### PVC가 Pending 상태

```bash
# ZFS 풀 용량 확인
zpool list bonanza

# StatefulSet의 storage 값을 줄임 (예: 150Gi → 100Gi)
# k8s/questdb/statefulset.yaml 수정 후 재배포
```

### ZFSNode가 Ready 상태가 아님

```bash
# Node Agent 로그 확인
kubectl logs -n openebs -l app=openebs-zfs-node --tail=50

# 수동으로 ZFSNode 재생성 (위의 4단계 참조)
```

자세한 내용은 [INSTALLATION_GUIDE.md](./INSTALLATION_GUIDE.md)를 참조하세요.

