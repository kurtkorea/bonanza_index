#!/usr/bin/env bash
set -euo pipefail

####################################
# 설정 영역
####################################

# QuestDB HTTP Endpoint
# 클러스터 외부 실행: localhost 또는 외부 IP + NodePort 사용
# 클러스터 내부 실행: 환경 변수로 QDB_HOST="questdb-service.bonanza-index.svc.cluster.local" QDB_PORT="9000" 설정
QDB_HOST="${QDB_HOST:-localhost}"
QDB_PORT="${QDB_PORT:-30091}"

# MinIO 설정
# 클러스터 외부 실행: localhost 또는 외부 IP + NodePort 사용
# 클러스터 내부 실행: 환경 변수로 MINIO_ENDPOINT="http://minio-service.bonanza-index.svc.cluster.local:9000" 설정
MINIO_ALIAS="bonanza-index"
MINIO_BUCKET="bonanza-index"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://localhost:30902}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-bonanza}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-56tyghbn}"

# MySQL 설정
# 클러스터 외부 실행: localhost 또는 외부 IP + NodePort 사용
# 클러스터 내부 실행: 환경 변수로 DB_HOST="mysql-service.bonanza-index.svc.cluster.local" DB_PORT="3306" 설정
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-30306}"
DB_SCHEME="${DB_SCHEME:-dayfin}"
DB_USERNAME="${DB_USERNAME:-bonanza}"
DB_PASSWORD="${DB_PASSWORD:-56tyghbn}"
DB_DIALECT="${DB_DIALECT:-mysql}"

# 로컬 임시 저장 디렉토리
OUT_DIR="/home/dayfin/batch/backup"

# KST 기준 내보낼 날짜 (기본: 어제, 포맷: YYYYMMDD)
# 수동으로 특정 날짜 내보내고 싶으면: ./dailly_orderbook.sh 20251126
TARGET_DATE_KST="${1:-$(date -d 'yesterday' +%Y%m%d)}"

####################################
# 준비
####################################

mkdir -p "${OUT_DIR}"

# QuestDB 연결 확인 (선택적)
# 실제 쿼리 시점에 연결이 확인되므로 여기서는 정보만 출력
echo "[$(date '+%F %T')] QuestDB endpoint: http://${QDB_HOST}:${QDB_PORT}"
if curl -sS --connect-timeout 3 --max-time 5 "http://${QDB_HOST}:${QDB_PORT}/exp?query=SELECT%201" > /dev/null 2>&1; then
  echo "[$(date '+%F %T')] QuestDB connection verified"
else
  echo "[$(date '+%F %T')] Note: QuestDB connection will be verified during query execution"
fi

# MySQL 연결 확인 (선택적)
# MySQL은 이 스크립트에서 선택적으로 사용되므로 연결 실패 시에도 스크립트는 계속 진행됩니다
echo "[$(date '+%F %T')] MySQL endpoint: ${DB_HOST}:${DB_PORT}"
echo "[$(date '+%F %T')] MySQL database: ${DB_SCHEME}"
echo "[$(date '+%F %T')] MySQL username: ${DB_USERNAME}"
# 포트 연결 확인
mysql_port_ok=false
if command -v nc &> /dev/null; then
  if nc -z -w3 "${DB_HOST}" "${DB_PORT}" 2>/dev/null; then
    echo "[$(date '+%F %T')] MySQL port ${DB_PORT} on ${DB_HOST} is open"
    mysql_port_ok=true
  else
    echo "[$(date '+%F %T')] Note: MySQL port ${DB_PORT} on ${DB_HOST} is not accessible (optional)"
  fi
fi
# MySQL 클라이언트가 있으면 실제 연결 테스트 (타임아웃 포함)
if command -v mysql &> /dev/null; then
  # MYSQL_PWD 환경 변수를 사용하여 비밀번호 전달 (더 안전함)
  export MYSQL_PWD="${DB_PASSWORD}"
  mysql_error_output=""
  mysql_exit_code=1
  
  # set -e로 인한 즉시 종료를 방지하기 위해 명령어 실행을 안전하게 처리
  set +e  # 일시적으로 -e 옵션 해제
  
  # localhost인 경우 TCP/IP를 강제하기 위해 127.0.0.1로 변환
  mysql_host="${DB_HOST}"
  if [ "${DB_HOST}" = "localhost" ]; then
    mysql_host="127.0.0.1"
  fi
  
  if command -v timeout &> /dev/null; then
    # timeout 명령어가 있으면 5초 타임아웃 설정
    # --protocol=TCP 옵션으로 TCP/IP 연결 강제
    mysql_error_output=$(timeout 5 mysql -h"${mysql_host}" -P"${DB_PORT}" -u"${DB_USERNAME}" --protocol=TCP --connect-timeout=3 -e "SELECT 1" "${DB_SCHEME}" 2>&1)
    mysql_exit_code=$?
  else
    # timeout이 없으면 백그라운드로 실행 후 타임아웃 처리
    # --protocol=TCP 옵션으로 TCP/IP 연결 강제
    mysql -h"${mysql_host}" -P"${DB_PORT}" -u"${DB_USERNAME}" --protocol=TCP --connect-timeout=3 -e "SELECT 1" "${DB_SCHEME}" > /tmp/mysql_test.txt 2>&1 &
    mysql_pid=$!
    sleep 5
    if kill -0 ${mysql_pid} 2>/dev/null; then
      kill ${mysql_pid} 2>/dev/null
      wait ${mysql_pid} 2>/dev/null
      mysql_exit_code=124  # timeout exit code
      mysql_error_output="Connection timeout after 5 seconds"
    else
      wait ${mysql_pid}
      mysql_exit_code=$?
      mysql_error_output=$(cat /tmp/mysql_test.txt 2>/dev/null || echo "")
      rm -f /tmp/mysql_test.txt
    fi
  fi
  
  set -e  # -e 옵션 다시 활성화
  unset MYSQL_PWD
  
  if [ ${mysql_exit_code} -eq 0 ]; then
    echo "[$(date '+%F %T')] MySQL connection verified"
  else
    echo "[$(date '+%F %T')] Note: MySQL connection test failed (optional, will be verified during query execution if needed)"
    # 에러 메시지에서 민감한 정보 제거 후 출력
    if [ -n "${mysql_error_output}" ]; then
      mysql_error_clean=$(echo "${mysql_error_output}" | grep -v "Using a password" | grep -v "Warning: Using a password" | head -n1)
      if [ -n "${mysql_error_clean}" ]; then
        echo "[$(date '+%F %T')] MySQL error: ${mysql_error_clean}"
      fi
    fi
  fi
else
  if [ "${mysql_port_ok}" = true ]; then
    echo "[$(date '+%F %T')] Note: MySQL client not found, but port is accessible"
  else
    echo "[$(date '+%F %T')] Note: MySQL client not found (optional)"
  fi
fi

# MinIO Client (mc) 설치 확인
# 시스템에 Midnight Commander가 설치되어 있을 수 있으므로 MinIO Client인지 확인
# 환경 변수 MC_CMD가 설정되어 있으면 우선 사용
MC_CMD="${MC_CMD:-}"
if [ -n "${MC_CMD}" ] && [ -x "${MC_CMD}" ]; then
  echo "[$(date '+%F %T')] Using MC_CMD from environment: ${MC_CMD}"
  # MinIO Client인지 확인
  if command -v timeout &> /dev/null; then
    env_check=$(timeout 2 "${MC_CMD}" --version 2>&1 || echo "")
    if echo "${env_check}" | grep -qiE "(GNU Midnight Commander|Midnight Commander)" 2>/dev/null; then
      echo "[$(date '+%F %T')] ERROR: MC_CMD (${MC_CMD}) is Midnight Commander, not MinIO Client"
      MC_CMD=""
    elif ! echo "${env_check}" | grep -qiE "(RELEASE|MinIO Client)" 2>/dev/null; then
      echo "[$(date '+%F %T')] WARNING: MC_CMD (${MC_CMD}) does not appear to be MinIO Client"
      MC_CMD=""
    fi
  fi
fi

if [ -z "${MC_CMD:-}" ] && command -v mc &> /dev/null; then
  # mc 명령어가 MinIO Client인지 확인
  # MinIO Client는 'mc --version'에서 'RELEASE' 키워드를 포함
  if command -v timeout &> /dev/null; then
    mc_version_output=$(timeout 2 mc --version 2>&1 || echo "")
  else
    # timeout이 없으면 백그라운드로 실행 후 빠르게 종료
    mc --version > /tmp/mc_version.txt 2>&1 &
    mc_version_pid=$!
    sleep 1
    if kill -0 ${mc_version_pid} 2>/dev/null; then
      kill ${mc_version_pid} 2>/dev/null
      mc_version_output=""
    else
      wait ${mc_version_pid} 2>/dev/null
      mc_version_output=$(cat /tmp/mc_version.txt 2>/dev/null || echo "")
      rm -f /tmp/mc_version.txt
    fi
  fi
  
  # Midnight Commander인지 확인 ("GNU Midnight Commander" 또는 "Midnight Commander" 키워드 확인)
  if echo "${mc_version_output}" | grep -qiE "(GNU Midnight Commander|Midnight Commander)" 2>/dev/null; then
    echo "[$(date '+%F %T')] Detected Midnight Commander (not MinIO Client), skipping..."
    MC_CMD=""
  # MinIO Client인지 확인 ("RELEASE" 또는 "MinIO Client" 키워드 확인)
  elif echo "${mc_version_output}" | grep -qiE "(RELEASE|MinIO Client)" 2>/dev/null; then
    MC_CMD="mc"
    echo "[$(date '+%F %T')] Verified MinIO Client: $(echo "${mc_version_output}" | head -n1)"
  else
    # 키워드가 없으면 MinIO Client가 아닐 가능성이 높음
    MC_CMD=""
  fi
fi

# MinIO Client를 찾지 못한 경우 다른 경로 확인
if [ -z "${MC_CMD}" ]; then
  # 일반적인 설치 경로 확인
  for path in "/usr/local/bin/minio-mc" "/usr/local/bin/mc" "/opt/minio-client/mc" "${HOME}/bin/minio-mc" "${HOME}/bin/mc" "./minio-mc" "./mc"; do
    if [ -x "${path}" ]; then
      path_version_output=$("${path}" --version 2>&1 || echo "")
      # Midnight Commander가 아닌지 확인
      if echo "${path_version_output}" | grep -qiE "(GNU Midnight Commander|Midnight Commander)" 2>/dev/null; then
        continue
      fi
      # MinIO Client인지 확인
      if echo "${path_version_output}" | grep -qiE "(RELEASE|MinIO Client)" 2>/dev/null; then
        MC_CMD="${path}"
        echo "[$(date '+%F %T')] Found MinIO Client at: ${path}"
        break
      fi
    fi
  done
fi

# MinIO Client가 실제로 작동하는지 최종 확인
if [ -n "${MC_CMD}" ]; then
  echo "[$(date '+%F %T')] Using MinIO Client: ${MC_CMD}"
  # 실제로 MinIO Client 명령어가 작동하는지 빠르게 테스트
  if command -v timeout &> /dev/null; then
    final_check=$(timeout 2 ${MC_CMD} --version 2>&1 || echo "")
    if echo "${final_check}" | grep -qiE "(GNU Midnight Commander|Midnight Commander)" 2>/dev/null; then
      echo "[$(date '+%F %T')] ERROR: ${MC_CMD} is Midnight Commander, not MinIO Client"
      MC_CMD=""
    elif ! echo "${final_check}" | grep -qiE "(RELEASE|MinIO Client)" 2>/dev/null; then
      echo "[$(date '+%F %T')] WARNING: ${MC_CMD} does not appear to be MinIO Client"
      MC_CMD=""
    fi
  fi
fi

if [ -z "${MC_CMD}" ]; then
  echo "[$(date '+%F %T')] ERROR: MinIO Client (mc) is not installed or not found."
  echo "[$(date '+%F %T')] Note: System has 'mc' command but it appears to be Midnight Commander, not MinIO Client."
  echo "[$(date '+%F %T')] Please install MinIO Client:"
  echo "[$(date '+%F %T')]   wget https://dl.min.io/client/mc/release/linux-amd64/mc -O /tmp/minio-mc"
  echo "[$(date '+%F %T')]   chmod +x /tmp/minio-mc"
  echo "[$(date '+%F %T')]   sudo mv /tmp/minio-mc /usr/local/bin/minio-mc"
  echo "[$(date '+%F %T')]   Then run: export MC_CMD=\"/usr/local/bin/minio-mc\""
  echo "[$(date '+%F %T')]   Or visit: https://min.io/docs/minio/linux/reference/minio-mc.html#install-mc"
  exit 1
fi

# MinIO 설정 및 연결 확인
echo "[$(date '+%F %T')] Configuring MinIO connection..."
echo "[$(date '+%F %T')] MinIO endpoint: ${MINIO_ENDPOINT}"

# MinIO 서버 연결 테스트
echo "[$(date '+%F %T')] Testing MinIO server connectivity..."
MINIO_HOST=$(echo "${MINIO_ENDPOINT}" | sed -e 's|^http://||' -e 's|^https://||' | cut -d: -f1)
MINIO_PORT=$(echo "${MINIO_ENDPOINT}" | sed -e 's|^http://||' -e 's|^https://||' | cut -d: -f2)

# 포트 연결 확인
if command -v nc &> /dev/null; then
  if nc -z -w3 "${MINIO_HOST}" "${MINIO_PORT}" 2>/dev/null; then
    echo "[$(date '+%F %T')] Port ${MINIO_PORT} on ${MINIO_HOST} is open"
  else
    echo "[$(date '+%F %T')] WARNING: Cannot connect to port ${MINIO_PORT} on ${MINIO_HOST}"
    echo "[$(date '+%F %T')] Make sure MinIO service is running and accessible"
  fi
fi

# Health check 엔드포인트 확인
if curl -sS --connect-timeout 3 --max-time 5 "${MINIO_ENDPOINT}/minio/health/live" > /dev/null 2>&1; then
  echo "[$(date '+%F %T')] MinIO health check passed"
else
  echo "[$(date '+%F %T')] WARNING: MinIO health check failed (this might be normal if health endpoint is not available)"
fi

# MinIO alias가 없으면 자동으로 설정
# alias list 명령어도 타임아웃 처리
echo "[$(date '+%F %T')] Checking existing MinIO aliases..."
alias_list_output=""
if command -v timeout &> /dev/null; then
  alias_list_output=$(timeout 5 ${MC_CMD} alias list 2>/dev/null || echo "")
else
  # timeout이 없으면 백그라운드로 실행
  ${MC_CMD} alias list > /tmp/mc_alias_list.txt 2>&1 &
  alias_list_pid=$!
  sleep 3
  if kill -0 ${alias_list_pid} 2>/dev/null; then
    kill ${alias_list_pid} 2>/dev/null
    alias_list_output=""
  else
    wait ${alias_list_pid}
    alias_list_output=$(cat /tmp/mc_alias_list.txt 2>/dev/null || echo "")
    rm -f /tmp/mc_alias_list.txt
  fi
fi

if ! echo "${alias_list_output}" | grep -q "^${MINIO_ALIAS}"; then
  echo "[$(date '+%F %T')] Setting up MinIO alias '${MINIO_ALIAS}'..."
  echo "[$(date '+%F %T')] Connecting to: ${MINIO_ENDPOINT}"
  
  # mc alias set 실행 (타임아웃 포함, timeout 명령어가 있으면 사용)
  if command -v timeout &> /dev/null; then
    echo "[$(date '+%F %T')] Running mc alias set with 10 second timeout..."
    alias_output=$(timeout 10 ${MC_CMD} alias set "${MINIO_ALIAS}" "${MINIO_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" 2>&1)
    alias_exit_code=$?
  else
    # timeout 명령어가 없으면 직접 실행 (백그라운드로 실행 후 타임아웃 시그널 전송)
    echo "[$(date '+%F %T')] Running mc alias set..."
    ${MC_CMD} alias set "${MINIO_ALIAS}" "${MINIO_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" > /tmp/mc_alias_output.txt 2>&1 &
    mc_pid=$!
    
    # 10초 대기
    sleep 10
    
    # 프로세스가 아직 실행 중이면 종료
    if kill -0 ${mc_pid} 2>/dev/null; then
      echo "[$(date '+%F %T')] WARNING: mc alias set is taking too long, killing process..."
      kill ${mc_pid} 2>/dev/null
      wait ${mc_pid} 2>/dev/null
      alias_exit_code=124  # timeout exit code
      alias_output="Command timed out after 10 seconds"
    else
      wait ${mc_pid}
      alias_exit_code=$?
      alias_output=$(cat /tmp/mc_alias_output.txt 2>/dev/null || echo "")
      rm -f /tmp/mc_alias_output.txt
    fi
  fi
  
  if [ ${alias_exit_code} -ne 0 ]; then
    echo "[$(date '+%F %T')] ERROR: Failed to set MinIO alias (exit code: ${alias_exit_code})"
    echo "[$(date '+%F %T')] Error output: ${alias_output}"
    echo "[$(date '+%F %T')] Endpoint: ${MINIO_ENDPOINT}"
    echo "[$(date '+%F %T')] Access Key: ${MINIO_ACCESS_KEY}"
    echo "[$(date '+%F %T')] Make sure MinIO server is accessible and credentials are correct."
    echo "[$(date '+%F %T')] Test connection: curl -v ${MINIO_ENDPOINT}/minio/health/live"
    exit 1
  fi
  
  if [ -n "${alias_output}" ]; then
    echo "[$(date '+%F %T')] ${alias_output}"
  fi
  echo "[$(date '+%F %T')] MinIO alias '${MINIO_ALIAS}' configured successfully"
else
  echo "[$(date '+%F %T')] MinIO alias '${MINIO_ALIAS}' already exists"
fi

# MinIO 연결 테스트 (타임아웃 포함)
echo "[$(date '+%F %T')] Testing MinIO connection..."
if command -v timeout &> /dev/null; then
  if ! timeout 10 ${MC_CMD} ls "${MINIO_ALIAS}/${MINIO_BUCKET}" > /dev/null 2>&1; then
    echo "[$(date '+%F %T')] ERROR: Cannot access MinIO bucket '${MINIO_BUCKET}'. Please check your MinIO configuration."
    echo "[$(date '+%F %T')] Endpoint: ${MINIO_ENDPOINT}"
    echo "[$(date '+%F %T')] Access Key: ${MINIO_ACCESS_KEY}"
    echo "[$(date '+%F %T')] Bucket: ${MINIO_BUCKET}"
    exit 1
  fi
else
  if ! ${MC_CMD} ls "${MINIO_ALIAS}/${MINIO_BUCKET}" > /dev/null 2>&1; then
    echo "[$(date '+%F %T')] ERROR: Cannot access MinIO bucket '${MINIO_BUCKET}'. Please check your MinIO configuration."
    echo "[$(date '+%F %T')] Endpoint: ${MINIO_ENDPOINT}"
    echo "[$(date '+%F %T')] Access Key: ${MINIO_ACCESS_KEY}"
    echo "[$(date '+%F %T')] Bucket: ${MINIO_BUCKET}"
    exit 1
  fi
fi

echo "[$(date '+%F %T')] MinIO connection verified"
echo "[$(date '+%F %T')] Start export for date(KST): ${TARGET_DATE_KST}"

####################################
# 함수: MySQL에서 product_id로 symbol 조회
####################################
get_symbol_from_product_id() {
  local price_id="$1"
  local product_id="$2"
  local symbol=""
  
  if [ -z "${product_id}" ]; then
    echo ""
    return
  fi

  if [ -z "${price_id}" ]; then
    echo ""
    return
  fi
  
  # MySQL 클라이언트가 없으면 product_id 반환
  if ! command -v mysql &> /dev/null; then
    echo "${product_id}"
    return
  fi
  
  # localhost인 경우 TCP/IP를 강제하기 위해 127.0.0.1로 변환
  mysql_host="${DB_HOST}"
  if [ "${DB_HOST}" = "localhost" ]; then
    mysql_host="127.0.0.1"
  fi
  
  # set -e로 인한 즉시 종료를 방지하기 위해 명령어 실행을 안전하게 처리
  set +e
  
  export MYSQL_PWD="${DB_PASSWORD}"
  
  # MySQL에서 symbol 조회
  # A.id = 1 (기본 코인), B.id = product_id (대상 코인)
  if command -v timeout &> /dev/null; then
    symbol=$(timeout 5 mysql -h"${mysql_host}" -P"${DB_PORT}" -u"${DB_USERNAME}" --protocol=TCP --connect-timeout=3 -N -e "SELECT CONCAT(A.code, '-', B.code) AS symbol FROM tb_coin_code A JOIN tb_coin_code B ON A.id = ${price_id} AND B.id = ${product_id}" "${DB_SCHEME}" 2>/dev/null)
  else
    symbol=$(mysql -h"${mysql_host}" -P"${DB_PORT}" -u"${DB_USERNAME}" --protocol=TCP --connect-timeout=3 -N -e "SELECT CONCAT(A.code, '-', B.code) AS symbol FROM tb_coin_code A JOIN tb_coin_code B ON A.id = ${price_id} AND B.id = ${product_id}" "${DB_SCHEME}" 2>/dev/null)
  fi
  
  unset MYSQL_PWD
  set -e
  
  # symbol이 조회되지 않으면 product_id 반환
  if [ -z "${symbol}" ]; then
    echo "${product_id}"
  else
    echo "${symbol}"
  fi
}

####################################
# 함수: 한 테이블을 CSV로 내보내고 MinIO에 업로드
####################################
export_table() {
  local table="$1"        # 테이블 이름
  local ts_col="$2"       # 타임스탬프 컬럼 이름
  local file_prefix="$3"  # 파일 이름 prefix (폴더명 겸용)
  local price_id="${4:-}"  # 가격 ID (선택적)
  local product_id="${5:-}"  # 상품 ID (선택적)

  # product_id가 있으면 MySQL에서 symbol 조회하여 파일명에 사용
  if [ -n "${product_id}" ]; then
    local symbol=$(get_symbol_from_product_id "${price_id}" "${product_id}")
    local outfile="${OUT_DIR}/${file_prefix}_${TARGET_DATE_KST}_${symbol}.csv.gz"
  else
    local outfile="${OUT_DIR}/${file_prefix}_${TARGET_DATE_KST}.csv.gz"
  fi
  
  # orderbook인 경우 날짜별 분류 없이 한 폴더에 모음, 그 외에는 날짜별로 분류
  if [ "${file_prefix}" = "orderbook" ]; then
    local minio_path="${MINIO_ALIAS}/${MINIO_BUCKET}/${file_prefix}/"
  else
    local minio_path="${MINIO_ALIAS}/${MINIO_BUCKET}/${file_prefix}/"
  fi

  echo "[$(date '+%F %T')] Export ${table} -> ${outfile}"

  # 테이블별 쿼리 생성
  if [ "${table}" = "tb_fkbrti_1sec" ]; then
    # tb_fkbrti_1sec 테이블인 경우 select * 사용
    local sql="
    select *
    from ${table}
    where ${ts_col} = '${TARGET_DATE_KST}'
    ;
  "
  elif [ "${table}" = "tb_exchange_trade" ]; then
    # tb_exchange_trade 테이블인 경우 trade_ddl.js에 정의된 컬럼 선택
    local sql="
    select tran_dt, tran_tm, exchange_cd, sequential_id, price_id, product_id, buy_sell_gb, trade_price, trade_volumn, timestamp, cont_dtm
    from ${table}
    where ${ts_col} = '${TARGET_DATE_KST}'
  "

    if [ -n "${product_id}" ]; then
      sql="${sql}      and product_id = ${product_id}"
    fi

    sql="${sql}
    ;
  "
  else
    # 그 외 테이블 (tb_order_book 등)은 기본 컬럼 선택
    local sql="
    select tran_date, tran_time, exchange_cd, price_id, product_id, order_tp, price, size
    from ${table}
    where ${ts_col} = '${TARGET_DATE_KST}'
  "

    if [ -n "${product_id}" ]; then
      sql="${sql}      and product_id = ${product_id}"
    fi

    sql="${sql}
    ;
  "
  fi

  echo "[$(date '+%F %T')] SQL: ${sql}"

  # QuestDB /exp 로 CSV 스트리밍 → gzip
  echo "[$(date '+%F %T')] Fetching data from QuestDB..."
  curl -sS -G \
    --data-urlencode "query=${sql}" \
    "http://${QDB_HOST}:${QDB_PORT}/exp" \
  | gzip > "${outfile}"

  # 파일 크기 확인
  if [ ! -s "${outfile}" ]; then
    echo "[$(date '+%F %T')] ERROR: Output file is empty or does not exist: ${outfile}"
    exit 1
  fi

  local file_size=$(stat -f%z "${outfile}" 2>/dev/null || stat -c%s "${outfile}" 2>/dev/null || echo "0")
  echo "[$(date '+%F %T')] File created: ${outfile} (size: ${file_size} bytes)"

  # MinIO 업로드 (재시도 로직 포함)
  echo "[$(date '+%F %T')] Uploading to MinIO: ${minio_path}"
  local max_retries=3
  local retry_count=0
  local upload_success=false

  while [ ${retry_count} -lt ${max_retries} ]; do
    if ${MC_CMD} cp "${outfile}" "${minio_path}"; then
      upload_success=true
      break
    else
      retry_count=$((retry_count + 1))
      if [ ${retry_count} -lt ${max_retries} ]; then
        local delay=$((retry_count * 2))
        echo "[$(date '+%F %T')] Upload failed, retrying in ${delay} seconds... (attempt ${retry_count}/${max_retries})"
        sleep ${delay}
      fi
    fi
  done

  if [ "${upload_success}" = false ]; then
    echo "[$(date '+%F %T')] ERROR: Failed to upload to MinIO after ${max_retries} attempts"
    exit 1
  fi

  # 업로드 확인
  local remote_file="${minio_path}$(basename ${outfile})"
  if ${MC_CMD} stat "${remote_file}" > /dev/null 2>&1; then
    echo "[$(date '+%F %T')] Upload verified: ${remote_file}"
    # 업로드 확인 후 로컬 파일 삭제
    if [ -f "${outfile}" ]; then
      rm -f "${outfile}"
      echo "[$(date '+%F %T')] Local file deleted: ${outfile}"
    fi
  else
    echo "[$(date '+%F %T')] WARNING: Upload verification failed for ${remote_file}"
    echo "[$(date '+%F %T')] Local file kept: ${outfile}"
  fi

  echo "[$(date '+%F %T')] Done ${table}"
}

####################################
# 테이블별 Export
####################################

# 1) tb_order_book (marketAt 기준)
export_table "tb_order_book" "tran_date" "orderbook" 1 13
export_table "tb_order_book" "tran_date" "orderbook" 1 16

export_table "tb_exchange_trade" "tran_date" "trade" 1 13
export_table "tb_exchange_trade" "tran_date" "trade" 1 16

# 2) tb_fkbrti_1sec (createdAt 기준)
export_table "tb_fkbrti_1sec" "tran_date" "fkbrti_1sec"

echo "[$(date '+%F %T')] All exports done for ${TARGET_DATE_KST}"
