#!/usr/bin/env bash

# 사용법: ./fix-sh.sh [디렉토리]
# 인자가 없으면 현재 디렉토리(.) 기준으로 실행

TARGET_DIR="${1:-.}"

# dos2unix 설치 여부 확인
if ! command -v dos2unix >/dev/null 2>&1; then
  echo "❌ dos2unix 명령을 찾을 수 없습니다. 먼저 설치해 주세요."
  echo "  예) Ubuntu/Debian: sudo apt-get install dos2unix"
  echo "      CentOS/Rocky:  sudo yum install dos2unix"
  exit 1
fi

# 모든 .sh 파일에 대해 실행권한 부여 + dos2unix 적용 (재귀)
find "$TARGET_DIR" -type f -name '*.sh' -print0 | while IFS= read -r -d '' file; do
  echo "▶ 처리중: $file"
  chmod +x "$file"
  dos2unix "$file"
done

echo "✅ 완료!"

