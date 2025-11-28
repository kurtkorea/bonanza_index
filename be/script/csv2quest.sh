#!/usr/bin/env bash
set -euo pipefail

####################################
# 설정 영역
####################################

# QuestDB ILP 설정
QDB_ILP_HOST="${QDB_ILP_HOST:-127.0.0.1}"
QDB_ILP_PORT="${QDB_ILP_PORT:-9009}"
QDB_HTTP_HOST="${QDB_HTTP_HOST:-${QDB_HOST:-127.0.0.1}}"
QDB_HTTP_PORT="${QDB_HTTP_PORT:-${QDB_PORT:-9000}}"
BATCH_SIZE="${BATCH_SIZE:-1000}"
TABLE_NAME="${TABLE_NAME:-tb_order_book_temp}"

# CSV 파일 경로 (명령줄 인자 또는 환경 변수)
CSV_FILE="${1:-${CSV_FILE:-}}"

if [ -z "${CSV_FILE}" ]; then
  echo "Usage: $0 <csv_file_path>"
  echo "   or: CSV_FILE=<path> $0"
  exit 1
fi

if [ ! -f "${CSV_FILE}" ]; then
  echo "Error: File not found: ${CSV_FILE}"
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
  # 숫자가 아니면 0으로 변환
  if ! [[ "$val" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
    val=0
  fi
  echo "$val"
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
  
  # CSV 컬럼: tran_date, tran_time, exchange_price_id, product_id, order_tp, price, size
  local tran_date="${fields[0]//\"/}"
  local tran_time="${fields[1]//\"/}"
  local exchange_price_id="${fields[2]//\"/}"
  local product_id="${fields[3]//\"/}"
  local order_tp="${fields[4]//\"/}"
  local price="${fields[5]//\"/}"
  local size="${fields[6]//\"/}"
  
  # 공백 제거
  tran_date=$(echo "$tran_date" | xargs)
  tran_time=$(echo "$tran_time" | xargs)
  exchange_price_id=$(echo "$exchange_price_id" | xargs)
  product_id=$(echo "$product_id" | xargs)
  order_tp=$(echo "$order_tp" | xargs)
  price=$(echo "$price" | xargs)
  size=$(echo "$size" | xargs)
  
  # exchange_price_id에서 exchange_cd와 price_id 추출
  # 예: E0010001 -> exchange_cd=E001, price_id=0001 (또는 1)
  local exchange_cd=""
  local price_id=""
  
  if [ -n "$exchange_price_id" ]; then
    # E0010001 형식에서 앞부분이 exchange_cd, 뒷부분이 price_id로 추정
    # 최소 4자리 이상이면 앞 4자리를 exchange_cd로, 나머지를 price_id로
    if [ ${#exchange_price_id} -ge 4 ]; then
      exchange_cd="${exchange_price_id:0:4}"
      price_id="${exchange_price_id:4}"
      # price_id가 비어있으면 0으로 설정
      if [ -z "$price_id" ]; then
        price_id="0"
      fi
    else
      exchange_cd="$exchange_price_id"
      price_id="0"
    fi
  fi
  
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
  
  # dbAt: 현재 시간 (DB 저장 시각)
  local db_at_sec=$(date +%s)
  local db_at_micros="${db_at_sec}000000t"
  
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
  field_parts+=("price=$(float_field "$price")")
  field_parts+=("size=$(float_field "$size")")
  field_parts+=("marketAt=${market_at_micros}")
  field_parts+=("dbAt=${db_at_micros}")
  
  local fields=$(IFS=','; echo "${field_parts[*]}")
  echo "${TABLE_NAME},${tags} ${fields} ${market_at_ns}"
}

####################################
# 메인 처리
####################################

echo "[$(date '+%F %T')] Starting CSV import to QuestDB"
echo "[$(date '+%F %T')] CSV file: ${CSV_FILE}"
echo "[$(date '+%F %T')] QuestDB ILP: ${QDB_ILP_HOST}:${QDB_ILP_PORT}"
echo "[$(date '+%F %T')] QuestDB HTTP: ${QDB_HTTP_HOST}:${QDB_HTTP_PORT}"
echo "[$(date '+%F %T')] Target table: ${TABLE_NAME}"
echo "[$(date '+%F %T')] Batch size: ${BATCH_SIZE}"

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
  
  # curl의 --data-urlencode 사용 (더 안전함)
  if curl -sS --connect-timeout 5 --max-time 10 \
    -G \
    --data-urlencode "query=${CREATE_TABLE_QUERY}" \
    "http://${QDB_HTTP_HOST}:${QDB_HTTP_PORT}/exec" > /dev/null 2>&1; then
    echo "[$(date '+%F %T')] Table ${TABLE_NAME} ensured"
  else
    echo "[$(date '+%F %T')] WARNING: Failed to create table (may already exist), continuing..."
  fi
else
  echo "[$(date '+%F %T')] WARNING: curl not found, skipping table creation check"
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

# CSV 파일 읽기 (gzip 압축 해제 포함)
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
    local line_count=0
    local skipped_count=0
    local batch_buffer=""
    local is_first_line=true
    
    while IFS= read -r line || [ -n "$line" ]; do
      # 헤더 라인 스킵
      if [ "$is_first_line" = true ]; then
        is_first_line=false
        if echo "$line" | grep -qiE "(tran_date|exchange_price_id)"; then
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
    echo "[$(date '+%F %T')] Import completed!"
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
    
    local line_count=0
    local skipped_count=0
    local batch_buffer=""
    local is_first_line=true
    
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
    echo "[$(date '+%F %T')] Import completed!"
    echo "[$(date '+%F %T')] Total lines processed: ${line_count}"
    echo "[$(date '+%F %T')] Skipped lines: ${skipped_count}"
  }
fi

echo "[$(date '+%F %T')] Done"

