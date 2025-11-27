# QuestDB ZFS Storage 마이그레이션 가이드

이 문서는 QuestDB를 기존 스토리지(`local-path`)에서 ZFS 스토리지(`zfs-openebs`)로 마이그레이션하는 과정을 설명합니다.

## 사전 요구사항

- [ZFS Storage 설치 완료](../zfs/INSTALLATION_GUIDE.md)
- `zfs-openebs` StorageClass 생성 완료
- ZFS 풀 용량 확인 완료

## 마이그레이션 전 확인사항

### 1. 현재 QuestDB 상태 확인

```bash
# Pod 상태 확인
kubectl get pod questdb-0 -n bonanza-index

# PVC 상태 확인
kubectl get pvc -n bonanza-index | grep questdb

# 현재 StorageClass 확인
kubectl get pvc questdb-data-questdb-0 -n bonanza-index -o jsonpath='{.spec.storageClassName}'
```

### 2. ZFS 풀 용량 확인

```bash
# 호스트에서 실행
zpool list bonanza
zfs list bonanza

# 사용 가능한 용량 확인 (예: 193GB 사용 가능)
# 요청할 PVC 크기는 이보다 작아야 합니다.
```

### 3. 데이터 백업 (선택사항)

**중요:** 마이그레이션 과정에서 기존 PVC가 삭제되므로 데이터가 손실됩니다. 필요한 경우 먼저 백업을 수행하세요.

```bash
# QuestDB 데이터 백업
kubectl exec -it questdb-0 -n bonanza-index -- tar czf /tmp/questdb-backup.tar.gz /var/lib/questdb

# 백업 파일을 호스트로 복사
kubectl cp bonanza-index/questdb-0:/tmp/questdb-backup.tar.gz ./questdb-backup.tar.gz
```

## 마이그레이션 단계

### 1. StatefulSet 수정

`k8s/questdb/statefulset.yaml` 파일을 열고 다음을 수정:

```yaml
volumeClaimTemplates:
- metadata:
    name: questdb-data
  spec:
    accessModes: ["ReadWriteOnce"]
    storageClassName: "zfs-openebs"  # "local-path"에서 변경
    resources:
      requests:
        storage: 150Gi  # ZFS 풀 용량에 맞게 조정 (사용 가능한 용량보다 작게)
```

**중요 사항:**
- `storageClassName`을 `zfs-openebs`로 변경
- `storage` 크기를 ZFS 풀의 사용 가능한 용량보다 작게 설정
- 예: 사용 가능한 용량이 193GB인 경우, 150Gi (약 161GB)로 설정

### 2. 기존 리소스 삭제

```bash
# 1. StatefulSet 삭제 (Pod도 함께 삭제됨)
kubectl delete statefulset questdb -n bonanza-index

# 2. 기존 PVC 삭제 (데이터 손실 주의!)
kubectl delete pvc questdb-data-questdb-0 -n bonanza-index

# 3. 삭제 확인
kubectl get pod questdb-0 -n bonanza-index  # NotFound 확인
kubectl get pvc questdb-data-questdb-0 -n bonanza-index  # NotFound 확인
```

### 3. 수정된 StatefulSet 적용

```bash
# StatefulSet 적용
kubectl apply -f k8s/questdb/statefulset.yaml

# 상태 모니터링
kubectl get pod questdb-0 -n bonanza-index -w
kubectl get pvc questdb-data-questdb-0 -n bonanza-index -w
```

### 4. 마이그레이션 확인

```bash
# Pod가 Running 상태가 되었는지 확인
kubectl get pod questdb-0 -n bonanza-index
# 예상 출력: questdb-0   1/1   Running   0   2m

# PVC가 Bound 상태가 되었는지 확인
kubectl get pvc questdb-data-questdb-0 -n bonanza-index
# 예상 출력: questdb-data-questdb-0   Bound   pvc-xxx   150Gi   RWO   zfs-openebs   2m

# ZFS 볼륨 생성 확인
kubectl get zfsvolume -n bonanza-index
# 예상 출력: pvc-xxx   bonanza   Ready   2m

# Pod 로그 확인 (정상 동작 확인)
kubectl logs questdb-0 -n bonanza-index --tail=50
```

### 5. 데이터 복원 (백업한 경우)

```bash
# 백업 파일을 Pod로 복사
kubectl cp ./questdb-backup.tar.gz bonanza-index/questdb-0:/tmp/questdb-backup.tar.gz

# Pod 내부에서 복원
kubectl exec -it questdb-0 -n bonanza-index -- bash
cd /var/lib/questdb
tar xzf /tmp/questdb-backup.tar.gz --strip-components=3

# Pod 재시작 (필요한 경우)
kubectl delete pod questdb-0 -n bonanza-index
```

## 검증

### 1. ZFS 볼륨 확인

```bash
# Kubernetes 리소스 확인
kubectl get zfsvolume -n bonanza-index
kubectl describe zfsvolume <volume-name> -n bonanza-index

# 호스트에서 ZFS 데이터셋 확인
zfs list bonanza
# 예상 출력: bonanza/pvc-xxx   150G  43G  107G  /var/lib/zfs/...
```

### 2. QuestDB 동작 확인

```bash
# QuestDB 서비스 확인
kubectl get svc questdb-service -n bonanza-index

# Pod 내부에서 데이터 디렉토리 확인
kubectl exec -it questdb-0 -n bonanza-index -- ls -lh /var/lib/questdb

# QuestDB API 확인 (포트 포워딩)
kubectl port-forward questdb-0 9000:9000 -n bonanza-index
# 브라우저에서 http://localhost:9000 접속
```

### 3. 성능 확인 (선택사항)

```bash
# ZFS 풀 상태 확인
zpool status bonanza

# ZFS 데이터셋 통계 확인
zfs get all bonanza/pvc-xxx
```

## 트러블슈팅

### 문제 1: PVC가 Pending 상태로 유지됨

**증상:**
```bash
kubectl get pvc questdb-data-questdb-0 -n bonanza-index
# 출력: questdb-data-questdb-0   Pending   zfs-openebs   <unset>   5m
```

**원인:**
- ZFSNode가 Ready 상태가 아님
- StorageClass의 `allowedTopologies`가 노드와 일치하지 않음
- ZFS 풀 용량 부족

**해결 방법:**

```bash
# 1. ZFSNode 상태 확인
kubectl get zfsnode
kubectl describe zfsnode <node-name>

# 2. PVC 이벤트 확인
kubectl describe pvc questdb-data-questdb-0 -n bonanza-index | grep -A 20 Events

# 3. ZFS CSI Controller 로그 확인
kubectl logs -n openebs -l app=openebs-zfs-controller --tail=50

# 4. ZFS 풀 용량 확인
zpool list bonanza
```

### 문제 2: "out of space" 오류

**증상:**
```bash
kubectl describe pvc questdb-data-questdb-0 -n bonanza-index | grep -i error
# 출력: zfs: volume creation failed ... out of space
```

**원인:**
- 요청한 PVC 크기가 ZFS 풀의 사용 가능한 용량을 초과함

**해결 방법:**

```bash
# 1. ZFS 풀 용량 확인
zpool list bonanza
# 사용 가능한 용량 확인 (예: 193GB)

# 2. StatefulSet의 storage 요청을 줄임
# k8s/questdb/statefulset.yaml에서 storage 값을 수정
# 예: 200Gi → 150Gi (사용 가능한 용량보다 작게)

# 3. StatefulSet 및 PVC 재생성
kubectl delete statefulset questdb -n bonanza-index
kubectl delete pvc questdb-data-questdb-0 -n bonanza-index
kubectl apply -f k8s/questdb/statefulset.yaml
```

### 문제 3: Pod가 시작되지 않음

**증상:**
```bash
kubectl get pod questdb-0 -n bonanza-index
# 출력: questdb-0   0/1   Pending   0   5m
```

**원인:**
- PVC가 아직 Bound 상태가 아님
- 노드 리소스 부족

**해결 방법:**

```bash
# 1. Pod 이벤트 확인
kubectl describe pod questdb-0 -n bonanza-index | grep -A 20 Events

# 2. PVC 상태 확인
kubectl get pvc questdb-data-questdb-0 -n bonanza-index

# 3. PVC가 Bound 상태가 될 때까지 대기
kubectl wait --for=condition=Bound pvc/questdb-data-questdb-0 -n bonanza-index --timeout=5m
```

## 롤백 (필요한 경우)

ZFS 스토리지로의 마이그레이션에 문제가 발생한 경우, 기존 `local-path` StorageClass로 롤백할 수 있습니다.

```bash
# 1. StatefulSet 수정 (storageClassName을 local-path로 변경)
# k8s/questdb/statefulset.yaml 편집

# 2. 기존 리소스 삭제
kubectl delete statefulset questdb -n bonanza-index
kubectl delete pvc questdb-data-questdb-0 -n bonanza-index

# 3. 수정된 StatefulSet 적용
kubectl apply -f k8s/questdb/statefulset.yaml
```

**주의:** 롤백 시에도 기존 데이터는 손실됩니다. 필요한 경우 백업을 먼저 수행하세요.

## 요약

성공적인 마이그레이션을 위한 체크리스트:

- [ ] ZFS Storage 설치 완료 확인
- [ ] ZFS 풀 용량 확인 및 적절한 PVC 크기 결정
- [ ] 데이터 백업 수행 (필요한 경우)
- [ ] StatefulSet 수정 (storageClassName: zfs-openebs, 적절한 storage 크기)
- [ ] 기존 StatefulSet 및 PVC 삭제
- [ ] 수정된 StatefulSet 적용
- [ ] Pod Running 상태 확인
- [ ] PVC Bound 상태 확인
- [ ] ZFS 볼륨 생성 확인
- [ ] QuestDB 정상 동작 확인

---

**작성일:** 2024-11-28  
**버전:** 1.0

