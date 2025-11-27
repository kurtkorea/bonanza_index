# ZFS Storage 설치 및 QuestDB 마이그레이션 가이드

이 문서는 Kubernetes 클러스터에 OpenEBS ZFS LocalPV를 설치하고 QuestDB를 ZFS 스토리지로 마이그레이션하는 과정을 설명합니다.

## 목차

1. [사전 요구사항](#사전-요구사항)
2. [ZFS 풀 생성](#zfs-풀-생성)
3. [Helm 설치](#helm-설치)
4. [OpenEBS ZFS Operator 설치](#openebs-zfs-operator-설치)
5. [ZFSNode 리소스 생성](#zfsnode-리소스-생성)
6. [StorageClass 생성](#storageclass-생성)
7. [QuestDB 마이그레이션](#questdb-마이그레이션)
8. [검증](#검증)
9. [트러블슈팅](#트러블슈팅)

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

```bash
# 디렉토리 생성
sudo mkdir -p /var/lib/zfs-pool

# 파일 생성 (200GB)
sudo truncate -s 200G /var/lib/zfs-pool/zfs-pool.img

# 루프 디바이스 생성
sudo losetup /dev/loop0 /var/lib/zfs-pool/zfs-pool.img

# ZFS 풀 생성
sudo zpool create bonanza /dev/loop0

# 풀 확인
zpool list bonanza
```

**주의사항:**
- 프로덕션 환경에서는 실제 디스크를 사용하는 것을 권장합니다.
- 파일 기반 풀은 성능이 낮을 수 있습니다.

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

노드 이름 확인:
```bash
kubectl get nodes
```

ZFSNode 생성:
```bash
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
echo "Node: $NODE_NAME"

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

또는 `k8s/zfs/zfsnode.yaml` 파일 사용:
```bash
# 노드 이름에 맞게 수정 후
kubectl apply -f k8s/zfs/zfsnode.yaml
```

---

## StorageClass 생성

### StorageClass 생성

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

또는 `k8s/zfs/storageclass.yaml` 파일 사용:
```bash
# 노드 이름에 맞게 수정 후
kubectl apply -f k8s/zfs/storageclass.yaml
```

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
```

### 문제 4: StorageClass의 volumeBindingMode 변경 불가

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

**작성일:** 2024-11-28  
**버전:** 1.0

