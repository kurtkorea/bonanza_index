# ticker-collector 배포 안내

`ticker-collector`는 Kubernetes (k3s)로 배포됩니다.

## Kubernetes 배포 방법

```bash
# 워커 노드 배포 스크립트 사용
./k8s/scripts/deploy-worker.sh

# 또는 직접 배포
kubectl apply -f k8s/ticker-collector/
```

## Docker 배포 (선택사항)

개발/테스트 목적으로 Docker Compose를 사용할 수도 있습니다:

```bash
# Docker Compose를 사용한 빌드 및 시작
docker-compose up -d ticker-collector

# 또는 관리 스크립트 사용
./docker-collectors.sh
```

