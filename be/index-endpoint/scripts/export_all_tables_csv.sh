#!/bin/bash

# QuestDB에서 여러 테이블의 일자별 데이터를 CSV로 내보내고 압축하는 스크립트
# 사용법: ./export_all_tables_csv.sh <시작일> <종료일> [출력디렉토리]
# 예시: ./export_all_tables_csv.sh 2025-11-01 2025-11-30 ./exports

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 기본값 설정
QDB_HOST="${QDB_HOST:-localhost}"
QDB_PORT="${QDB_PORT:-9000}"
OUTPUT_DIR="${3:-./exports}"

# MinIO 설정
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://130.162.133.208:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-bonanza}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-56tyghbn}"
MINIO_BUCKET="${MINIO_BUCKET:-bonanza-index}"
MINIO_UPLOAD_ENABLED="${MINIO_UPLOAD_ENABLED:-true}"

# 테이블 목록 및 컬럼명 매핑
declare -A TABLE_COLUMNS
TABLE_COLUMNS["tb_order_book_units"]="ts"
TABLE_COLUMNS["tb_fkbrti_1sec"]="createdAt"
TABLE_COLUMNS["tb_exchange_trade"]="marketAt"

# 인자 확인
if [ $# -lt 2 ]; then
    echo -e "${RED}❌ 사용법: $0 <시작일> <종료일> [출력디렉토리]${NC}"
    echo -e "${YELLOW}예시: $0 2025-11-01 2025-11-30 ./exports${NC}"
    exit 1
fi

START_DATE="$1"
END_DATE="$2"

# 날짜 형식 검증
if ! date -d "$START_DATE" >/dev/null 2>&1; then
    echo -e "${RED}❌ 잘못된 시작일 형식: $START_DATE (YYYY-MM-DD 형식 사용)${NC}"
    exit 1
fi

if ! date -d "$END_DATE" >/dev/null 2>&1; then
    echo -e "${RED}❌ 잘못된 종료일 형식: $END_DATE (YYYY-MM-DD 형식 사용)${NC}"
    exit 1
fi

# 출력 디렉토리 생성
mkdir -p "$OUTPUT_DIR"

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  QuestDB CSV 내보내기 스크립트 (전체 테이블)${NC}"
echo -e "${CYAN}==========================================${NC}"
echo -e "${BLUE}QuestDB:${NC} ${GREEN}http://${QDB_HOST}:${QDB_PORT}${NC}"
echo -e "${BLUE}기간:${NC} ${GREEN}${START_DATE} ~ ${END_DATE}${NC}"
echo -e "${BLUE}출력 디렉토리:${NC} ${GREEN}${OUTPUT_DIR}${NC}"
echo ""

# 각 테이블별로 처리
for table_name in "${!TABLE_COLUMNS[@]}"; do
    timestamp_column="${TABLE_COLUMNS[$table_name]}"
    
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}테이블: ${GREEN}${table_name}${NC} (컬럼: ${timestamp_column})${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # 테이블별 출력 디렉토리 생성
    table_output_dir="${OUTPUT_DIR}/${table_name}"
    mkdir -p "$table_output_dir"
    
    # 날짜 범위 계산
    current_date=$(date -d "$START_DATE" +%Y-%m-%d)
    end_date=$(date -d "$END_DATE" +%Y-%m-%d)
    total_days=0
    success_count=0
    fail_count=0
    
    # 전체 일수 계산
    temp_date="$current_date"
    while [ "$temp_date" != "$(date -d "$end_date +1 day" +%Y-%m-%d)" ]; do
        total_days=$((total_days + 1))
        temp_date=$(date -d "$temp_date +1 day" +%Y-%m-%d)
    done
    
    current_date=$(date -d "$START_DATE" +%Y-%m-%d)
    day_index=0
    
    # 각 일자별로 처리
    while [ "$current_date" != "$(date -d "$end_date +1 day" +%Y-%m-%d)" ]; do
        day_index=$((day_index + 1))
        
        # 다음 날짜 계산
        next_date=$(date -d "$current_date +1 day" +%Y-%m-%d)
        
        # 파일명 생성 (YYYYMMDD 형식)
        date_string=$(date -d "$current_date" +%Y%m%d)
        csv_file="${table_output_dir}/${table_name}_${date_string}.csv"
        gz_file="${table_output_dir}/${table_name}_${date_string}.csv.gz"
        
        echo -e "${BLUE}[${day_index}/${total_days}]${NC} ${CYAN}${current_date}${NC} 처리 중..."
        
        # SQL 쿼리 생성
        query="SELECT * FROM ${table_name} WHERE ${timestamp_column} >= '${current_date} 00:00:00' AND ${timestamp_column} < '${next_date} 00:00:00' ORDER BY ${timestamp_column} ASC"
        
        # QuestDB HTTP API로 CSV 다운로드 및 gzip 압축
        if curl -G "http://${QDB_HOST}:${QDB_PORT}/exec" \
            --data-urlencode "query=${query}" \
            -H "Accept: text/csv" \
            --silent \
            --show-error \
            --max-time 300 \
            -o "${csv_file}" 2>&1 | tee /tmp/curl_error.log; then
            
            # 파일이 비어있지 않은지 확인
            if [ ! -s "${csv_file}" ]; then
                echo -e "${YELLOW}  ⚠️  데이터 없음 (빈 파일)${NC}"
                rm -f "${csv_file}"
                fail_count=$((fail_count + 1))
            else
                # gzip 압축
                if gzip -f "${csv_file}"; then
                    file_size=$(du -h "${gz_file}" | cut -f1)
                    echo -e "${GREEN}  ✅ 완료${NC} - ${gz_file} (${file_size})"
                    success_count=$((success_count + 1))
                else
                    echo -e "${RED}  ❌ 압축 실패${NC}"
                    rm -f "${csv_file}"
                    fail_count=$((fail_count + 1))
                fi
            fi
        else
            echo -e "${RED}  ❌ 다운로드 실패${NC}"
            if [ -f "${csv_file}" ]; then
                rm -f "${csv_file}"
            fi
            fail_count=$((fail_count + 1))
        fi
        
        # 다음 날짜로 이동
        current_date=$(date -d "$current_date +1 day" +%Y-%m-%d)
    done
    
    # 테이블별 결과 요약
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}테이블: ${GREEN}${table_name}${NC} 처리 완료"
    echo -e "${BLUE}총 일수:${NC} ${total_days}"
    echo -e "${GREEN}성공:${NC} ${success_count}"
    echo -e "${RED}실패:${NC} ${fail_count}"
    echo ""
done

# 전체 결과 요약
echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  전체 처리 완료${NC}"
echo -e "${CYAN}==========================================${NC}"
echo -e "${BLUE}출력 디렉토리:${NC} ${GREEN}${OUTPUT_DIR}${NC}"
echo ""

# 생성된 파일 목록 표시
echo -e "${CYAN}생성된 파일 목록:${NC}"
find "$OUTPUT_DIR" -name "*.csv.gz" -type f | sort | while read file; do
    file_size=$(du -h "$file" | cut -f1)
    echo -e "  ${GREEN}${file}${NC} (${file_size})"
done

echo ""

# MinIO 업로드
if [ "$MINIO_UPLOAD_ENABLED" = "true" ]; then
    echo -e "${CYAN}==========================================${NC}"
    echo -e "${CYAN}  MinIO 업로드 시작${NC}"
    echo -e "${CYAN}==========================================${NC}"
    echo -e "${BLUE}MinIO Endpoint:${NC} ${GREEN}${MINIO_ENDPOINT}${NC}"
    echo -e "${BLUE}Bucket:${NC} ${GREEN}${MINIO_BUCKET}${NC}"
    echo ""
    
    # mc 클라이언트 확인
    if command -v mc &> /dev/null; then
        echo -e "${BLUE}MinIO 클라이언트 (mc) 사용${NC}"
        
        # MinIO alias 설정
        if ! mc alias set myminio "${MINIO_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" 2>/dev/null; then
            echo -e "${YELLOW}⚠️  MinIO alias 설정 실패, 직접 업로드 시도${NC}"
        fi
        
        # 각 파일 업로드 (서브셸 문제 해결을 위해 임시 파일 사용)
        temp_file=$(mktemp)
        find "$OUTPUT_DIR" -name "*.csv.gz" -type f | sort | while read file; do
            # 파일 경로에서 상대 경로 계산 (테이블명/파일명)
            relative_path="${file#$OUTPUT_DIR/}"
            object_path="exports/${relative_path}"
            
            echo -e "${BLUE}업로드 중:${NC} ${relative_path}..."
            
            if mc cp "${file}" "myminio/${MINIO_BUCKET}/${object_path}" 2>/dev/null; then
                echo -e "${GREEN}  ✅ 업로드 완료: ${object_path}${NC}"
                echo "SUCCESS" >> "$temp_file"
            else
                echo -e "${RED}  ❌ 업로드 실패: ${relative_path}${NC}"
                echo "FAIL" >> "$temp_file"
            fi
        done
        
        # 업로드 결과 집계
        upload_success=$(grep -c "SUCCESS" "$temp_file" 2>/dev/null || echo "0")
        upload_fail=$(grep -c "FAIL" "$temp_file" 2>/dev/null || echo "0")
        rm -f "$temp_file"
        
        # 업로드 결과 요약
        echo ""
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}MinIO 업로드 결과${NC}"
        echo -e "${GREEN}성공:${NC} ${upload_success}"
        echo -e "${RED}실패:${NC} ${upload_fail}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    else
        # mc가 없으면 Python 스크립트 사용
        echo -e "${BLUE}MinIO 클라이언트 (mc)가 없습니다. Python을 사용하여 업로드합니다.${NC}"
        
        # Python 스크립트로 업로드
        MINIO_ENDPOINT="${MINIO_ENDPOINT}" \
        MINIO_BUCKET="${MINIO_BUCKET}" \
        MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY}" \
        MINIO_SECRET_KEY="${MINIO_SECRET_KEY}" \
        OUTPUT_DIR="${OUTPUT_DIR}" \
        python3 << 'PYTHON_SCRIPT'
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

# MinIO 설정
MINIO_ENDPOINT = os.environ.get('MINIO_ENDPOINT', 'http://130.162.133.208:9000')
MINIO_BUCKET = os.environ.get('MINIO_BUCKET', 'bonanza-index')
MINIO_ACCESS_KEY = os.environ.get('MINIO_ACCESS_KEY', 'bonanza')
MINIO_SECRET_KEY = os.environ.get('MINIO_SECRET_KEY', '56tyghbn')
OUTPUT_DIR = os.environ.get('OUTPUT_DIR', './exports')

def upload_to_minio(file_path, endpoint, bucket, access_key, secret_key):
    """MinIO에 파일 업로드"""
    try:
        # minio 라이브러리 사용 시도
        try:
            from minio import Minio
            from minio.error import S3Error
            
            # MinIO 클라이언트 생성
            parsed = urlparse(endpoint)
            client = Minio(
                parsed.netloc,
                access_key=access_key,
                secret_key=secret_key,
                secure=(parsed.scheme == 'https')
            )
            
            # 파일 경로에서 상대 경로 계산
            relative_path = str(file_path).replace(OUTPUT_DIR + "/", "")
            object_path = f"exports/{relative_path}"
            
            # 파일 업로드
            client.fput_object(bucket, object_path, str(file_path))
            print(f"  ✅ 업로드 완료: {object_path}")
            return True
            
        except ImportError:
            # minio 라이브러리가 없으면 requests 사용 (AWS S3 호환 API)
            import requests
            import hmac
            import hashlib
            from datetime import datetime
            
            # 파일 경로에서 상대 경로 계산
            relative_path = str(file_path).replace(OUTPUT_DIR + "/", "")
            object_path = f"exports/{relative_path}"
            
            # MinIO URL 구성
            upload_url = f"{endpoint}/{bucket}/{object_path}"
            
            # 파일 읽기
            with open(file_path, 'rb') as f:
                file_data = f.read()
            
            # 간단한 인증 (MinIO는 기본 인증도 지원)
            # 실제로는 AWS Signature Version 4가 필요하지만, 
            # MinIO는 간단한 인증도 지원할 수 있음
            try:
                response = requests.put(
                    upload_url,
                    data=file_data,
                    auth=(access_key, secret_key),
                    headers={'Content-Type': 'application/gzip'},
                    timeout=300
                )
                
                if response.status_code in [200, 204]:
                    print(f"  ✅ 업로드 완료: {object_path}")
                    return True
                else:
                    print(f"  ❌ 업로드 실패: {relative_path} (HTTP {response.status_code})")
                    print(f"     응답: {response.text[:200]}")
                    return False
            except Exception as e:
                print(f"  ❌ 업로드 실패: {relative_path} - {str(e)}")
                return False
                
    except Exception as e:
        relative_path = str(file_path).replace(OUTPUT_DIR + "/", "")
        print(f"  ❌ 업로드 실패: {relative_path} - {str(e)}")
        return False

# 모든 .csv.gz 파일 찾기
output_dir = Path(OUTPUT_DIR)
files = sorted(output_dir.rglob("*.csv.gz"))

upload_success = 0
upload_fail = 0

for file_path in files:
    relative_path = str(file_path).replace(OUTPUT_DIR + "/", "")
    print(f"업로드 중: {relative_path}...")
    
    if upload_to_minio(
        str(file_path),
        MINIO_ENDPOINT,
        MINIO_BUCKET,
        MINIO_ACCESS_KEY,
        MINIO_SECRET_KEY
    ):
        upload_success += 1
    else:
        upload_fail += 1

print(f"\n업로드 완료: 성공 {upload_success}, 실패 {upload_fail}")
sys.exit(0 if upload_fail == 0 else 1)
PYTHON_SCRIPT
        
        upload_result=$?
        if [ $upload_result -eq 0 ]; then
            echo -e "${GREEN}✅ MinIO 업로드 완료${NC}"
        else
            echo -e "${YELLOW}⚠️  일부 파일 업로드 실패${NC}"
        fi
        
        echo ""
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}MinIO 업로드 완료${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    fi
    
    echo ""
fi

echo -e "${GREEN}✅ 모든 테이블 처리가 완료되었습니다.${NC}"

