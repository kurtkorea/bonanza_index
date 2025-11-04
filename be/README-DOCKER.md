# 백엔드 서비스 Docker 이미지 빌드 가이드

## 📋 개요

백엔드 서비스들은 Node.js 18 기반으로 작성되었으며, 각 서비스마다 Dockerfile이 제공됩니다.

## 🚀 빠른 시작

### 전체 서비스 한 번에 빌드

```bash
cd be
chmod +x build-images.sh
./build-images.sh
```

### 개별 서비스 빌드

```bash
cd be/<service-name>
docker build -t bonanza-index/<service-name>:latest .
```

## 📦 서비스 목록

빌드되는 서비스들:

1. **index-endpoint** - API 엔드포인트 서비스
2. **index-calculator** - 지수 계산 서비스
3. **orderbook-collector** - 오더북 수집 서비스
4. **ticker-collector** - 티커 수집 서비스
5. **orderbook-storage-worker** - 오더북 저장 워커
6. **ticker-storage-worker** - 티커 저장 워커
7. **orderbook-aggregator** - 오더북 집계 서비스
8. **telegram-log** - 텔레그램 로그 서비스

## 🔨 빌드 프로세스

각 Dockerfile은 다음 단계를 수행합니다:

1. **기본 이미지**: `node:18-alpine`
2. **의존성 설치**: `npm ci --only=production`
3. **소스 코드 복사**: 전체 소스 코드 복사
4. **빌드**: `npm run build` (Babel로 ES6+ 트랜스파일)
5. **실행**: `node dist/app.js`

### 특별한 경우

- **index-endpoint**: Swagger 문서 생성 추가 (`npm run swagger-prod`)

## 📝 이미지 이름 규칙

모든 이미지는 다음 형식을 따릅니다:

```
bonanza-index/<service-name>:latest
```

예:
- `bonanza-index/index-endpoint:latest`
- `bonanza-index/index-calculator:latest`

## 🚢 이미지 배포 방법

### 방법 1: Docker Save/Load (권장 - k3s 환경)

이미지를 tar 파일로 저장하고 각 노드에 로드:

```bash
# 이미지 저장
docker save bonanza-index/index-endpoint:latest | gzip > index-endpoint.tar.gz

# 각 Kubernetes 노드에서 로드
docker load < index-endpoint.tar.gz
```

### 방법 2: Docker Registry 사용

Docker Hub 또는 Private Registry에 푸시:

```bash
# 이미지 태그 설정
docker tag bonanza-index/index-endpoint:latest your-registry/bonanza-index/index-endpoint:latest

# 푸시
docker push your-registry/bonanza-index/index-endpoint:latest
```

그리고 deployment.yaml의 이미지 이름을 변경:
```yaml
image: your-registry/bonanza-index/index-endpoint:latest
```

## ⚙️ 빌드 전 체크리스트

- [ ] Docker가 설치되어 있는지 확인: `docker --version`
- [ ] Docker daemon이 실행 중인지 확인: `docker info`
- [ ] 각 서비스의 `package.json`과 `package-lock.json`이 있는지 확인
- [ ] 각 서비스의 소스 코드가 완전한지 확인
- [ ] `npm run build` 스크립트가 `package.json`에 정의되어 있는지 확인

## 🔍 빌드 문제 해결

### 오류 1: Docker daemon 연결 실패

```
Cannot connect to the Docker daemon
```

**해결 방법:**
```bash
# Docker 서비스 시작
sudo systemctl start docker

# 사용자를 docker 그룹에 추가
sudo usermod -aG docker $USER

# 로그아웃 후 다시 로그인 또는
newgrp docker
```

### 오류 2: npm 빌드 실패

```
npm ERR! code ...
```

**해결 방법:**
1. `package.json`과 `package-lock.json` 확인
2. 로컬에서 `npm install` 실행하여 의존성 확인
3. `npm run build` 로컬에서 실행하여 빌드 스크립트 확인

### 오류 3: 소스 코드 누락

```
COPY failed: file not found
```

**해결 방법:**
1. Dockerfile의 COPY 경로 확인
2. 필요한 파일이 모두 있는지 확인
3. `.dockerignore` 파일 확인 (있다면)

## 📋 빌드된 이미지 확인

```bash
# 모든 bonanza-index 이미지 확인
docker images | grep bonanza-index

# 특정 이미지 상세 정보
docker inspect bonanza-index/index-endpoint:latest
```

## 🎯 다음 단계

이미지 빌드 후:

1. **이미지를 각 노드에 로드** (k3s 환경인 경우)
2. **애플리케이션 배포**: `k8s/scripts/deploy-applications.sh`
3. **Pod 상태 확인**: `kubectl get pods -n bonanza-index`

## 📚 관련 문서

- [배포 가이드](../k8s/scripts/deploy-apps-guide.md)
- [문제 해결 가이드](../k8s/TROUBLESHOOTING.md)

