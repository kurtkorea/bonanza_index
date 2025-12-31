#!/bin/bash

# batch.js를 실행하는 wrapper 스크립트
# crontab에서 사용하기 위한 스크립트

# 스크립트 디렉토리로 이동
cd "$(dirname "$0")" || exit 1

# 로그 디렉토리 생성
LOG_DIR="./logs"
mkdir -p "$LOG_DIR"

# Node.js 경로 확인 (which node 또는 which nodejs)
NODE_CMD=$(which node 2>/dev/null || which nodejs 2>/dev/null)

if [ -z "$NODE_CMD" ]; then
    echo "ERROR: node 명령어를 찾을 수 없습니다." >&2
    exit 1
fi

# 환경 변수 설정 (필요한 경우)
# export PATH=/usr/local/bin:/usr/bin:/bin
# export NODE_ENV=production

# 스크립트 실행
# 인자: 테이블명, MinIO 폴더명
TABLE_NAME="${1:-tb_fkbrti_1sec}"
MINIO_FOLDER="${2:-fkbrti}"

# 로그 파일명 (날짜 포함)
LOG_FILE="$LOG_DIR/daily_${TABLE_NAME}_$(date +%Y%m%d).log"

# 실행
"$NODE_CMD" batch.js "$TABLE_NAME" "$MINIO_FOLDER" >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: batch.js 실행 실패 (exit code: $EXIT_CODE)" >> "$LOG_FILE"
    exit $EXIT_CODE
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - SUCCESS: batch.js 실행 완료" >> "$LOG_FILE"

