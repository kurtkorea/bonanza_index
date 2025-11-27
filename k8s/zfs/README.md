# ZFS Storage for Kubernetes

이 디렉토리는 Kubernetes 클러스터에 OpenEBS ZFS LocalPV를 설치하고 관리하기 위한 설정 파일들을 포함합니다.

## 디렉토리 구조

```
k8s/zfs/
├── README.md                    # 이 파일
├── INSTALLATION_GUIDE.md        # 상세 설치 가이드
├── QUICK_START.md               # 빠른 시작 가이드
├── crd.yaml                     # Custom Resource Definitions
├── csidriver.yaml               # CSI Driver 리소스
├── rbac.yaml                    # RBAC 설정
├── deployment.yaml              # ZFS CSI Controller Deployment
├── daemonset.yaml               # ZFS CSI Node Driver DaemonSet
├── storageclass.yaml            # StorageClass 정의
└── zfsnode.yaml                 # ZFSNode 리소스 예제
```

## 빠른 시작

### 1. 설치 가이드 선택

- **처음 설치하는 경우**: [INSTALLATION_GUIDE.md](./INSTALLATION_GUIDE.md) 참조
- **빠르게 설치하고 싶은 경우**: [QUICK_START.md](./QUICK_START.md) 참조

### 2. 설치 순서

1. ZFS 풀 생성
2. Helm 설치
3. OpenEBS ZFS Operator 설치 (Helm)
4. ZFSNode 리소스 생성
5. StorageClass 생성
6. QuestDB 마이그레이션

## 주요 리소스

### StorageClass: `zfs-openebs`

- **Provisioner**: `zfs.csi.openebs.io`
- **Volume Binding Mode**: `WaitForFirstConsumer`
- **Pool Name**: `bonanza`
- **Allow Volume Expansion**: `true`

### ZFSNode

각 Kubernetes 노드에 대해 ZFSNode 리소스가 생성되어야 합니다. OpenEBS ZFS Operator의 Node Agent가 자동으로 생성하지만, 수동으로 생성할 수도 있습니다.

## 사용 예시

### QuestDB StatefulSet

```yaml
volumeClaimTemplates:
- metadata:
    name: questdb-data
  spec:
    accessModes: ["ReadWriteOnce"]
    storageClassName: "zfs-openebs"
    resources:
      requests:
        storage: 150Gi
```

## 상태 확인

```bash
# Operator Pod 상태
kubectl get pods -n openebs -l role=openebs-zfs

# ZFSNode 상태
kubectl get zfsnode

# StorageClass 확인
kubectl get storageclass zfs-openebs

# ZFS 볼륨 확인
kubectl get zfsvolume -n bonanza-index
```

## 트러블슈팅

자세한 트러블슈팅 가이드는 [INSTALLATION_GUIDE.md](./INSTALLATION_GUIDE.md)의 "트러블슈팅" 섹션을 참조하세요.

## 참고 자료

- [OpenEBS ZFS LocalPV 공식 문서](https://openebs.io/docs/user-guides/zfs-localpv)
- [ZFS 공식 문서](https://openzfs.org/wiki/Main_Page)
- [Kubernetes StorageClass 문서](https://kubernetes.io/docs/concepts/storage/storage-classes/)

