# 배포 문제 해결 가이드

## 🚨 일반적인 배포 문제

### 문제 1: ImagePullBackOff - 커스텀 이미지 문제

**증상:**
```
ImagePullBackOff
```

**원인:** 커스텀 이미지(`bonanza-index/*:latest`)가 Docker 레지스트리에 없습니다.

**해결 방법:**

#### 방법 A: 이미지 빌드 및 푸시 (권장)

```bash
# 각 서비스의 Dockerfile이 있는 디렉토리에서
cd be/index-calculator
docker build -t bonanza-index/index-calculator:latest .
docker push bonanza-index/index-calculator:latest

# 또는 로컬에서 사용하는 경우 (개발 환경)
docker build -t bonanza-index/index-calculator:latest .
docker save bonanza-index/index-calculator:latest | gzip > index-calculator.tar.gz

# 이미지를 각 노드에 로드
# 마스터/워커 노드에서:
docker load < index-calculator.tar.gz
```

#### 방법 B: 이미지 Pull 정책 변경 (임시 해결)

개발 환경에서 이미지를 로컬에서 사용하는 경우:

```yaml
# deployment.yaml에서
imagePullPolicy: IfNotPresent  # 또는 Never (로컬 이미지만 사용)
```

#### 방법 C: 이미지 이름 변경

실제 사용하는 이미지 이름으로 변경:

```yaml
# 예: Docker Hub의 이미지 사용
image: your-dockerhub-username/index-calculator:latest
```

### 문제 2: Pending - PVC 문제 (데이터베이스 Pod)

**증상:**
```
mariadb-0     0/1     Pending
questdb-0     0/1     Pending
redis-xxx     0/1     Pending
```

**원인:** PVC(PersistentVolumeClaim)가 Binding되지 않았습니다.

**진단:**

```bash
# PVC 상태 확인
kubectl get pvc -n bonanza-index

# StorageClass 확인
kubectl get storageclass

# PVC 상세 정보
kubectl describe pvc <pvc-name> -n bonanza-index

# Pod 이벤트 확인
kubectl describe pod mariadb-0 -n bonanza-index
```

**해결 방법:**

#### 방법 A: k3s 기본 StorageClass 사용

k3s는 기본적으로 `local-path` StorageClass를 제공합니다:

```bash
# StorageClass 확인
kubectl get storageclass

# local-path StorageClass 사용하도록 PVC 수정
# redis/pvc.yaml, questdb/pvc.yaml, mariadb/pvc.yaml에서:
# storageClassName: "" → storageClassName: "local-path"
```

#### 방법 B: PVC 파일 수정

각 PVC 파일에서 `storageClassName`을 명시적으로 설정:

```yaml
# redis/pvc.yaml, questdb/pvc.yaml 등에서
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: "local-path"  # 빈 문자열("") 대신 명시
  resources:
    requests:
      storage: 10Gi
```

#### 방법 C: local-path StorageClass 확인 및 생성

```bash
# StorageClass 확인
kubectl get storageclass

# 없으면 생성 (k3s는 보통 자동 생성)
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-path
provisioner: rancher.io/local-path
volumeBindingMode: WaitForFirstConsumer
EOF
```

### 문제 3: ErrImagePull - 공식 이미지 문제

**증상:**
```
nginx Pod가 ErrImagePull 상태
```

**원인:** 네트워크 문제 또는 이미지 이름 오타

**해결 방법:**

```bash
# 이미지 Pull 테스트
docker pull nginx:1.25-alpine

# Pod 이벤트 확인
kubectl describe pod nginx-xxx -n bonanza-index

# 이미지 이름 확인 (deployment.yaml)
# nginx:1.25-alpine이 맞는지 확인
```

## 🔍 문제 진단 명령어

### 전체 상태 확인

```bash
# 모든 문제 Pod 확인
kubectl get pods -n bonanza-index | grep -E "(Error|CrashLoopBackOff|Pending|ImagePull)"

# 문제 Pod 상세 정보
kubectl describe pod <pod-name> -n bonanza-index

# Pod 이벤트만 확인
kubectl get events -n bonanza-index --sort-by='.lastTimestamp'
```

### 이미지 문제 확인

```bash
# ImagePullBackOff인 Pod 확인
kubectl get pods -n bonanza-index -o json | jq '.items[] | select(.status.containerStatuses[].state.waiting.reason=="ImagePullBackOff") | {name: .metadata.name, image: .spec.containers[].image}'

# 이미지 Pull 시도
kubectl get pods <pod-name> -n bonanza-index -o jsonpath='{.spec.containers[*].image}' | xargs -I {} docker pull {}
```

### PVC 문제 확인

```bash
# 모든 PVC 상태
kubectl get pvc -n bonanza-index

# PVC 상세 정보
kubectl describe pvc <pvc-name> -n bonanza-index

# StorageClass 확인
kubectl get storageclass
```

## 🛠️ 빠른 해결 스크립트

### StorageClass 문제 해결

```bash
#!/bin/bash
# PVC 파일들의 storageClassName을 local-path로 변경
find k8s -name "*.yaml" -type f -exec grep -l "PersistentVolumeClaim\|storageClassName" {} \; | \
  xargs sed -i 's/storageClassName: ""/storageClassName: "local-path"/g'
```

### 이미지 Pull 정책 변경

```bash
#!/bin/bash
# 모든 deployment.yaml에서 imagePullPolicy를 IfNotPresent로 변경
find k8s -name "deployment.yaml" -type f -exec sed -i 's/imagePullPolicy: Always/imagePullPolicy: IfNotPresent/g' {} \;
```

## 📝 체크리스트

배포 전 확인사항:

- [ ] StorageClass 확인: `kubectl get storageclass`
- [ ] 이미지 확인: 모든 커스텀 이미지가 레지스트리에 있는지 확인
- [ ] 네트워크 확인: 노드 간 통신 확인
- [ ] 리소스 확인: 노드에 충분한 리소스(CPU, 메모리) 있는지 확인

## 🔗 추가 리소스

- [k3s Storage 가이드](https://docs.k3s.io/storage)
- [Kubernetes Troubleshooting](https://kubernetes.io/docs/tasks/debug/)

