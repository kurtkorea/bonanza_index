#!/usr/bin/env bash
set -euo pipefail

####################################
# 설정 영역
####################################

# QuestDB 설정
# Kubernetes 외부 접속: NodePort 사용 (기본값)
#   - HTTP: nodePort 30091
#   - ILP: nodePort 30099
# Kubernetes 내부 접속: 서비스 이름 사용
#   - QDB_HTTP_HOST=questdb-service.bonanza-index.svc.cluster.local QDB_HTTP_PORT=9000
#   - QDB_ILP_HOST=questdb-service.bonanza-index.svc.cluster.local QDB_ILP_PORT=9009
# Port Forward 사용: 127.0.0.1
QDB_ILP_HOST="${QDB_ILP_HOST:-127.0.0.1}"
QDB_ILP_PORT="${QDB_ILP_PORT:-30099}"
QDB_HTTP_HOST="${QDB_HTTP_HOST:-${QDB_HOST:-127.0.0.1}}"
QDB_HTTP_PORT="${QDB_HTTP_PORT:-${QDB_PORT:-30091}}"
BATCH_SIZE="${BATCH_SIZE:-1000}"
TABLE_NAME="${TABLE_NAME:-tb_order_book_temp}"

# CSV 파일 경로 또는 폴더 (명령줄 인자 또는 환경 변수)
CSV_INPUT="${1:-${CSV_FILE:-./csv}}"

# CSV 파일 목록
CSV_FILES=()

if [ -d "${CSV_INPUT}" ]; then
  # 디렉토리인 경우: 모든 .csv 및 .csv.gz 파일 찾기
  echo "[$(date '+%F %T')] Scanning directory: ${CSV_INPUT}"
  while IFS= read -r -d '' file; do
    CSV_FILES+=("$file")
  done < <(find "${CSV_INPUT}" -maxdepth 1 -type f \( -name "*.csv" -o -name "*.csv.gz" \) -print0 2>/dev/null | sort -z)
  
  if [ ${#CSV_FILES[@]} -eq 0 ]; then
    echo "[$(date '+%F %T')] ERROR: No CSV files (.csv or .csv.gz) found in ${CSV_INPUT}"
    exit 1
  fi
  echo "[$(date '+%F %T')] Found ${#CSV_FILES[@]} CSV file(s) (.csv and .csv.gz)"
elif [ -f "${CSV_INPUT}" ]; then
  # 파일인 경우: 단일 파일 처리
  CSV_FILES=("${CSV_INPUT}")
  echo "[$(date '+%F %T')] Processing single file: ${CSV_INPUT}"
else
  echo "Usage: $0 [csv_file_path|csv_directory]"
  echo "   or: CSV_FILE=<path> $0"
  echo ""
  echo "Examples:"
  echo "  $0 ./csv                    # Process all .csv files in ./csv directory"
  echo "  $0 ./csv/file.csv          # Process single file"
  echo "  CSV_FILE=./csv $0          # Process all .csv files in ./csv directory"
  exit 1
fi

####################################
# 유틸리티 함수
####################################

# 태그/필드 값 이스케이프 (쉼표, 등호, 공백)
esc_tag() {
  echo "$1" | sed 's/[,= ]/\\&/g'
}

# 정수 필드 포맷
int_field() {
  local val="${1:-0}"
  # 숫자가 아니면 0으로 변환
  if ! [[ "$val" =~ ^-?[0-9]+$ ]]; then
    val=0
  fi
  echo "${val}i"
}

# 실수 필드 포맷
float_field() {
  local val="${1:-0}"
  # 빈 문자열이면 0으로 변환
  if [ -z "$val" ]; then
    echo "0"
    return
  fi
  # 공백 및 개행 문자 제거
  val=$(echo "$val" | xargs | tr -d '\r\n')
  # 빈 문자열이면 0 반환
  if [ -z "$val" ]; then
    echo "0"
    return
  fi
  # 숫자 형식 검증 (더 관대한 검증)
  # 정수: 123, -123
  # 소수: 123.456, -123.456, 0.01502638, .123
  # 지수: 1.23e-10, 1.23E+10
  if [[ "$val" =~ ^-?[0-9]+\.?[0-9]*([eE][+-]?[0-9]+)?$ ]] || [[ "$val" =~ ^-?\.[0-9]+([eE][+-]?[0-9]+)?$ ]]; then
    echo "$val"
  else
    # 숫자가 아니면 0 반환
    echo "0"
  fi
}

# 날짜/시간을 마이크로초 타임스탬프로 변환 (tran_date: YYYYMMDD, tran_time: HHMMSS)
# tran_time은 KST이므로 UTC로 변환하기 위해 9시간(32400초)을 뺍니다
ts_field_micros() {
  local date_str="$1"
  local time_str="$2"
  
  if [ -z "$date_str" ] || [ -z "$time_str" ]; then
    # 현재 시간 사용 (초 단위로 계산 후 마이크로초 변환)
    local now_sec=$(date +%s)
    echo "${now_sec}000000t"
    return
  fi
  
  # YYYYMMDD, HHMMSS -> ISO 8601 -> 마이크로초
  local year="${date_str:0:4}"
  local month="${date_str:4:2}"
  local day="${date_str:6:2}"
  local hour="${time_str:0:2}"
  local minute="${time_str:2:2}"
  local second="${time_str:4:2}"
  
  # ISO 8601 형식으로 변환 후 파싱 (KST로 가정, UTC로 변환)
  # KST는 UTC+9이므로 9시간(32400초)을 빼야 UTC가 됩니다
  local iso_string="${year}-${month}-${day}T${hour}:${minute}:${second}.000+09:00"
  
  # date 명령어로 파싱 (KST -> UTC 변환)
  if command -v date &> /dev/null; then
    local sec=0
    # GNU date 또는 BSD date
    if date --version &> /dev/null 2>&1; then
      # GNU date - KST 시간을 UTC로 변환
      sec=$(date -d "$iso_string" +%s 2>/dev/null)
      if [ $? -ne 0 ]; then
        # 타임존 파싱 실패 시 UTC로 파싱 후 32400초 빼기
        local utc_iso="${year}-${month}-${day}T${hour}:${minute}:${second}.000Z"
        sec=$(date -d "$utc_iso" +%s 2>/dev/null || date +%s)
        sec=$((sec - 32400))
      fi
    else
      # BSD date (macOS) - KST 시간을 UTC로 변환
      sec=$(date -j -f "%Y-%m-%dT%H:%M:%S.000%z" "$iso_string" +%s 2>/dev/null)
      if [ $? -ne 0 ]; then
        # 타임존 파싱 실패 시 UTC로 파싱 후 32400초 빼기
        local utc_iso="${year}-${month}-${day}T${hour}:${minute}:${second}.000Z"
        sec=$(date -j -f "%Y-%m-%dT%H:%M:%S.000Z" "$utc_iso" +%s 2>/dev/null || date +%s)
        sec=$((sec - 32400))
      fi
    fi
    echo "${sec}000000t"
  else
    # date 명령어가 없으면 수동으로 계산
    # UTC로 파싱 후 32400초 빼기
    local utc_iso="${year}-${month}-${day}T${hour}:${minute}:${second}.000Z"
    if command -v python3 &> /dev/null; then
      sec=$(python3 -c "from datetime import datetime; dt = datetime.strptime('${year}-${month}-${day} ${hour}:${minute}:${second}', '%Y-%m-%d %H:%M:%S'); import time; print(int(time.mktime(dt.timetuple()) - 32400))" 2>/dev/null || date +%s)
    else
      # Python이 없으면 현재 시간에서 32400초 빼기 (근사치)
      local now_sec=$(date +%s)
      sec=$((now_sec - 32400))
    fi
    echo "${sec}000000t"
  fi
}

# 나노초 타임스탬프 변환 (디자인네이티드 타임스탬프용)
# tran_time은 KST이므로 UTC로 변환하기 위해 9시간(32400초)을 뺍니다
to_ns() {
  local date_str="$1"
  local time_str="$2"
  
  if [ -z "$date_str" ] || [ -z "$time_str" ]; then
    # 현재 시간 사용 (나노초)
    local now_sec=$(date +%s)
    echo "${now_sec}000000000"
    return
  fi
  
  local year="${date_str:0:4}"
  local month="${date_str:4:2}"
  local day="${date_str:6:2}"
  local hour="${time_str:0:2}"
  local minute="${time_str:2:2}"
  local second="${time_str:4:2}"
  
  # ISO 8601 형식으로 변환 (KST로 가정, UTC로 변환)
  # KST는 UTC+9이므로 9시간(32400초)을 빼야 UTC가 됩니다
  local iso_string="${year}-${month}-${day}T${hour}:${minute}:${second}.000+09:00"
  
  if command -v date &> /dev/null; then
    local sec=0
    if date --version &> /dev/null 2>&1; then
      # GNU date - KST 시간을 UTC로 변환
      sec=$(date -d "$iso_string" +%s 2>/dev/null)
      if [ $? -ne 0 ]; then
        # 타임존 파싱 실패 시 UTC로 파싱 후 32400초 빼기
        local utc_iso="${year}-${month}-${day}T${hour}:${minute}:${second}.000Z"
        sec=$(date -d "$utc_iso" +%s 2>/dev/null || date +%s)
        sec=$((sec - 32400))
      fi
    else
      # BSD date - KST 시간을 UTC로 변환
      sec=$(date -j -f "%Y-%m-%dT%H:%M:%S.000%z" "$iso_string" +%s 2>/dev/null)
      if [ $? -ne 0 ]; then
        # 타임존 파싱 실패 시 UTC로 파싱 후 32400초 빼기
        local utc_iso="${year}-${month}-${day}T${hour}:${minute}:${second}.000Z"
        sec=$(date -j -f "%Y-%m-%dT%H:%M:%S.000Z" "$utc_iso" +%s 2>/dev/null || date +%s)
        sec=$((sec - 32400))
      fi
    fi
    echo "${sec}000000000"
  else
    # date 명령어가 없으면 수동으로 계산
    # UTC로 파싱 후 32400초 빼기
    if command -v python3 &> /dev/null; then
      sec=$(python3 -c "from datetime import datetime; dt = datetime.strptime('${year}-${month}-${day} ${hour}:${minute}:${second}', '%Y-%m-%d %H:%M:%S'); import time; print(int(time.mktime(dt.timetuple()) - 32400))" 2>/dev/null || date +%s)
    else
      local now_sec=$(date +%s)
      sec=$((now_sec - 32400))
    fi
    echo "${sec}000000000"
  fi
}

# CSV 행을 ILP 형식으로 변환
csv_row_to_ilp() {
  local IFS=','
  read -ra fields <<< "$1"
  
  # CSV 컬럼: tran_date,tran_time,exchange_cd,price_id,product_id,order_tp,price,size
  # CSV 데이터: 20251001,090000,E0010001,1,13,A,162828000.0,0.01502638
  
  # CSV 필드 파싱 (8개 컬럼)
  # 개행 문자 제거 후 파싱
  local line_clean=$(echo "$1" | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  local IFS=','
  read -ra fields <<< "$line_clean"
  
  local tran_date="${fields[0]//\"/}"
  local tran_time="${fields[1]//\"/}"
  local exchange_cd="${fields[2]//\"/}"
  local price_id="${fields[3]//\"/}"
  local product_id="${fields[4]//\"/}"
  local order_tp="${fields[5]//\"/}"
  local price="${fields[6]//\"/}"
  local size="${fields[7]//\"/}"
  
  # 공백 및 개행 문자 제거
  tran_date=$(echo "$tran_date" | xargs | tr -d '\r\n')
  tran_time=$(echo "$tran_time" | xargs | tr -d '\r\n')
  exchange_cd=$(echo "$exchange_cd" | xargs | tr -d '\r\n')
  price_id=$(echo "$price_id" | xargs | tr -d '\r\n')
  product_id=$(echo "$product_id" | xargs | tr -d '\r\n')
  order_tp=$(echo "$order_tp" | xargs | tr -d '\r\n')
  price=$(echo "$price" | xargs | tr -d '\r\n')
  size=$(echo "$size" | xargs | tr -d '\r\n')
  
  # order_tp에서 숫자 부분만 추출 (예: "13 A" -> "13" 또는 "A"만 사용)
  # 공백으로 분리하여 첫 번째 부분 사용
  local order_tp_clean=$(echo "$order_tp" | awk '{print $1}')
  if [ -z "$order_tp_clean" ]; then
    order_tp_clean="$order_tp"
  fi
  
  # 필수 필드 검증
  if [ -z "$tran_date" ] || [ -z "$tran_time" ] || [ -z "$exchange_cd" ]; then
    return 1
  fi
  
  # marketAt: tran_date + tran_time을 조합한 타임스탬프 (KST -> UTC 변환)
  # 예: tran_date=20251001, tran_time=090000 -> 2025-10-01 09:00:00 KST -> UTC 타임스탬프
  local market_at_micros=$(ts_field_micros "$tran_date" "$tran_time")
  local market_at_ns=$(to_ns "$tran_date" "$tran_time")
  
  # collectorAt, dbAt: marketAt과 동일한 값 사용
  local collector_at_micros="${market_at_micros}"
  local db_at_micros="${market_at_micros}"
  
  local esc_exchange_cd=$(esc_tag "$exchange_cd")
  local esc_order_tp=$(esc_tag "$order_tp_clean")
  local esc_tran_date=$(esc_tag "$tran_date")
  local esc_tran_time=$(esc_tag "$tran_time")
  
  local tags="exchange_cd=${esc_exchange_cd},order_tp=${esc_order_tp}"
  local field_parts=()
  
  field_parts+=("tran_date=\"${esc_tran_date}\"")
  field_parts+=("tran_time=\"${esc_tran_time}\"")
  field_parts+=("price_id=$(int_field "$price_id")")
  field_parts+=("product_id=$(int_field "$product_id")")
  
  # price와 size 필드 검증 및 포맷팅
  local price_val=$(float_field "$price")
  local size_val=$(float_field "$size")
  
  field_parts+=("price=${price_val}")
  field_parts+=("size=${size_val}")
  field_parts+=("marketAt=${market_at_micros}")
  field_parts+=("collectorAt=${collector_at_micros}")
  field_parts+=("dbAt=${db_at_micros}")
  field_parts+=("diff_ms=0.0")
  field_parts+=("diff_ms_db=0.0")
  
  local fields=$(IFS=','; echo "${field_parts[*]}")
  echo "${TABLE_NAME},${tags} ${fields} ${market_at_ns}"
}

####################################
# 메인 처리
####################################

echo "[$(date '+%F %T')] Starting CSV import to QuestDB"
echo "[$(date '+%F %T')] QuestDB ILP: ${QDB_ILP_HOST}:${QDB_ILP_PORT}"
echo "[$(date '+%F %T')] QuestDB HTTP: ${QDB_HTTP_HOST}:${QDB_HTTP_PORT}"
echo "[$(date '+%F %T')] Target table: ${TABLE_NAME}"
echo "[$(date '+%F %T')] Batch size: ${BATCH_SIZE}"
echo "[$(date '+%F %T')] Found ${#CSV_FILES[@]} CSV file(s) to process"

# QuestDB 테이블 생성 확인
echo "[$(date '+%F %T')] Ensuring table ${TABLE_NAME} exists..."
CREATE_TABLE_SQL="CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
  tran_date       SYMBOL,
  tran_time       SYMBOL,
  exchange_cd     SYMBOL CAPACITY 1024,
  price_id        LONG,
  product_id      LONG,
  order_tp        SYMBOL CAPACITY 4,
  price           DOUBLE,
  size            DOUBLE,
  marketAt        TIMESTAMP,
  collectorAt    TIMESTAMP,
  dbAt            TIMESTAMP,
  diff_ms         DOUBLE,
  diff_ms_db      DOUBLE
) TIMESTAMP(marketAt)
  PARTITION BY DAY
  WAL;"

if command -v curl &> /dev/null; then
  # SQL을 한 줄로 변환하고 URL 인코딩
  CREATE_TABLE_QUERY=$(echo "$CREATE_TABLE_SQL" | tr -d '\n' | sed 's/  */ /g' | sed 's/^ *//' | sed 's/ *$//')
  
  # CREATE TABLE IF NOT EXISTS 실행 (이미 존재하면 무시됨)
  CREATE_RESPONSE=$(curl -sS --connect-timeout 5 --max-time 10 \
    -G \
    --data-urlencode "query=${CREATE_TABLE_QUERY}" \
    "http://${QDB_HTTP_HOST}:${QDB_HTTP_PORT}/exec" 2>&1)
  CURL_EXIT_CODE=$?
  
  if [ $CURL_EXIT_CODE -eq 0 ]; then
    # 응답에 에러가 있는지 확인
    if echo "$CREATE_RESPONSE" | grep -qiE "(error|exception|failed)"; then
      echo "[$(date '+%F %T')] WARNING: Table creation response contains error: ${CREATE_RESPONSE}"
      echo "[$(date '+%F %T')] Continuing anyway (table may already exist)..."
    else
      echo "[$(date '+%F %T')] Table ${TABLE_NAME} ensured (created or already exists)"
    fi
  else
    echo "[$(date '+%F %T')] ERROR: Failed to connect to QuestDB HTTP API"
    echo "[$(date '+%F %T')] Response: ${CREATE_RESPONSE}"
    echo "[$(date '+%F %T')] Continuing anyway (table may be created on first insert)..."
  fi
else
  echo "[$(date '+%F %T')] WARNING: curl not found, skipping table creation"
  echo "[$(date '+%F %T')] Table will be created automatically on first insert"
fi

# netcat 또는 /dev/tcp 사용 가능 여부 확인
USE_NC=false
USE_DEV_TCP=false

if command -v nc &> /dev/null; then
  USE_NC=true
  echo "[$(date '+%F %T')] Using netcat (nc) for TCP connection"
elif [ -c /dev/tcp ] || (exec 3<>/dev/tcp/${QDB_ILP_HOST}/${QDB_ILP_PORT} 2>/dev/null); then
  USE_DEV_TCP=true
  echo "[$(date '+%F %T')] Using /dev/tcp for TCP connection"
else
  echo "[$(date '+%F %T')] ERROR: Neither netcat (nc) nor /dev/tcp is available"
  echo "[$(date '+%F %T')] Please install netcat: sudo apt-get install netcat-openbsd (Ubuntu) or sudo yum install nc (CentOS)"
  exit 1
fi

# CSV 파일 처리 함수
process_csv_file() {
  local CSV_FILE="$1"
  local file_num="$2"
  local total_files="$3"
  
  echo ""
  echo "[$(date '+%F %T')] ========================================"
  echo "[$(date '+%F %T')] Processing file ${file_num}/${total_files}: ${CSV_FILE}"
  echo "[$(date '+%F %T')] ========================================"
  
  # CSV 파일 읽기 (gzip 압축 해제 포함)
  local CSV_INPUT=""
  if [[ "${CSV_FILE}" == *.gz ]]; then
    echo "[$(date '+%F %T')] Reading gzipped CSV file..."
    CSV_INPUT="gunzip -c ${CSV_FILE}"
  else
    echo "[$(date '+%F %T')] Reading CSV file..."
    CSV_INPUT="cat ${CSV_FILE}"
  fi
  
  # ILP 연결 및 데이터 전송
  if [ "$USE_NC" = true ]; then
  # netcat 사용
  {
    line_count=0
    skipped_count=0
    batch_buffer=""
    is_first_line=true
    
    while IFS= read -r line || [ -n "$line" ]; do
      # 헤더 라인 스킵
      if [ "$is_first_line" = true ]; then
        is_first_line=false
        if echo "$line" | grep -qiE "(tran_date|exchange_cd)"; then
          echo "[$(date '+%F %T')] Skipping header line"
          continue
        fi
      fi
      
      # ILP 라인 생성
      ilp_line=$(csv_row_to_ilp "$line" 2>/dev/null)
      if [ $? -ne 0 ] || [ -z "$ilp_line" ]; then
        skipped_count=$((skipped_count + 1))
        continue
      fi
      
      batch_buffer="${batch_buffer}${ilp_line}"$'\n'
      line_count=$((line_count + 1))
      
      # 배치 크기에 도달하면 전송
      if [ $((line_count % BATCH_SIZE)) -eq 0 ]; then
        echo -n "$batch_buffer" | nc -w 5 "${QDB_ILP_HOST}" "${QDB_ILP_PORT}" || {
          echo "[$(date '+%F %T')] ERROR: Failed to send data to QuestDB"
          exit 1
        }
        batch_buffer=""
        echo -ne "\r[$(date '+%F %T')] Processed: ${line_count} lines, Skipped: ${skipped_count}"
      fi
    done < <(eval "$CSV_INPUT")
    
    # 남은 배치 전송
    if [ -n "$batch_buffer" ]; then
      echo -n "$batch_buffer" | nc -w 5 "${QDB_ILP_HOST}" "${QDB_ILP_PORT}" || {
        echo "[$(date '+%F %T')] ERROR: Failed to send remaining data to QuestDB"
        exit 1
      }
    fi
    
    echo ""
    echo "[$(date '+%F %T')] File import completed: ${CSV_FILE}"
    echo "[$(date '+%F %T')] Total lines processed: ${line_count}"
    echo "[$(date '+%F %T')] Skipped lines: ${skipped_count}"
  }
elif [ "$USE_DEV_TCP" = true ]; then
  # /dev/tcp 사용
  {
    exec 3<>/dev/tcp/${QDB_ILP_HOST}/${QDB_ILP_PORT} || {
      echo "[$(date '+%F %T')] ERROR: Failed to connect to ${QDB_ILP_HOST}:${QDB_ILP_PORT}"
      exit 1
    }
    
    line_count=0
    skipped_count=0
    batch_buffer=""
    is_first_line=true
    
    while IFS= read -r line || [ -n "$line" ]; do
      if [ "$is_first_line" = true ]; then
        is_first_line=false
        if echo "$line" | grep -qi "tran_date"; then
          echo "[$(date '+%F %T')] Skipping header line"
          continue
        fi
      fi
      
      ilp_line=$(csv_row_to_ilp "$line" 2>/dev/null)
      if [ $? -ne 0 ] || [ -z "$ilp_line" ]; then
        skipped_count=$((skipped_count + 1))
        continue
      fi
      
      batch_buffer="${batch_buffer}${ilp_line}"$'\n'
      line_count=$((line_count + 1))
      
      if [ $((line_count % BATCH_SIZE)) -eq 0 ]; then
        echo -n "$batch_buffer" >&3
        batch_buffer=""
        echo -ne "\r[$(date '+%F %T')] Processed: ${line_count} lines, Skipped: ${skipped_count}"
      fi
    done < <(eval "$CSV_INPUT")
    
    if [ -n "$batch_buffer" ]; then
      echo -n "$batch_buffer" >&3
    fi
    
    exec 3>&-
    exec 3<&-
    
    echo ""
    echo "[$(date '+%F %T')] File import completed: ${CSV_FILE}"
    echo "[$(date '+%F %T')] Total lines processed: ${line_count}"
    echo "[$(date '+%F %T')] Skipped lines: ${skipped_count}"
  }
  fi
}

# 모든 CSV 파일 처리
total_files=${#CSV_FILES[@]}
file_num=0
total_lines_processed=0
total_lines_skipped=0

for CSV_FILE in "${CSV_FILES[@]}"; do
  file_num=$((file_num + 1))
  process_csv_file "${CSV_FILE}" "${file_num}" "${total_files}"
done

echo ""
echo "[$(date '+%F %T')] ========================================"
echo "[$(date '+%F %T')] All files processed!"
echo "[$(date '+%F %T')] Total files: ${total_files}"
echo "[$(date '+%F %T')] ========================================"
echo "[$(date '+%F %T')] Done"

