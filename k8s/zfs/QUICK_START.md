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

### 3-1. CRD 확인 및 설치 (필요한 경우)

```bash
# CRD 확인
kubectl get crd | grep zfs

# CRD가 없으면 수동 설치
kubectl apply -f k8s/zfs/crd.yaml

# Controller Pod 재시작
kubectl delete pod -n openebs -l app=openebs-zfs-controller
```

**중요:** `zfsvolumes.zfs.openebs.io` CRD가 없으면 PVC가 Pending 상태로 유지됩니다.

### 4. ZFSNode 생성 (자동 생성 안 될 경우)

**중요:** `pools` 배열의 각 항목에 `name`, `uuid`, `used`, `free` 필드가 모두 필수입니다.

```bash
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
POOL_NAME="bonanza"
POOL_UUID=$(zpool get -H -o value guid "$POOL_NAME" | head -1)
POOL_USED=$(zpool list -H -o alloc "$POOL_NAME" | sed 's/K$/Ki/; s/M$/Mi/; s/G$/Gi/')
POOL_FREE=$(zpool list -H -o free "$POOL_NAME" | sed 's/K$/Ki/; s/M$/Mi/; s/G$/Gi/')

cat <<EOF | kubectl apply -f -
apiVersion: zfs.openebs.io/v1
kind: ZFSNode
metadata:
  name: $NODE_NAME
pools:
  - name: $POOL_NAME
    uuid: "$POOL_UUID"
    used: "$POOL_USED"
    free: "$POOL_FREE"
EOF
```

**참고:** `used`와 `free` 값은 Kubernetes 형식(`Ki`, `Mi`, `Gi`)을 사용해야 합니다.

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

