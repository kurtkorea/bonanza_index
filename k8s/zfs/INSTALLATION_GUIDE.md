# ZFS Storage 설치 및 QuestDB 마이그레이션 가이드

이 문서는 Kubernetes 클러스터에 OpenEBS ZFS LocalPV를 설치하고 QuestDB를 ZFS 스토리지로 마이그레이션하는 과정을 설명합니다.

## 목차

1. [사전 요구사항](#사전-요구사항)
2. [기존 설치 제거 (재설치 시)](#기존-설치-제거-재설치-시)
3. [ZFS 풀 생성](#zfs-풀-생성)
4. [Helm 설치](#helm-설치)
5. [OpenEBS ZFS Operator 설치](#openebs-zfs-operator-설치)
6. [ZFSNode 리소스 생성](#zfsnode-리소스-생성)
7. [StorageClass 생성](#storageclass-생성)
8. [QuestDB 마이그레이션](#questdb-마이그레이션)
9. [검증](#검증)
10. [트러블슈팅](#트러블슈팅)

---

## 사전 요구사항

- Kubernetes 클러스터 (v1.20 이상 권장)
- 클러스터 노드에 ZFS가 설치되어 있어야 함
- `kubectl` 명령어 사용 가능
- 노드에 충분한 디스크 공간

### ZFS 설치 확인

```bash
# ZFS 설치 확인
zfs --version

# ZFS 풀 목록 확인
zpool list
```

---

## 기존 설치 제거 (재설치 시)

기존 ZFS 설치를 완전히 제거하고 처음부터 다시 설치하려는 경우, 다음 스크립트를 사용하세요.

### 완전 제거 스크립트 사용

```bash
chmod +x k8s/zfs/uninstall-all.sh
./k8s/zfs/uninstall-all.sh
```

이 스크립트는 다음을 모두 제거합니다:
- QuestDB StatefulSet 및 PVC (데이터 손실 주의)
- 모든 ZFSVolume 리소스
- 모든 ZFSNode 리소스
- 모든 ZFS StorageClass
- OpenEBS ZFS Operator (Helm)
- 모든 ZFS CRD (zfsnodes, zfsvolumes, zfsbackups, zfsrestores)
- CSIDriver 리소스
- 관련 RBAC 리소스

### 수동 제거 (선택사항)

스크립트를 사용하지 않고 수동으로 제거하려면:

```bash
# 1. QuestDB 제거
kubectl delete statefulset questdb -n bonanza-index
kubectl delete pvc questdb-data-questdb-0 -n bonanza-index

# 2. ZFSVolume 제거
kubectl delete zfsvolume --all -A

# 3. StorageClass 제거
kubectl delete storageclass zfs zfs-openebs

# 4. ZFSNode 제거
kubectl delete zfsnode --all

# 5. Helm Operator 제거
helm uninstall zfs-localpv -n openebs

# 6. CRD 제거
kubectl delete crd zfsvolumes.zfs.openebs.io
kubectl delete crd zfsbackups.zfs.openebs.io
kubectl delete crd zfsrestores.zfs.openebs.io
kubectl delete crd zfsnodes.zfs.openebs.io

# 7. CSIDriver 제거
kubectl delete csidriver zfs.csi.openebs.io
```

**주의사항:**
- ZFS 풀(bonanza)은 호스트에 남아있습니다. 필요시 `sudo zpool destroy bonanza`로 제거하세요.
- 데이터 백업이 필요한 경우 제거 전에 백업을 수행하세요.

---

## ZFS 풀 생성

### 방법 1: 디스크 기반 풀 생성 (권장)

```bash
# 사용 가능한 디스크 확인
lsblk

# ZFS 풀 생성 (예: /dev/sdb 사용)
sudo zpool create bonanza /dev/sdb

# 풀 확인
zpool list bonanza
zfs list bonanza
```

### 방법 2: 파일 기반 풀 생성 (테스트용)

**루프 디바이스란?** 파일을 블록 디바이스처럼 사용할 수 있게 해주는 가상 디바이스입니다. 자세한 내용은 [LOOP_DEVICE_EXPLAINED.md](./LOOP_DEVICE_EXPLAINED.md)를 참조하세요.

#### 자동 스크립트 사용 (권장)

```bash
chmod +x k8s/zfs/create-file-pool.sh
./k8s/zfs/create-file-pool.sh
```

이 스크립트는 사용 가능한 루프 디바이스를 자동으로 찾아서 사용합니다.

#### 수동 생성

```bash
# 디렉토리 생성
sudo mkdir -p /var/lib/zfs-pool

# 파일 생성 (200GB)
sudo truncate -s 200G /var/lib/zfs-pool/zfs-pool.img

# 사용 가능한 루프 디바이스 찾기
for i in {0..7}; do
    if ! losetup -a | grep -q "/dev/loop$i"; then
        LOOP_DEV="/dev/loop$i"
        echo "사용 가능: $LOOP_DEV"
        break
    fi
done

# 루프 디바이스 생성 (예: loop1 사용)
sudo losetup $LOOP_DEV /var/lib/zfs-pool/zfs-pool.img

sudo losetup $LOOP_DEV /var/lib/zfs-pool/zfs-pool.img

# ZFS 풀 생성
sudo zpool create bonanza $LOOP_DEV

# 풀 확인
zpool list bonanza
```

**주의사항:**
- 프로덕션 환경에서는 실제 디스크를 사용하는 것을 권장합니다.
- 파일 기반 풀은 성능이 낮을 수 있습니다 (약 10-30% 저하).
- `/dev/loop0`이 이미 사용 중이면 다른 루프 디바이스(loop1, loop2 등)를 사용하세요.

---

## Helm 설치

OpenEBS ZFS Operator는 Helm을 통해 설치하는 것이 가장 안정적입니다.

```bash
# Helm 설치 (Ubuntu/Debian)
sudo snap install helm --classic

# 또는 직접 다운로드
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Helm 버전 확인
helm version
```

---

## OpenEBS ZFS Operator 설치

### 1. Helm 저장소 추가

```bash
helm repo add openebs-zfs https://openebs.github.io/zfs-localpv
helm repo update
```

### 2. Operator 설치

```bash
helm install zfs-localpv openebs-zfs/zfs-localpv \
  --namespace openebs \
  --create-namespace
```

### 3. 설치 확인

```bash
# Operator Pod 상태 확인
kubectl get pods -n openebs -l role=openebs-zfs

# 예상 출력:
# NAME                              READY   STATUS    RESTARTS   AGE
# openebs-zfs-controller-xxx        2/2     Running   0          1m
# openebs-zfs-node-xxx              1/1     Running   0          1m
```

모든 Pod가 `Running` 상태가 될 때까지 대기합니다.

### 4. CRD 확인

OpenEBS ZFS Operator 설치 시 CRD가 자동으로 설치되어야 합니다. 다음 명령어로 확인:

```bash
# ZFS 관련 CRD 확인
kubectl get crd | grep zfs

# 예상 출력:
# zfsbackups.zfs.openebs.io     2025-11-27T16:00:00Z
# zfsnodes.zfs.openebs.io        2025-11-27T16:00:00Z
# zfsrestores.zfs.openebs.io     2025-11-27T16:00:00Z
# zfsvolumes.zfs.openebs.io      2025-11-27T16:00:00Z
```

**중요:** `zfsvolumes.zfs.openebs.io` CRD가 없으면 PVC가 Pending 상태로 유지됩니다.

### 5. CRD 수동 설치 (필요한 경우)

Helm 설치 후 CRD가 자동으로 설치되지 않는 경우, 수동으로 설치할 수 있습니다:

```bash
# CRD 파일 적용
kubectl apply -f k8s/zfs/crd.yaml

# CRD 확인
kubectl get crd | grep zfs
```

**CRD 파일 내용 (`k8s/zfs/crd.yaml`):**

```yaml
# OpenEBS ZFS CRD (Custom Resource Definitions)
# OpenEBS ZFS Local PV에 필요한 CRD

---
# ZFSNode CRD
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: zfsnodes.zfs.openebs.io
spec:
  group: zfs.openebs.io
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              poolName:
                type: string
              nodeID:
                type: string
          status:
            type: object
  scope: Cluster
  names:
    plural: zfsnodes
    singular: zfsnode
    kind: ZFSNode

---
# ZFSVolume CRD (필수)
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: zfsvolumes.zfs.openebs.io
spec:
  group: zfs.openebs.io
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              capacity:
                type: string
              ownerNodeID:
                type: string
              poolName:
                type: string
              volumeType:
                type: string
              fsType:
                type: string
          status:
            type: object
            properties:
              state:
                type: string
              nodeID:
                type: string
  scope: Namespaced
  names:
    plural: zfsvolumes
    singular: zfsvolume
    kind: ZFSVolume

---
# ZFSBackup CRD (선택사항)
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: zfsbackups.zfs.openebs.io
spec:
  group: zfs.openebs.io
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
  scope: Namespaced
  names:
    plural: zfsbackups
    singular: zfsbackup
    kind: ZFSBackup

---
# ZFSRestore CRD (선택사항)
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: zfsrestores.zfs.openebs.io
spec:
  group: zfs.openebs.io
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
  scope: Namespaced
  names:
    plural: zfsrestores
    singular: zfsrestore
    kind: ZFSRestore
```

**CRD 설치 후 Controller Pod 재시작:**

```bash
# Controller Pod 재시작 (CRD 인식)
kubectl delete pod -n openebs -l app=openebs-zfs-controller

# 재시작 확인
kubectl get pods -n openebs -l app=openebs-zfs-controller
```

---

## ZFSNode 리소스 생성

ZFSNode는 OpenEBS ZFS Operator의 Node Agent가 자동으로 생성하지만, 수동으로 생성할 수도 있습니다.

### 자동 생성 확인

```bash
# ZFSNode 리소스 확인
kubectl get zfsnode

# 자동 생성된 경우:
# NAME     POOLNAME   STATUS   AGE
# ubuntu   bonanza    Ready    1m
```

### 수동 생성 (필요한 경우)

**중요:** OpenEBS ZFS Operator의 CRD 스키마는 `spec` 필드가 없고, `pools` 배열이 최상위 레벨에 있어야 합니다. 각 풀에는 `name`, `uuid`, `used`, `free` 필드가 모두 필수입니다.

#### 방법 1: 자동 생성 스크립트 사용 (권장)

```bash
# ZFS 풀 정보를 자동으로 가져와서 ZFSNode 생성
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
POOL_NAME="bonanza"
POOL_UUID=$(zpool get -H -o value guid "$POOL_NAME" | head -1)
POOL_USED=$(zpool list -H -o alloc "$POOL_NAME" | sed 's/K$/Ki/; s/M$/Mi/; s/G$/Gi/; s/T$/Ti/; s/P$/Pi/; s/E$/Ei/')
POOL_FREE=$(zpool list -H -o free "$POOL_NAME" | sed 's/K$/Ki/; s/M$/Mi/; s/G$/Gi/; s/T$/Ti/; s/P$/Pi/; s/E$/Ei/')

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

#### 방법 2: YAML 파일 사용

1. ZFS 풀 정보 확인:
```bash
# ZFS 풀 목록 확인
zpool list bonanza

# ZFS 풀 UUID 확인
zpool get guid bonanza
```

2. `k8s/zfs/zfsnode.yaml` 파일 수정:
```yaml
apiVersion: zfs.openebs.io/v1
kind: ZFSNode
metadata:
  name: ubuntu  # 노드 이름으로 수정
pools:
  - name: bonanza
    uuid: "13388825031031991397"  # 실제 UUID로 수정
    used: "292Ki"  # zpool list의 ALLOC 값 (K->Ki, M->Mi, G->Gi로 변환)
    free: "150Gi"  # zpool list의 FREE 값 (K->Ki, M->Mi, G->Gi로 변환)
```

3. 적용:
```bash
kubectl apply -f k8s/zfs/zfsnode.yaml
```

**주의사항:**
- `used`와 `free` 값은 Kubernetes 리소스 형식을 사용해야 합니다 (`Ki`, `Mi`, `Gi` 등)
- ZFS의 `K`, `M`, `G` 형식을 `Ki`, `Mi`, `Gi`로 변환해야 합니다
- `uuid`는 `zpool get guid` 명령어로 확인할 수 있습니다

---

## StorageClass 생성

### 방법 1: 자동 생성 스크립트 사용 (권장)

```bash
chmod +x k8s/zfs/create-storageclass.sh
./k8s/zfs/create-storageclass.sh
```

이 스크립트는 다음을 자동으로 수행합니다:
- 노드 이름 자동 감지
- ZFSNode 존재 여부 확인
- 기존 StorageClass 확인 및 삭제 옵션 제공
- StorageClass 자동 생성

### 방법 2: kubectl 명령어로 직접 생성

```bash
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')

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
```

### 방법 3: YAML 파일 사용

```bash
# 1. 노드 이름 확인
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
echo "노드 이름: $NODE_NAME"

# 2. storageclass.yaml 파일에서 노드 이름 수정 (필요한 경우)
# allowedTopologies의 values에 노드 이름이 맞는지 확인

# 3. StorageClass 적용
kubectl apply -f k8s/zfs/storageclass.yaml
```

**참고:** 
- `storageclass.yaml` 파일의 StorageClass 이름은 `zfs-openebs`입니다.
- 노드 이름은 `allowedTopologies` 섹션에서 확인하고 필요시 수정하세요.
- StorageClass 이름은 모든 문서와 설정에서 일관되게 `zfs-openebs`를 사용합니다.

### StorageClass 확인

```bash
kubectl get storageclass zfs-openebs
kubectl describe storageclass zfs-openebs
```

---

## QuestDB 마이그레이션

### 1. 기존 QuestDB 상태 확인

```bash
# 현재 QuestDB Pod 및 PVC 확인
kubectl get pod questdb-0 -n bonanza-index
kubectl get pvc -n bonanza-index | grep questdb
```

### 2. ZFS 풀 용량 확인

```bash
# 호스트에서 실행
zpool list bonanza
zfs list bonanza

# 사용 가능한 용량 확인 (예: 193GB 사용 가능)
```

### 3. StatefulSet 수정

`k8s/questdb/statefulset.yaml` 파일에서 다음을 수정:

```yaml
volumeClaimTemplates:
- metadata:
    name: questdb-data
  spec:
    accessModes: ["ReadWriteOnce"]
    storageClassName: "zfs-openebs"  # local-path에서 변경
    resources:
      requests:
        storage: 150Gi  # ZFS 풀 용량에 맞게 조정
```

**중요:** 요청하는 스토리지 크기는 ZFS 풀의 사용 가능한 용량보다 작아야 합니다.

### 4. 마이그레이션 실행

**주의:** 이 과정은 기존 데이터를 삭제합니다. 데이터 백업이 필요한 경우 먼저 백업을 수행하세요.

```bash
# 1. 기존 StatefulSet 삭제
kubectl delete statefulset questdb -n bonanza-index

# 2. 기존 PVC 삭제 (데이터 손실 주의!)
kubectl delete pvc questdb-data-questdb-0 -n bonanza-index

# 3. 수정된 StatefulSet 적용
kubectl apply -f k8s/questdb/statefulset.yaml

# 4. 상태 확인
kubectl get pod questdb-0 -n bonanza-index -w
kubectl get pvc questdb-data-questdb-0 -n bonanza-index -w
```

### 5. 마이그레이션 확인

```bash
# Pod가 Running 상태가 되었는지 확인
kubectl get pod questdb-0 -n bonanza-index

# PVC가 Bound 상태가 되었는지 확인
kubectl get pvc questdb-data-questdb-0 -n bonanza-index

# ZFS 볼륨 생성 확인
kubectl get zfsvolume -n bonanza-index

# Pod 로그 확인
kubectl logs questdb-0 -n bonanza-index
```

---

## 검증

### 1. ZFS 볼륨 확인

```bash
# Kubernetes 리소스 확인
kubectl get zfsvolume -n bonanza-index

# 호스트에서 ZFS 데이터셋 확인
zfs list bonanza
```

### 2. QuestDB 동작 확인

```bash
# QuestDB 서비스 확인
kubectl get svc questdb-service -n bonanza-index

# Pod 내부에서 데이터 디렉토리 확인
kubectl exec -it questdb-0 -n bonanza-index -- ls -lh /var/lib/questdb
```

### 3. 성능 테스트 (선택사항)

```bash
# ZFS 풀 상태 확인
zpool status bonanza

# ZFS 데이터셋 통계 확인
zfs get all bonanza
```

---

## 트러블슈팅

### 문제 1: PVC가 Pending 상태로 유지됨

**원인:**
- ZFSNode가 생성되지 않았거나 Ready 상태가 아님
- StorageClass의 `allowedTopologies`가 노드와 일치하지 않음
- ZFS 풀 용량 부족

**해결 방법:**

```bash
# 1. ZFSNode 상태 확인
kubectl get zfsnode
kubectl describe zfsnode <node-name>

# 2. PVC 이벤트 확인
kubectl describe pvc questdb-data-questdb-0 -n bonanza-index

# 3. ZFS CSI Controller 로그 확인
kubectl logs -n openebs -l app=openebs-zfs-controller --tail=50

# 4. ZFS Node Driver 로그 확인
kubectl logs -n openebs -l app=openebs-zfs-node --tail=50
```

### 문제 2: "out of space" 오류

**원인:**
- 요청한 PVC 크기가 ZFS 풀의 사용 가능한 용량을 초과함

**해결 방법:**

```bash
# 1. ZFS 풀 용량 확인
zpool list bonanza

# 2. StatefulSet의 storage 요청을 줄임
# k8s/questdb/statefulset.yaml에서 storage 값을 수정

# 3. StatefulSet 및 PVC 재생성
kubectl delete statefulset questdb -n bonanza-index
kubectl delete pvc questdb-data-questdb-0 -n bonanza-index
kubectl apply -f k8s/questdb/statefulset.yaml
```

### 문제 3: ZFSNode가 자동 생성되지 않음

**원인:**
- Node Agent가 실행되지 않음
- RBAC 권한 부족

**해결 방법:**

```bash
# 1. Node Agent Pod 확인
kubectl get pods -n openebs -l app=openebs-zfs-node

# 2. Node Agent 로그 확인
kubectl logs -n openebs -l app=openebs-zfs-node --tail=50

# 3. 수동으로 ZFSNode 생성 (위의 "ZFSNode 리소스 생성" 섹션 참조)
#    주의: pools 배열에 uuid, used, free 필드가 모두 필요합니다.
```

### 문제 4: ZFSNode 생성 시 "unknown field spec" 오류

**원인:**
- OpenEBS ZFS Operator의 CRD 스키마에는 `spec` 필드가 없습니다.
- `pools` 배열이 최상위 레벨에 있어야 합니다.

**해결 방법:**

```bash
# 올바른 형식으로 생성 (spec 없이 pools를 최상위에)
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
POOL_UUID=$(zpool get -H -o value guid bonanza | head -1)
POOL_USED=$(zpool list -H -o alloc bonanza | sed 's/K$/Ki/; s/M$/Mi/; s/G$/Gi/')
POOL_FREE=$(zpool list -H -o free bonanza | sed 's/K$/Ki/; s/M$/Mi/; s/G$/Gi/')

cat <<EOF | kubectl apply -f -
apiVersion: zfs.openebs.io/v1
kind: ZFSNode
metadata:
  name: $NODE_NAME
pools:
  - name: bonanza
    uuid: "$POOL_UUID"
    used: "$POOL_USED"
    free: "$POOL_FREE"
EOF
```

### 문제 5: ZFSNode 생성 시 "pools[0].used: Invalid value" 오류

**원인:**
- `used`와 `free` 값의 형식이 올바르지 않음
- Kubernetes 리소스 형식(`Ki`, `Mi`, `Gi`)을 사용해야 함

**해결 방법:**

```bash
# ZFS의 K, M, G 형식을 Kubernetes 형식으로 변환
POOL_USED=$(zpool list -H -o alloc bonanza | sed 's/K$/Ki/; s/M$/Mi/; s/G$/Gi/')
POOL_FREE=$(zpool list -H -o free bonanza | sed 's/K$/Ki/; s/M$/Mi/; s/G$/Gi/')

# 변환된 값 확인
echo "Used: $POOL_USED"
echo "Free: $POOL_FREE"
```

### 문제 6: PVC가 Pending 상태로 유지되고 "get zfsvolumes.zfs.openebs.io" 오류 발생

**증상:**
```
Warning  ProvisioningFailed  failed to provision volume with StorageClass "zfs-openebs": 
rpc error: code = Internal desc = get node map failed : 
the server could not find the requested resource (get zfsvolumes.zfs.openebs.io)
```

**원인:**
- `zfsvolumes.zfs.openebs.io` CRD가 설치되지 않음
- Helm 설치 시 CRD가 자동으로 설치되지 않았을 수 있음

**해결 방법:**

```bash
# 1. CRD 확인
kubectl get crd zfsvolumes.zfs.openebs.io

# 2. CRD가 없으면 설치
kubectl apply -f k8s/zfs/crd.yaml

# 3. CRD 설치 확인
kubectl get crd | grep zfs

# 4. Controller Pod 재시작 (CRD 인식)
kubectl delete pod -n openebs -l app=openebs-zfs-controller

# 5. PVC 상태 확인 (자동으로 바인딩될 수 있음)
kubectl get pvc questdb-data-questdb-0 -n bonanza-index

# 6. 여전히 Pending이면 PVC 재생성
kubectl delete pvc questdb-data-questdb-0 -n bonanza-index
kubectl apply -f k8s/questdb/statefulset.yaml
```

### 문제 7: StorageClass의 volumeBindingMode 변경 불가

**원인:**
- StorageClass의 `volumeBindingMode`는 불변(immutable) 필드입니다.

**해결 방법:**

```bash
# 기존 StorageClass 삭제 후 재생성
kubectl delete storageclass zfs-openebs
kubectl apply -f k8s/zfs/storageclass.yaml
```

---

## 참고 자료

- [OpenEBS ZFS LocalPV 공식 문서](https://openebs.io/docs/user-guides/zfs-localpv)
- [ZFS 공식 문서](https://openzfs.org/wiki/Main_Page)
- [Kubernetes StorageClass 문서](https://kubernetes.io/docs/concepts/storage/storage-classes/)

---

## 요약

성공적인 설치 및 마이그레이션을 위한 체크리스트:

- [ ] ZFS 풀 생성 완료
- [ ] Helm 설치 완료
- [ ] OpenEBS ZFS Operator 설치 완료 (모든 Pod Running)
- [ ] ZFSNode 리소스 생성 완료 (Ready 상태)
- [ ] StorageClass 생성 완료
- [ ] QuestDB StatefulSet 수정 완료 (storageClassName: zfs-openebs)
- [ ] QuestDB PVC Bound 상태 확인
- [ ] QuestDB Pod Running 상태 확인
- [ ] ZFS 볼륨 생성 확인

---

**작성일:** 2025-11-28  
**최종 수정일:** 2025-11-28  
**버전:** 1.1

**변경 사항 (v1.1):**
- StorageClass 이름을 `zfs`에서 `zfs-openebs`로 통일
- `storageclass.yaml` 파일 업데이트
- StorageClass 생성 방법에 자동 스크립트 옵션 추가
- 메뉴얼 전반의 StorageClass 이름 일관성 개선

