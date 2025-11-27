# ZFS CSI Driver 문제 해결

## CrashLoopBackOff 문제

### 1. Pod 로그 확인

```bash
# Controller Pod 로그 확인
kubectl logs -n bonanza-index zfs-csi-controller-<pod-id> --previous

# Node Driver Pod 로그 확인
kubectl logs -n bonanza-index zfs-csi-node-<pod-id> --previous
```

### 2. 일반적인 원인

#### 이미지 문제
- `openebs/zfs-driver:latest` 이미지가 존재하지 않거나 호환되지 않을 수 있습니다.
- 해결: 특정 버전 태그 사용 또는 다른 이미지 사용

#### ZFS 미설치
- 호스트에 ZFS가 설치되지 않았거나 모듈이 로드되지 않았습니다.
- 해결:
  ```bash
  sudo apt install -y zfsutils-linux
  sudo modprobe zfs
  ```

#### 권한 문제
- DaemonSet이 privileged 모드로 실행되지 않았습니다.
- 해결: securityContext 확인

#### 호스트 경로 문제
- `/usr/sbin/zfs` 또는 `/usr/sbin/zpool`이 호스트에 없습니다.
- 해결:
  ```bash
  which zfs
  which zpool
  # 경로가 다르면 daemonset.yaml의 volumeMount 경로 수정
  ```

### 3. 대안: 간단한 ZFS Local PV 사용

OpenEBS ZFS CSI Driver 대신 더 간단한 방법:

1. **hostPath 기반 StorageClass 사용** (ZFS 데이터셋에 마운트)
2. **ZFS Local PV Provisioner 사용** (별도 설치 필요)

### 4. 로그 확인 스크립트

```bash
# 로그 확인 스크립트 실행
chmod +x k8s/zfs/check-logs.sh
./k8s/zfs/check-logs.sh

# 또는 수동으로 확인
kubectl logs -n bonanza-index -l app=zfs-csi-controller --tail=100
kubectl logs -n bonanza-index -l app=zfs-csi-node --tail=100
kubectl describe pod -n bonanza-index -l app=zfs-csi-controller
kubectl describe pod -n bonanza-index -l app=zfs-csi-node
```

### 5. 이미지 문제 해결

OpenEBS ZFS Driver 이미지가 존재하지 않거나 호환되지 않을 수 있습니다:

```bash
# 이미지 확인
docker pull openebs/zfs-driver:latest

# 특정 버전 사용 (예: v2.12.0)
# deployment.yaml과 daemonset.yaml에서 이미지 태그 변경
```

### 6. 임시 해결책: ZFS 없이 local-path 사용

ZFS가 제대로 작동하지 않는 경우, 기존 `local-path` StorageClass를 사용:

```yaml
storageClassName: local-path
```

### 7. 대안: ZFS Local PV Provisioner

OpenEBS ZFS CSI Driver 대신 ZFS Local PV Provisioner를 사용할 수 있습니다:

```bash
# OpenEBS Local PV Provisioner 설치 (ZFS 지원)
kubectl apply -f https://openebs.github.io/zfs-localpv/zfs-operator.yaml
```

