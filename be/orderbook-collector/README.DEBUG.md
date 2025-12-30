# Docker 디버깅 가이드

## 개요

이 가이드는 `orderbook-collector`를 Docker로 실행하고 디버깅하는 방법을 설명합니다.

## 사전 요구사항

- Docker 및 Docker Compose 설치
- VS Code (선택사항, 디버깅용)

## 빠른 시작

### 1. 디버깅 모드로 실행

```bash
# 프로젝트 루트에서 실행
docker-compose -f docker-compose.debug.yml up --build
```

### 2. 로그 확인

```bash
# 실시간 로그 확인
docker-compose -f docker-compose.debug.yml logs -f orderbook-collector

# 특정 라인 수만 확인
docker-compose -f docker-compose.debug.yml logs --tail=100 orderbook-collector
```

### 3. 컨테이너 내부 접속

```bash
# 컨테이너 내부로 접속
docker exec -it orderbook-collector-debug sh

# 컨테이너 내부에서 실행 중인 프로세스 확인
docker exec -it orderbook-collector-debug ps aux

# 컨테이너 내부에서 Node.js 프로세스 확인
docker exec -it orderbook-collector-debug ps aux | grep node
```

## VS Code 디버깅 설정

### 1. `.vscode/launch.json` 생성

프로젝트 루트에 `.vscode/launch.json` 파일을 생성하고 다음 내용을 추가:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Docker: Attach to Node",
      "address": "localhost",
      "port": 9229,
      "localRoot": "${workspaceFolder}/be/orderbook-collector/src",
      "remoteRoot": "/app/src",
      "protocol": "inspector",
      "restart": true,
      "skipFiles": [
        "<node_internals>/**"
      ]
    }
  ]
}
```

### 2. 디버깅 시작

1. Docker 컨테이너 실행:
   ```bash
   docker-compose -f docker-compose.debug.yml up
   ```

2. VS Code에서 F5를 누르거나 "Run and Debug" 패널에서 "Docker: Attach to Node" 선택

3. 브레이크포인트 설정 후 디버깅 시작

## 환경 변수 설정

디버깅 모드에서는 `be/orderbook-collector/env/dev.env` 파일을 사용합니다.

주요 환경 변수:
- `REDIS_HOST`: Redis 호스트 (기본값: redis)
- `REDIS_PORT`: Redis 포트 (기본값: 6379)
- `ENABLE_LEADER_ELECTION`: 리더 선출 활성화 (기본값: true)
- `LEADER_KEY`: 리더십 키 (기본값: orderbook-collector:leader)
- `LEADER_LEASE_TIME`: 리더십 TTL (초, 기본값: 10)
- `PROCESS_ID`: 프로세스 ID

## 유용한 명령어

### 컨테이너 재시작

```bash
# 컨테이너 재시작
docker-compose -f docker-compose.debug.yml restart orderbook-collector

# 컨테이너 중지
docker-compose -f docker-compose.debug.yml stop orderbook-collector

# 컨테이너 시작
docker-compose -f docker-compose.debug.yml start orderbook-collector
```

### 로그 확인

```bash
# 모든 서비스 로그
docker-compose -f docker-compose.debug.yml logs

# 특정 서비스 로그
docker-compose -f docker-compose.debug.yml logs orderbook-collector

# 실시간 로그 (tail -f)
docker-compose -f docker-compose.debug.yml logs -f orderbook-collector
```

### 컨테이너 상태 확인

```bash
# 실행 중인 컨테이너 확인
docker-compose -f docker-compose.debug.yml ps

# 컨테이너 리소스 사용량 확인
docker stats orderbook-collector-debug
```

### 코드 변경 후 재시작

디버깅 모드에서는 `nodemon`이 자동으로 코드 변경을 감지하고 재시작합니다.
수동으로 재시작하려면:

```bash
docker-compose -f docker-compose.debug.yml restart orderbook-collector
```

## 네트워크 디버깅

### 포트 확인

```bash
# 컨테이너 포트 확인
docker port orderbook-collector-debug

# 네트워크 연결 확인
docker network inspect bonanza-network
```

### Health Check

```bash
# Health check 확인
curl http://localhost:6001/health

# 리더십 상태 확인
curl http://localhost:6001/api/leader/status
```

## Redis 디버깅

```bash
# Redis 클라이언트 접속
docker exec -it redis-debug redis-cli

# 리더십 키 확인
docker exec -it redis-debug redis-cli GET orderbook-collector:leader

# 모든 키 확인
docker exec -it redis-debug redis-cli KEYS "*"

# 리더십 키 TTL 확인
docker exec -it redis-debug redis-cli TTL orderbook-collector:leader
```

## 문제 해결

### 포트 충돌

포트가 이미 사용 중인 경우:

```bash
# 포트 사용 확인
netstat -ano | findstr :6001
netstat -ano | findstr :9229

# Windows에서 포트 사용 프로세스 종료
taskkill /PID <PID> /F
```

### 컨테이너가 시작되지 않음

```bash
# 컨테이너 로그 확인
docker-compose -f docker-compose.debug.yml logs orderbook-collector

# 컨테이너 상태 확인
docker-compose -f docker-compose.debug.yml ps -a
```

### 소스 코드 변경이 반영되지 않음

볼륨 마운트가 제대로 되었는지 확인:

```bash
# 컨테이너 내부에서 파일 확인
docker exec -it orderbook-collector-debug ls -la /app/src
```

## 프로덕션 모드로 전환

디버깅이 완료되면 프로덕션 모드로 전환:

```bash
# 프로덕션 모드 실행
docker-compose up --build
```

