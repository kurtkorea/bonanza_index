# Index-Summary Docker 배포 가이드

`index-summary` 프로세스는 Docker로만 배포됩니다.

## 사전 요구사항

- Docker
- Docker Compose

## 빠른 시작

### 1. Docker Compose를 사용한 배포

```bash
# 프로젝트 루트 디렉토리에서
# index-summary 전용 docker-compose 파일 사용
docker-compose -f docker-compose.index-summary.yml up -d index-summary
```

### 2. 배포 스크립트 사용 (권장)

```bash
# 프로젝트 루트 디렉토리에서
./docker-index-summary.sh
```

스크립트를 실행하면 메뉴가 표시되며, 다음 작업을 수행할 수 있습니다:
- 빌드 (Build)
- 시작 (Start)
- 중지 (Stop)
- 재시작 (Restart)
- 상태 확인 (Status)
- 로그 확인 (Logs)
- 전체 재빌드 및 시작 (Rebuild & Start)

## 환경 변수 설정

환경 변수는 `be/index-summary/env/prod.env` 파일에서 설정합니다.

주요 환경 변수:
- `SUMMARY_ENABLED`: Summary 기능 활성화 여부 (기본값: `true`)
- `SUMMARY_SYMBOLS`: 처리할 심볼 목록 (쉼표로 구분, 기본값: `KRW-BTC`)
- `SUMMARY_INTERVAL_MS`: Summary 실행 간격 (밀리초, 기본값: `60000`)

## 로그 확인

### Docker Compose를 사용한 로그 확인

```bash
# 실시간 로그
docker-compose -f docker-compose.index-summary.yml logs -f index-summary

# 최근 100줄 로그
docker-compose -f docker-compose.index-summary.yml logs --tail=100 index-summary
```

### 로그 파일 확인

로그 파일은 `be/index-summary/logs/` 디렉토리에 저장됩니다 (Docker 볼륨 마운트).

## 상태 확인

```bash
# 컨테이너 상태 확인
docker-compose -f docker-compose.index-summary.yml ps index-summary

# 컨테이너 리소스 사용량 확인
docker stats index-summary
```

## 문제 해결

### 컨테이너가 시작되지 않는 경우

1. 로그 확인:
   ```bash
   docker-compose -f docker-compose.index-summary.yml logs index-summary
   ```

2. 환경 변수 확인:
   - `be/index-summary/env/prod.env` 파일이 올바르게 설정되어 있는지 확인
   - 데이터베이스 연결 정보가 올바른지 확인

3. 이미지 재빌드:
   ```bash
   docker-compose -f docker-compose.index-summary.yml build --no-cache index-summary
   docker-compose -f docker-compose.index-summary.yml up -d index-summary
   ```

### Health Check 실패

`index-summary`는 HTTP 서버가 없으므로 프로세스 체크를 사용합니다. 
Health check가 실패하는 경우, 컨테이너 내부에서 프로세스가 실행 중인지 확인:

```bash
docker exec index-summary ps aux | grep node
```

## 주의사항

- 이 서비스는 Kubernetes로 배포되지 않으며, Docker로만 배포됩니다.
- 프로덕션 환경에서는 `prod.env` 파일을 사용합니다.
- 개발 환경에서는 `dev.env` 파일을 사용합니다 (환경 변수 `NODE_ENV=dev` 설정 시).

