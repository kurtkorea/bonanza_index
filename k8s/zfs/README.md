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

# ZFS 풀 생성 (예: /dev/sdb 사용)
sudo zpool create rpool /dev/sdb

# 데이터셋 생성
sudo zfs create rpool/k8s
```

## StorageClass 파라미터 수정

`storageclass.yaml`에서 `poolname`을 실제 ZFS 풀 이름으로 변경하세요:

```yaml
parameters:
  poolname: "rpool"  # 실제 ZFS 풀 이름으로 변경
```

## 배포

`deploy-master.sh` 스크립트를 사용하여 배포하거나, 직접 배포:

```bash
# RBAC 적용
kubectl apply -f zfs/rbac.yaml

# Controller 배포
kubectl apply -f zfs/deployment.yaml

# Node Driver 배포
kubectl apply -f zfs/daemonset.yaml

# StorageClass 생성
kubectl apply -f zfs/storageclass.yaml
```

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
```

