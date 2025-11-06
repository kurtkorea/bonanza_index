# 노드 설정 가이드

## 📋 노드 구조

- **마스터 노드** (121.88.4.53): Linux 서버
  - QuestDB, Redis, MariaDB Pod 실행
  - 자동으로 `node-role.kubernetes.io/control-plane=true` 라벨 설정됨

- **워커 노드** (121.88.4.57): Windows WSL 서버
  - 모든 애플리케이션 Pod 실행
  - `app-server=true` 라벨 필요

## 🏷️ 워커 노드 라벨 설정

### 자동 설정

```bash
# 배포 스크립트가 자동으로 처리
./k8s/deploy-with-node-setup.sh
```

### 수동 설정

```bash
# 노드 확인
kubectl get nodes -o wide

# 워커 노드 찾기 (121.88.4.57)
kubectl get nodes -o wide | grep 121.88.4.57

# 워커 노드에 라벨 추가 (노드 이름은 실제 값으로 변경)
kubectl label nodes <node-name> app-server=true --overwrite

# 라벨 확인
kubectl get nodes --show-labels | grep app-server
```

## 🔍 마스터 노드 확인

```bash
# 마스터 노드 확인
kubectl get nodes --show-labels | grep -E "(master|control-plane)"

# 마스터 노드는 자동으로 다음 라벨을 가집니다:
# node-role.kubernetes.io/control-plane=true
```

## ✅ 설정 확인

```bash
# 모든 노드 확인
kubectl get nodes -o wide

# 노드 라벨 확인
kubectl get nodes --show-labels

# 노드별 Pod 배치 확인
kubectl get pods -n bonanza-index -o wide --sort-by=.spec.nodeName
```

## ⚠️ 주의사항

1. **워커 노드 라벨 필수**: `app-server=true` 라벨이 없으면 애플리케이션 Pod가 스케줄링되지 않습니다.

2. **마스터 노드 라벨**: 마스터 노드는 Kubernetes 설치 시 자동으로 라벨이 설정됩니다.

3. **노드 이름 확인**: 노드 이름은 클러스터 구성에 따라 다를 수 있습니다.

