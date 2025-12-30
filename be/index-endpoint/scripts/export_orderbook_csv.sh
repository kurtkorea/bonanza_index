#!/bin/bash

# QuestDB에서 일자별 orderbook 데이터를 CSV로 내보내고 압축하는 스크립트
# 사용법: ./export_orderbook_csv.sh <시작일> <종료일> [테이블명] [출력디렉토리]
# 예시: ./export_orderbook_csv.sh 2025-11-01 2025-11-30 tb_order_book_units ./exports

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
TABLE_NAME="${3:-tb_order_book_units}"
OUTPUT_DIR="${4:-./exports}"

# 인자 확인
if [ $# -lt 2 ]; then
    echo -e "${RED}❌ 사용법: $0 <시작일> <종료일> [테이블명] [출력디렉토리]${NC}"
    echo -e "${YELLOW}예시: $0 2025-11-01 2025-11-30 tb_order_book_units ./exports${NC}"
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
echo -e "${CYAN}  QuestDB CSV 내보내기 스크립트${NC}"
echo -e "${CYAN}==========================================${NC}"
echo -e "${BLUE}QuestDB:${NC} ${GREEN}http://${QDB_HOST}:${QDB_PORT}${NC}"
echo -e "${BLUE}테이블:${NC} ${GREEN}${TABLE_NAME}${NC}"
echo -e "${BLUE}기간:${NC} ${GREEN}${START_DATE} ~ ${END_DATE}${NC}"
echo -e "${BLUE}출력 디렉토리:${NC} ${GREEN}${OUTPUT_DIR}${NC}"
echo ""

# 날짜 범위 계산
current_date=$(date -d "$START_DATE" +%Y-%m-%d)
end_date=$(date -d "$END_DATE" +%Y-%m-%d)
total_days=0
success_count=0
fail_count=0

# 전체 일수 계산
while [ "$current_date" != "$(date -d "$end_date +1 day" +%Y-%m-%d)" ]; do
    total_days=$((total_days + 1))
    current_date=$(date -d "$current_date +1 day" +%Y-%m-%d)
done

current_date=$(date -d "$START_DATE" +%Y-%m-%d)
day_index=0

echo -e "${CYAN}총 ${total_days}일 처리 시작...${NC}"
echo ""

# 각 일자별로 처리
while [ "$current_date" != "$(date -d "$end_date +1 day" +%Y-%m-%d)" ]; do
    day_index=$((day_index + 1))
    
    # 다음 날짜 계산
    next_date=$(date -d "$current_date +1 day" +%Y-%m-%d)
    
    # 파일명 생성 (YYYYMMDD 형식)
    date_string=$(date -d "$current_date" +%Y%m%d)
    csv_file="${OUTPUT_DIR}/${TABLE_NAME}_${date_string}.csv"
    gz_file="${OUTPUT_DIR}/${TABLE_NAME}_${date_string}.csv.gz"
    
    echo -e "${BLUE}[${day_index}/${total_days}]${NC} ${CYAN}${current_date}${NC} 처리 중..."
    
    # SQL 쿼리 생성
    # 주의: 테이블에 따라 컬럼명이 다를 수 있음 (ts 또는 createdAt)
    # tb_order_book_units는 ts 컬럼 사용
    if [ "$TABLE_NAME" = "tb_order_book_units" ]; then
        query="SELECT * FROM ${TABLE_NAME} WHERE ts >= '${current_date} 00:00:00' AND ts < '${next_date} 00:00:00' ORDER BY ts ASC"
    elif [ "$TABLE_NAME" = "tb_fkbrti_1sec" ]; then
        query="SELECT * FROM ${TABLE_NAME} WHERE createdAt >= '${current_date} 00:00:00' AND createdAt < '${next_date} 00:00:00' ORDER BY createdAt ASC"
    elif [ "$TABLE_NAME" = "tb_exchange_trade" ]; then
        query="SELECT * FROM ${TABLE_NAME} WHERE marketAt >= '${current_date} 00:00:00' AND marketAt < '${next_date} 00:00:00' ORDER BY marketAt ASC"
    else
        # 기본값: createdAt 사용
        query="SELECT * FROM ${TABLE_NAME} WHERE createdAt >= '${current_date} 00:00:00' AND createdAt < '${next_date} 00:00:00' ORDER BY createdAt ASC"
    fi
    
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
    
    echo ""
    
    # 다음 날짜로 이동
    current_date=$(date -d "$current_date +1 day" +%Y-%m-%d)
done

# 결과 요약
echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  처리 완료${NC}"
echo -e "${CYAN}==========================================${NC}"
echo -e "${BLUE}총 일수:${NC} ${total_days}"
echo -e "${GREEN}성공:${NC} ${success_count}"
echo -e "${RED}실패:${NC} ${fail_count}"
echo -e "${BLUE}출력 디렉토리:${NC} ${GREEN}${OUTPUT_DIR}${NC}"
echo ""

if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}✅ 모든 파일이 성공적으로 생성되었습니다.${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  일부 파일 생성에 실패했습니다.${NC}"
    exit 1
fi

