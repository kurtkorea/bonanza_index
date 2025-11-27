# QuestDB를 ZFS StorageClass로 마이그레이션 가이드

## ⚠️ 주의사항

이 마이그레이션은 **데이터 손실**이 발생할 수 있습니다. 반드시 **데이터 백업**을 먼저 수행하세요.

## 마이그레이션 단계

### 1. 데이터 백업 (필수)

```bash
# QuestDB 데이터 백업
kubectl exec -n bonanza-index questdb-0 -- tar czf /tmp/questdb-backup.tar.gz /var/lib/questdb

# 백업 파일을 로컬로 복사
kubectl cp bonanza-index/questdb-0:/tmp/questdb-backup.tar.gz ./questdb-backup-$(date +%Y%m%d-%H%M%S).tar.gz

# 또는 PVC를 직접 백업
kubectl get pvc questdb-data-questdb-0 -n bonanza-index -o yaml > questdb-pvc-backup.yaml
```

### 2. 기존 StatefulSet 및 PVC 삭제

```bash
# StatefulSet 삭제 (Pod도 함께 삭제됨)
kubectl delete statefulset questdb -n bonanza-index

# PVC 삭제 (데이터 손실!)
kubectl delete pvc questdb-data-questdb-0 -n bonanza-index
```

### 3. ZFS StorageClass로 재배포

```bash
# StatefulSet 재배포 (이미 zfs StorageClass로 수정됨)
kubectl apply -f k8s/questdb/statefulset.yaml

# 또는 deploy-master.sh 사용
cd k8s/scripts
./deploy-master.sh
# 선택: 1 (questdb)
```

### 4. 데이터 복원 (필요한 경우)

```bash
# 새 Pod가 시작될 때까지 대기
kubectl wait --for=condition=ready pod/questdb-0 -n bonanza-index --timeout=300s

# 백업 파일을 Pod로 복사
kubectl cp ./questdb-backup-YYYYMMDD-HHMMSS.tar.gz bonanza-index/questdb-0:/tmp/

# 데이터 복원
kubectl exec -n bonanza-index questdb-0 -- tar xzf /tmp/questdb-backup-YYYYMMDD-HHMMSS.tar.gz -C /
```

## 확인

```bash
# PVC 확인 (StorageClass가 zfs인지 확인)
kubectl get pvc questdb-data-questdb-0 -n bonanza-index

# ZFSVolume 리소스 확인
kubectl get zfsvolume -n bonanza-index | grep questdb

# Pod 상태 확인
kubectl get pod questdb-0 -n bonanza-index

# QuestDB 접속 확인
kubectl port-forward -n bonanza-index questdb-0 9000:9000
# 브라우저에서 http://localhost:9000 접속
```

## 롤백 방법

문제가 발생하면 기존 StorageClass로 되돌릴 수 있습니다:

```bash
# StatefulSet의 storageClassName을 다시 "local-path"로 변경
# k8s/questdb/statefulset.yaml 수정 후:
kubectl delete statefulset questdb -n bonanza-index
kubectl delete pvc questdb-data-questdb-0 -n bonanza-index
kubectl apply -f k8s/questdb/statefulset.yaml
```

