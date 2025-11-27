# ZFS Storage 배포 가이드

이 디렉토리에는 Kubernetes에서 ZFS를 StorageClass로 사용하기 위한 리소스가 포함되어 있습니다.

## 사전 요구사항

마스터 노드에 ZFS가 설치되어 있어야 합니다:

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y zfsutils-linux

# ZFS 모듈 로드
sudo modprobe zfs

# ZFS 풀 확인
sudo zpool list

# ZFS 데이터셋 확인
sudo zfs list
```

## ZFS 풀 생성 (선택사항)

ZFS 풀이 없는 경우:

```bash
# 디스크 확인
sudo fdisk -l

# 파티션 테이블 확인
sudo lsblk -f

# 빈 디스크나 파티션 사용 (권장)
# 예: /dev/sdb (전체 디스크) 또는 /dev/sdb1 (파티션)
sudo zpool create bonanza /dev/sdb

# 데이터셋 생성
sudo zfs create bonanza/k8s
```

### 기존 파일시스템이 있는 파티션 사용 시

**⚠️ 주의: 기존 데이터가 모두 삭제됩니다!**

```bash
# 1. 기존 파일시스템 확인
sudo lsblk -f /dev/sda4

# 2. 데이터 백업 (필요한 경우)
# 예: 다른 디스크나 원격 저장소로 백업

# 3. 마운트 해제 (마운트된 경우)
sudo umount /dev/sda4

# 4. 강제로 ZFS 풀 생성 (데이터 손실)
sudo zpool create -f bonanza /dev/sda4

# 또는 파티션을 지우고 새로 생성
sudo fdisk /dev/sda  # 파티션 삭제 후 재생성
sudo zpool create bonanza /dev/sda4
```

### 대안: 디렉토리 기반 ZFS 풀 생성

기존 파일시스템을 유지하면서 디렉토리에 ZFS 풀을 생성:

```bash
# 디렉토리 생성
sudo mkdir -p /var/lib/zfs-pool

# 파일 기반 ZFS 풀 생성 (예: 200GB)
sudo truncate -s 200G /var/lib/zfs-pool/zfs-pool.img

# 방법 1: 파일을 직접 사용 (권장)
sudo zpool create bonanza /var/lib/zfs-pool/zfs-pool.img

# 방법 2: 사용 가능한 루프 디바이스 찾기 및 할당
# 사용 중인 루프 디바이스 확인
sudo losetup -a

# 사용 가능한 루프 디바이스 찾기 (예: /dev/loop1)
sudo losetup /dev/loop1 /var/lib/zfs-pool/zfs-pool.img
sudo zpool create bonanza /dev/loop1

# 방법 3: 자동으로 사용 가능한 루프 디바이스 할당
LOOP_DEV=$(sudo losetup -f)
sudo losetup $LOOP_DEV /var/lib/zfs-pool/zfs-pool.img
sudo zpool create bonanza $LOOP_DEV
```

**주의**: 파일을 직접 사용하는 방법(방법 1)이 가장 간단하고 안전합니다.

## StorageClass 파라미터 수정

`storageclass.yaml`에서 `poolname`을 실제 ZFS 풀 이름으로 변경하세요:

```yaml
parameters:
  poolname: "bonanza"  # 실제 ZFS 풀 이름으로 변경
```

## 배포

`deploy-master.sh` 스크립트를 사용하여 배포하거나, 직접 배포:

```bash
# CRD 설치 (필수)
kubectl apply -f zfs/crd.yaml

# RBAC 적용
kubectl apply -f zfs/rbac.yaml

# Controller 배포
kubectl apply -f zfs/deployment.yaml

# Node Driver 배포
kubectl apply -f zfs/daemonset.yaml

# StorageClass 생성
kubectl apply -f zfs/storageclass.yaml
```

**중요**: CRD는 반드시 먼저 설치해야 합니다. CRD 없이는 ZFS CSI Driver가 정상 작동하지 않습니다.

## 사용 방법

PVC에서 ZFS StorageClass 사용:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: zfs
  resources:
    requests:
      storage: 10Gi
```

## 문제 해결

### ZFS가 설치되지 않은 경우

```bash
# ZFS 설치 확인
which zfs
which zpool

# 설치되지 않은 경우
sudo apt install -y zfsutils-linux
sudo modprobe zfs
```

### ZFS 풀 확인

```bash
# 풀 목록 확인
sudo zpool list

# 데이터셋 확인
sudo zfs list
```

### CSI Driver Pod 상태 확인

```bash
# Controller Pod 확인
kubectl get pods -n bonanza-index -l app=zfs-csi-controller

# Node Driver Pod 확인
kubectl get pods -n bonanza-index -l app=zfs-csi-node

# 로그 확인
kubectl logs -n bonanza-index -l app=zfs-csi-controller
kubectl logs -n bonanza-index -l app=zfs-csi-node

# 또는 app-log.sh 스크립트 사용
cd k8s/scripts
./app-log.sh
# 선택: 14 (zfs-csi-controller) 또는 15 (zfs-csi-node)
```

### 정상 작동 확인

Controller가 정상적으로 시작되면 다음과 같은 로그가 표시됩니다:
```
ZFS Driver Version :- 2.5.0
Plugin: controller
synced k8s & zfs node informer caches
Listening for connections on address: unix:///var/lib/csi/sockets/pluginproxy/csi.sock
```

### ZFSNode 리소스 생성

ZFS CSI Driver가 자동으로 노드를 등록하지 못하는 경우, 수동으로 ZFSNode를 생성해야 합니다:

```bash
# 노드 이름 확인
kubectl get nodes

# ZFSNode 리소스 확인
kubectl get zfsnode

# ZFSNode가 없으면 수동 생성
# 1. 노드 이름 확인
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
echo "Node name: $NODE_NAME"

# 2. ZFSNode 생성
cat <<EOF | kubectl apply -f -
apiVersion: zfs.openebs.io/v1
kind: ZFSNode
metadata:
  name: $NODE_NAME
spec:
  poolName: "bonanza"  # 실제 ZFS 풀 이름
  nodeID: "$NODE_NAME"
EOF

# 또는 k8s/zfs/zfsnode.yaml 파일 수정 후 적용
# 노드 이름을 실제 노드 이름으로 변경
kubectl apply -f k8s/zfs/zfsnode.yaml
```

### StorageClass 사용 테스트

ZFS StorageClass가 정상 작동하는지 테스트:

```bash
# 테스트 PVC 생성
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-zfs-pvc
  namespace: bonanza-index
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: zfs
  resources:
    requests:
      storage: 1Gi
EOF

# PVC 상태 확인
kubectl get pvc test-zfs-pvc -n bonanza-index

# ZFSVolume 리소스 확인
kubectl get zfsvolume -n bonanza-index

# ZFSNode 리소스 확인
kubectl get zfsnode
```

