# QuestDB 1일 파티션 백업 전략

QuestDB는 시계열 데이터베이스로 `PARTITION BY DAY`를 사용하여 일별 파티션으로 데이터를 관리합니다. 이 문서는 QuestDB의 파티션 구조를 고려한 최적의 백업 전략을 제시합니다.

## 목차

1. [QuestDB 파티션 구조 이해](#questdb-파티션-구조-이해)
2. [백업 전략 개요](#백업-전략-개요)
3. [ZFS 스냅샷 기반 백업](#zfs-스냅샷-기반-백업)
4. [QuestDB 파티션 백업](#questdb-파티션-백업)
5. [MinIO 기반 백업](#minio-기반-백업)
6. [하이브리드 백업 전략](#하이브리드-백업-전략)
7. [프로세스 재시작 및 크래시 대응 전략](#프로세스-재시작-및-크래시-대응-전략)
8. [복구 시나리오](#복구-시나리오)
9. [자동화 스크립트](#자동화-스크립트)

---

## QuestDB 파티션 구조 이해

### 현재 테이블 구조

프로젝트에서 사용 중인 주요 테이블들:

```sql
-- 호가 데이터
CREATE TABLE tb_order_book (
    ...
) TIMESTAMP(marketAt) PARTITION BY DAY WAL;

-- 티커 데이터
CREATE TABLE tb_ticker (
    ...
) TIMESTAMP(marketAt) PARTITION BY DAY WAL;

-- 거래 데이터
CREATE TABLE tb_exchange_trade (
    ...
) TIMESTAMP(marketAt) PARTITION BY DAY WAL;

-- 인덱스 데이터
CREATE TABLE tb_fkbrti_1sec (
    ...
) TIMESTAMP(createdAt) PARTITION BY DAY WAL;
```

### 파티션 구조의 특징

1. **일별 분리**: 각 날짜별로 독립적인 파티션 파일 생성
2. **자동 관리**: QuestDB가 자동으로 파티션 생성/관리
3. **효율적 쿼리**: 날짜 범위 쿼리 시 해당 파티션만 스캔
4. **독립적 백업**: 파티션 단위 백업 가능

### 파티션 파일 위치

```
QuestDB 데이터 디렉토리 구조:
/var/lib/questdb/db/
├── tb_order_book/
│   ├── 2025-11-28/          # 일별 파티션 디렉토리
│   │   ├── _meta             # 메타데이터
│   │   ├── _txn              # 트랜잭션 로그
│   │   └── *.d               # 데이터 파일들
│   ├── 2025-11-29/
│   └── ...
├── tb_ticker/
│   └── ...
└── ...
```

---

## 백업 전략 개요

### 프로덕션 환경 백업 전략 (3개월 데이터 유지, 영구 보관)

**중요**: 프로덕션 환경에서는 QuestDB 데이터를 3개월간 유지하고, 백업은 영구 보관합니다.

### 4단계 백업 전략 (프로덕션)

```
1. 실시간 보호: ZFS 스냅샷 (로컬, 빠른 복구)
   └── 6시간마다 생성, 7일 보관 (프로덕션 환경)

2. 일일 백업: QuestDB 파티션 백업 (로컬)
   └── 매일 자정, 최근 30일 보관 (프로덕션 환경)

3. MinIO 파티션 백업: 파티션 백업을 MinIO에 업로드 (오브젝트 스토리지)
   └── 매일 자정 이후, 영구 보관 (자동 삭제 없음)

4. MinIO 전체 백업: 전체 데이터셋 백업 (MinIO)
   └── 주 1회, 영구 보관 (자동 삭제 없음)
```

### 백업 계층 구조 (프로덕션)

```
┌─────────────────────────────────────┐
│  Level 1: ZFS 스냅샷 (로컬)         │
│  - 빈도: 6시간마다                   │
│  - 보관: 7일 (프로덕션)              │
│  - 용도: 즉시 복구, 실수 복구        │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Level 2: 파티션 백업 (로컬)        │
│  - 빈도: 일 1회 (자정)              │
│  - 보관: 30일 (프로덕션)            │
│  - 용도: 일별 데이터 복구            │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Level 3: MinIO 파티션 (Hot)        │
│  - 빈도: 일 1회 (자정 이후)         │
│  - 보관: 영구 보관 (최근 3개월)      │
│  - 용도: 빠른 원격 복구              │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Level 4: MinIO 전체 (Cold Archive) │
│  - 빈도: 주 1회 (일요일)            │
│  - 보관: 영구 보관 (무제한)         │
│  - 용도: 재해 복구, 장기 아카이브    │
└─────────────────────────────────────┘
```

### 프로덕션 환경 특징

- **QuestDB 데이터 보관**: 3개월 (90일) - 자동 삭제 정책 적용
- **백업 보관**: 영구 보관 - 자동 삭제 없음
- **스토리지 계층화**: Hot (최근 3개월) → Cold Archive (3개월 이상)
- **비용 최적화**: 오래된 백업은 Cold Storage로 이동

---

## ZFS 스냅샷 기반 백업

### 장점

- **즉시 생성**: 메타데이터만 기록하므로 거의 즉시 완료
- **성능 영향 없음**: 애플리케이션 다운타임 없음
- **빠른 복구**: 전체 데이터셋을 즉시 이전 상태로 롤백
- **파티션 보호**: 모든 파티션을 동시에 보호

### 구현 방법

```bash
#!/bin/bash
# questdb-zfs-snapshot.sh

POOL_NAME="bonanza"
RETENTION_HOURS=24
SNAPSHOT_PREFIX="questdb"

# QuestDB가 사용하는 ZFS 볼륨 확인
QDB_VOLUME=$(zfs list | grep questdb | awk '{print $1}')

if [ -z "$QDB_VOLUME" ]; then
    echo "QuestDB ZFS volume not found"
    exit 1
fi

# 스냅샷 생성
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SNAPSHOT_NAME="${QDB_VOLUME}@${SNAPSHOT_PREFIX}-${TIMESTAMP}"

echo "Creating snapshot: ${SNAPSHOT_NAME}"
zfs snapshot "${SNAPSHOT_NAME}"

# 오래된 스냅샷 삭제
zfs list -t snapshot -o name,creation | grep "${QDB_VOLUME}@${SNAPSHOT_PREFIX}" | \
while read snapshot creation; do
    CREATION_EPOCH=$(date -d "$creation" +%s 2>/dev/null || echo 0)
    CURRENT_EPOCH=$(date +%s)
    AGE_HOURS=$(( (CURRENT_EPOCH - CREATION_EPOCH) / 3600 ))
    
    if [ $AGE_HOURS -gt $RETENTION_HOURS ]; then
        echo "Deleting old snapshot: $snapshot (age: ${AGE_HOURS} hours)"
        zfs destroy "$snapshot"
    fi
done

echo "Snapshot created successfully: ${SNAPSHOT_NAME}"
```

### Kubernetes CronJob 설정

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: questdb-zfs-snapshot
  namespace: bonanza-index
spec:
  schedule: "0 */6 * * *"  # 6시간마다
  successfulJobsHistoryLimit: 2
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          hostNetwork: true
          hostPID: true
          containers:
          - name: zfs-snapshot
            image: ubuntu:22.04
            securityContext:
              privileged: true
            volumeMounts:
            - name: host
              mountPath: /host
            command:
            - /bin/bash
            - -c
            - |
              # ZFS 명령어 실행
              /host/usr/sbin/zfs snapshot bonanza/questdb@snapshot-$(date +%Y%m%d-%H%M%S)
              
              # 오래된 스냅샷 정리 (24시간 이상)
              /host/usr/sbin/zfs list -t snapshot -o name,creation | \
                grep "bonanza/questdb@snapshot" | \
                while read snapshot creation; do
                  CREATION_EPOCH=$(date -d "$creation" +%s)
                  CURRENT_EPOCH=$(date +%s)
                  AGE_HOURS=$(( (CURRENT_EPOCH - CREATION_EPOCH) / 3600 ))
                  if [ $AGE_HOURS -gt 24 ]; then
                    /host/usr/sbin/zfs destroy "$snapshot"
                  fi
                done
          volumes:
          - name: host
            hostPath:
              path: /
          restartPolicy: OnFailure
```

---

## QuestDB 파티션 백업

### 파티션 단위 백업의 장점

1. **선택적 백업**: 필요한 날짜의 파티션만 백업 가능
2. **빠른 복구**: 특정 날짜 데이터만 복구 가능
3. **공간 효율**: 전체 백업 대비 공간 절약
4. **병렬 처리**: 여러 파티션을 동시에 백업 가능

### 파티션 백업 방법

#### 방법 1: COPY 명령어 사용 (권장)

```sql
-- 특정 날짜 파티션 백업
COPY (
    SELECT * FROM tb_order_book 
    WHERE marketAt >= '2025-11-28' AND marketAt < '2025-11-29'
) TO '/backup/tb_order_book_2025-11-28.csv' WITH HEADER;
```

#### 방법 2: 파티션 파일 직접 복사

```bash
#!/bin/bash
# questdb-partition-backup.sh

QDB_DATA_DIR="/var/lib/questdb/db"
BACKUP_DIR="/backup/questdb-partitions"
DATE=$(date -d "yesterday" +%Y-%m-%d)  # 어제 날짜
RETENTION_DAYS=7

# 백업 디렉토리 생성
mkdir -p "${BACKUP_DIR}/${DATE}"

# 각 테이블의 파티션 백업
TABLES=("tb_order_book" "tb_ticker" "tb_exchange_trade" "tb_fkbrti_1sec")

for TABLE in "${TABLES[@]}"; do
    PARTITION_DIR="${QDB_DATA_DIR}/${TABLE}/${DATE}"
    
    if [ -d "$PARTITION_DIR" ]; then
        echo "Backing up ${TABLE} partition for ${DATE}..."
        
        # 파티션 디렉토리 전체 복사
        tar czf "${BACKUP_DIR}/${DATE}/${TABLE}_${DATE}.tar.gz" \
            -C "${QDB_DATA_DIR}/${TABLE}" "${DATE}"
        
        echo "Backed up: ${TABLE}_${DATE}.tar.gz"
    else
        echo "Partition not found: ${PARTITION_DIR}"
    fi
done

# 오래된 백업 삭제
find "${BACKUP_DIR}" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \;

echo "Partition backup completed for ${DATE}"
```

#### 방법 3: QuestDB EXPORT 사용

```bash
#!/bin/bash
# questdb-export-backup.sh

QDB_HOST="localhost"
QDB_PORT="9000"
BACKUP_DIR="/backup/questdb-exports"
DATE=$(date -d "yesterday" +%Y-%m-%d)
RETENTION_DAYS=7

mkdir -p "${BACKUP_DIR}/${DATE}"

# 각 테이블의 데이터를 CSV로 내보내기
TABLES=("tb_order_book" "tb_ticker" "tb_exchange_trade" "tb_fkbrti_1sec")

for TABLE in "${TABLES[@]}"; do
    echo "Exporting ${TABLE} for ${DATE}..."
    
    # QuestDB HTTP API를 통한 내보내기
    curl -G \
        "http://${QDB_HOST}:${QDB_PORT}/exp" \
        --data-urlencode "query=SELECT * FROM ${TABLE} WHERE marketAt >= '${DATE}T00:00:00.000000Z' AND marketAt < '$(date -d "${DATE} +1 day" +%Y-%m-%d)T00:00:00.000000Z'" \
        --output "${BACKUP_DIR}/${DATE}/${TABLE}_${DATE}.csv"
    
    # 압축
    gzip "${BACKUP_DIR}/${DATE}/${TABLE}_${DATE}.csv"
    
    echo "Exported: ${TABLE}_${DATE}.csv.gz"
done

# 오래된 백업 삭제
find "${BACKUP_DIR}" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \;
```

### 파티션 백업 스크립트 (통합)

```bash
#!/bin/bash
# questdb-daily-partition-backup.sh

set -euo pipefail

QDB_DATA_DIR="${QDB_DATA_DIR:-/var/lib/questdb/db}"
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/backup/questdb}"
DATE=$(date -d "yesterday" +%Y-%m-%d)
RETENTION_DAYS=7
BACKUP_SERVER="${BACKUP_SERVER:-}"
BACKUP_REMOTE_PATH="${BACKUP_REMOTE_PATH:-/backup/questdb-remote}"

# 로그 설정
LOG_FILE="/var/log/questdb-backup.log"
exec >> "$LOG_FILE" 2>&1

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# 백업 디렉토리 생성
BACKUP_DIR="${BACKUP_BASE_DIR}/partitions/${DATE}"
mkdir -p "$BACKUP_DIR"

# 테이블 목록 (자동 감지 또는 수동 지정)
TABLES=("tb_order_book" "tb_ticker" "tb_exchange_trade" "tb_fkbrti_1sec" "tb_report" "tb_system_log")

log "Starting partition backup for date: ${DATE}"

BACKUP_SUCCESS=0
BACKUP_FAILED=0

for TABLE in "${TABLES[@]}"; do
    PARTITION_DIR="${QDB_DATA_DIR}/${TABLE}/${DATE}"
    
    if [ ! -d "$PARTITION_DIR" ]; then
        log "WARNING: Partition not found: ${PARTITION_DIR}"
        continue
    fi
    
    BACKUP_FILE="${BACKUP_DIR}/${TABLE}_${DATE}.tar.gz"
    
    log "Backing up ${TABLE} partition..."
    
    if tar czf "$BACKUP_FILE" -C "${QDB_DATA_DIR}/${TABLE}" "${DATE}" 2>/dev/null; then
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log "SUCCESS: ${TABLE} backed up (${BACKUP_SIZE})"
        ((BACKUP_SUCCESS++))
        
        # 원격 백업 (설정된 경우)
        if [ -n "$BACKUP_SERVER" ]; then
            log "Uploading ${TABLE} to remote server..."
            scp "$BACKUP_FILE" "${BACKUP_SERVER}:${BACKUP_REMOTE_PATH}/partitions/${DATE}/" || {
                log "ERROR: Failed to upload ${TABLE} to remote server"
            }
        fi
    else
        log "ERROR: Failed to backup ${TABLE}"
        ((BACKUP_FAILED++))
    fi
done

log "Backup completed. Success: ${BACKUP_SUCCESS}, Failed: ${BACKUP_FAILED}"

# 오래된 백업 정리
log "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."
find "${BACKUP_BASE_DIR}/partitions" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true

if [ -n "$BACKUP_SERVER" ]; then
    ssh "$BACKUP_SERVER" "find ${BACKUP_REMOTE_PATH}/partitions -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \;" 2>/dev/null || true
fi

log "Cleanup completed"

# 백업 상태 리포트
if [ $BACKUP_FAILED -eq 0 ]; then
    log "All backups completed successfully"
    exit 0
else
    log "Some backups failed. Please check the logs."
    exit 1
fi
```

---

## MinIO 기반 백업

### MinIO 개요

MinIO는 S3 호환 오브젝트 스토리지로, QuestDB 백업 파일을 안전하게 저장하고 관리할 수 있습니다.

### 장점

- **S3 호환**: AWS S3 API와 완전 호환
- **확장성**: 수평 확장 가능
- **비용 효율**: 오픈소스, 자체 호스팅 가능
- **버전 관리**: 오브젝트 버전 관리 지원
- **라이프사이클 정책**: 자동 삭제/전환 정책 설정 가능
- **암호화**: 전송 및 저장 시 암호화 지원

### MinIO 설정

#### 1. MinIO 클라이언트 설치

```bash
# Linux
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
sudo mv mc /usr/local/bin/

# 또는 Docker 사용
docker pull minio/mc
```

#### 2. MinIO 서버 연결 설정

```bash
# MinIO 서버 연결 (Kubernetes 내부)
mc alias set questdb-backup \
    http://minio-service.bonanza-index.svc:9000 \
    bonanza \
    56tyghbn

# 또는 외부 접근 (NodePort)
mc alias set questdb-backup \
    http://<node-ip>:30902 \
    bonanza \
    56tyghbn
```

#### 3. 버킷 생성

```bash
# 백업용 버킷 생성
mc mb questdb-backup/questdb-partitions
mc mb questdb-backup/questdb-full

# 버킷 정책 설정 (읽기/쓰기)
mc anonymous set download questdb-backup/questdb-partitions
mc anonymous set download questdb-backup/questdb-full
```

### 파티션 백업을 MinIO에 업로드

```bash
#!/bin/bash
# questdb-minio-partition-backup.sh

set -euo pipefail

QDB_DATA_DIR="${QDB_DATA_DIR:-/var/lib/questdb/db}"
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/backup/questdb}"
MINIO_ALIAS="${MINIO_ALIAS:-questdb-backup}"
MINIO_BUCKET="${MINIO_BUCKET:-questdb-partitions}"
RETENTION_DAYS=30

DATE=$(date -d "yesterday" +%Y-%m-%d)
BACKUP_DIR="${BACKUP_BASE_DIR}/partitions/${DATE}"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# MinIO 클라이언트 확인
if ! command -v mc &> /dev/null; then
    log "ERROR: MinIO client (mc) not found. Please install it first."
    exit 1
fi

# MinIO 연결 확인
if ! mc ls "${MINIO_ALIAS}" &> /dev/null; then
    log "ERROR: Cannot connect to MinIO. Check alias configuration."
    exit 1
fi

log "Starting MinIO partition backup for date: ${DATE}"

TABLES=("tb_order_book" "tb_ticker" "tb_exchange_trade" "tb_fkbrti_1sec" "tb_report" "tb_system_log")

UPLOAD_SUCCESS=0
UPLOAD_FAILED=0

for TABLE in "${TABLES[@]}"; do
    PARTITION_DIR="${QDB_DATA_DIR}/${TABLE}/${DATE}"
    BACKUP_FILE="${BACKUP_DIR}/${TABLE}_${DATE}.tar.gz"
    
    # 로컬 백업 파일이 없으면 생성
    if [ ! -f "$BACKUP_FILE" ]; then
        if [ ! -d "$PARTITION_DIR" ]; then
            log "WARNING: Partition not found: ${PARTITION_DIR}"
            continue
        fi
        
        mkdir -p "$(dirname "$BACKUP_FILE")"
        log "Creating backup file: ${BACKUP_FILE}"
        tar czf "$BACKUP_FILE" -C "${QDB_DATA_DIR}/${TABLE}" "${DATE}"
    fi
    
    # MinIO에 업로드
    MINIO_PATH="${MINIO_BUCKET}/${TABLE}/${DATE}/${TABLE}_${DATE}.tar.gz"
    
    log "Uploading ${TABLE} to MinIO: ${MINIO_PATH}"
    
    if mc cp "$BACKUP_FILE" "${MINIO_ALIAS}/${MINIO_PATH}"; then
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log "SUCCESS: ${TABLE} uploaded to MinIO (${BACKUP_SIZE})"
        ((UPLOAD_SUCCESS++))
        
        # 업로드 성공 후 로컬 파일 삭제 (선택사항)
        # rm -f "$BACKUP_FILE"
    else
        log "ERROR: Failed to upload ${TABLE} to MinIO"
        ((UPLOAD_FAILED++))
    fi
done

log "MinIO upload completed. Success: ${UPLOAD_SUCCESS}, Failed: ${UPLOAD_FAILED}"

# 오래된 백업 삭제 (MinIO 라이프사이클 정책 사용 권장)
log "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."

# MinIO에서 오래된 오브젝트 삭제
for TABLE in "${TABLES[@]}"; do
    mc find "${MINIO_ALIAS}/${MINIO_BUCKET}/${TABLE}" \
        --older-than "${RETENTION_DAYS}d" \
        --exec "mc rm {}" 2>/dev/null || true
done

log "Cleanup completed"

if [ $UPLOAD_FAILED -eq 0 ]; then
    log "All uploads completed successfully"
    exit 0
else
    log "Some uploads failed. Please check the logs."
    exit 1
fi
```

### 전체 백업을 MinIO에 업로드

```bash
#!/bin/bash
# questdb-minio-full-backup.sh

set -euo pipefail

QDB_DATA_DIR="${QDB_DATA_DIR:-/var/lib/questdb/db}"
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/backup/questdb}"
MINIO_ALIAS="${MINIO_ALIAS:-questdb-backup}"
MINIO_BUCKET="${MINIO_BUCKET:-questdb-full}"
# 프로덕션 환경: 영구 보관 (자동 삭제 없음)
# 개발 환경: 90일 보관
if [ "${NODE_ENV}" = "production" ]; then
    RETENTION_DAYS=999999  # 영구 보관 (실제로는 삭제하지 않음)
else
    RETENTION_DAYS=90
fi

DATE=$(date +%Y-%m-%d)
FULL_BACKUP_FILE="${BACKUP_BASE_DIR}/full/questdb-full-${DATE}.tar.gz"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# MinIO 클라이언트 확인
if ! command -v mc &> /dev/null; then
    log "ERROR: MinIO client (mc) not found."
    exit 1
fi

log "Starting MinIO full backup for date: ${DATE}"

# 전체 백업 파일 생성 (없는 경우)
if [ ! -f "$FULL_BACKUP_FILE" ]; then
    log "Creating full backup file..."
    mkdir -p "$(dirname "$FULL_BACKUP_FILE")"
    tar czf "$FULL_BACKUP_FILE" \
        -C "$(dirname $QDB_DATA_DIR)" \
        "$(basename $QDB_DATA_DIR)"
fi

# MinIO에 업로드
MINIO_PATH="${MINIO_BUCKET}/questdb-full-${DATE}.tar.gz"

log "Uploading full backup to MinIO: ${MINIO_PATH}"

if mc cp "$FULL_BACKUP_FILE" "${MINIO_ALIAS}/${MINIO_PATH}"; then
    BACKUP_SIZE=$(du -h "$FULL_BACKUP_FILE" | cut -f1)
    log "SUCCESS: Full backup uploaded to MinIO (${BACKUP_SIZE})"
    
    # 업로드 성공 후 로컬 파일 삭제 (선택사항)
    # rm -f "$FULL_BACKUP_FILE"
else
    log "ERROR: Failed to upload full backup to MinIO"
    exit 1
fi

# 오래된 백업 삭제
log "Cleaning up old full backups (older than ${RETENTION_DAYS} days)..."
mc find "${MINIO_ALIAS}/${MINIO_BUCKET}" \
    --older-than "${RETENTION_DAYS}d" \
    --exec "mc rm {}" 2>/dev/null || true

log "Full backup completed successfully"
```

### MinIO에서 복구

```bash
#!/bin/bash
# questdb-minio-restore.sh

set -euo pipefail

MINIO_ALIAS="${MINIO_ALIAS:-questdb-backup}"
MINIO_BUCKET="${MINIO_BUCKET:-questdb-partitions}"
RESTORE_DATE="${1:-$(date -d 'yesterday' +%Y-%m-%d)}"
TABLE="${2:-tb_order_book}"
QDB_DATA_DIR="${QDB_DATA_DIR:-/var/lib/questdb/db}"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# QuestDB 중지 (필요한 경우)
log "Stopping QuestDB..."
kubectl scale statefulset questdb --replicas=0 -n bonanza-index || true
sleep 5

# MinIO에서 다운로드
MINIO_PATH="${MINIO_BUCKET}/${TABLE}/${RESTORE_DATE}/${TABLE}_${RESTORE_DATE}.tar.gz"
TEMP_FILE="/tmp/${TABLE}_${RESTORE_DATE}.tar.gz"

log "Downloading ${TABLE} partition from MinIO..."
if mc cp "${MINIO_ALIAS}/${MINIO_PATH}" "$TEMP_FILE"; then
    log "Downloaded successfully"
else
    log "ERROR: Failed to download from MinIO"
    exit 1
fi

# 파티션 복원
log "Restoring partition..."
mkdir -p "${QDB_DATA_DIR}/${TABLE}"
tar xzf "$TEMP_FILE" -C "${QDB_DATA_DIR}/${TABLE}"

# 임시 파일 삭제
rm -f "$TEMP_FILE"

log "Partition restored successfully"

# QuestDB 재시작
log "Starting QuestDB..."
kubectl scale statefulset questdb --replicas=1 -n bonanza-index || true

log "Restore completed"
```

### MinIO 라이프사이클 정책 설정 (프로덕션: 영구 보관)

#### 프로덕션 환경: 영구 보관 (자동 삭제 없음)

프로덕션 환경에서는 백업을 영구 보관하므로 라이프사이클 정책에서 자동 삭제를 설정하지 않습니다.

```bash
# 프로덕션 환경: 라이프사이클 정책 없음 (영구 보관)
# 자동 삭제 정책을 적용하지 않음

# 대신 스토리지 계층화를 위한 태그 설정 (선택사항)
# 최근 3개월: Hot Storage (빠른 접근)
# 3개월 이상: Cold Storage (아카이브)
```

#### 개발 환경: 자동 삭제 정책

```bash
# 개발 환경용 라이프사이클 정책 JSON 생성
cat > /tmp/lifecycle-dev.json <<EOF
{
  "Rules": [
    {
      "ID": "DeleteOldPartitions",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "tb_order_book/"
      },
      "Expiration": {
        "Days": 30
      }
    },
    {
      "ID": "DeleteOldFullBackups",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "questdb-full-"
      },
      "Expiration": {
        "Days": 90
      }
    }
  ]
}
EOF

# 개발 환경에만 적용
if [ "${NODE_ENV}" != "production" ]; then
    mc ilm import questdb-backup/questdb-partitions < /tmp/lifecycle-dev.json
    mc ilm import questdb-backup/questdb-full < /tmp/lifecycle-dev.json
fi
```

#### 프로덕션 환경: 스토리지 계층화 (선택사항)

비용 최적화를 위해 오래된 백업을 Cold Storage로 이동할 수 있습니다:

```bash
# 프로덕션 환경: 스토리지 계층화 정책
cat > /tmp/lifecycle-prod-tiering.json <<EOF
{
  "Rules": [
    {
      "ID": "MoveOldPartitionsToCold",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "tb_order_book/"
      },
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "COLD"
        }
      ]
    },
    {
      "ID": "MoveOldFullBackupsToCold",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "questdb-full-"
      },
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "COLD"
        }
      ]
    }
  ]
}
EOF

# 프로덕션 환경에만 적용 (Cold Storage가 설정된 경우)
if [ "${NODE_ENV}" = "production" ] && [ -n "${MINIO_COLD_STORAGE}" ]; then
    mc ilm import questdb-backup/questdb-partitions < /tmp/lifecycle-prod-tiering.json
    mc ilm import questdb-backup/questdb-full < /tmp/lifecycle-prod-tiering.json
fi
```

### MinIO 백업 모니터링

```bash
#!/bin/bash
# questdb-minio-backup-monitor.sh

MINIO_ALIAS="${MINIO_ALIAS:-questdb-backup}"
ALERT_EMAIL="admin@example.com"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# 최근 백업 확인
LATEST_PARTITION=$(mc ls "${MINIO_ALIAS}/questdb-partitions" --recursive | \
    grep "\.tar\.gz$" | sort -r | head -1 | awk '{print $5}')

LATEST_FULL=$(mc ls "${MINIO_ALIAS}/questdb-full" --recursive | \
    grep "questdb-full-" | sort -r | head -1 | awk '{print $5}')

# 파티션 백업 체크 (48시간 이내)
if [ -z "$LATEST_PARTITION" ]; then
    echo "ALERT: No partition backup found in MinIO!" | \
        mail -s "QuestDB MinIO Backup Alert" "$ALERT_EMAIL"
else
    # 백업 파일의 날짜 추출 및 확인
    BACKUP_DATE=$(echo "$LATEST_PARTITION" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
    if [ -n "$BACKUP_DATE" ]; then
        BACKUP_EPOCH=$(date -d "$BACKUP_DATE" +%s)
        CURRENT_EPOCH=$(date +%s)
        AGE_HOURS=$(( (CURRENT_EPOCH - BACKUP_EPOCH) / 3600 ))
        
        if [ $AGE_HOURS -gt 48 ]; then
            echo "ALERT: Latest partition backup is ${AGE_HOURS} hours old!" | \
                mail -s "QuestDB MinIO Backup Alert" "$ALERT_EMAIL"
        fi
    fi
fi

# 전체 백업 체크 (8일 이내)
if [ -z "$LATEST_FULL" ]; then
    echo "ALERT: No full backup found in MinIO!" | \
        mail -s "QuestDB MinIO Backup Alert" "$ALERT_EMAIL"
else
    BACKUP_DATE=$(echo "$LATEST_FULL" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
    if [ -n "$BACKUP_DATE" ]; then
        BACKUP_EPOCH=$(date -d "$BACKUP_DATE" +%s)
        CURRENT_EPOCH=$(date +%s)
        AGE_DAYS=$(( (CURRENT_EPOCH - BACKUP_EPOCH) / 86400 ))
        
        if [ $AGE_DAYS -gt 8 ]; then
            echo "ALERT: Latest full backup is ${AGE_DAYS} days old!" | \
                mail -s "QuestDB MinIO Backup Alert" "$ALERT_EMAIL"
        fi
    fi
fi

# 버킷 용량 확인
PARTITION_SIZE=$(mc du "${MINIO_ALIAS}/questdb-partitions" | awk '{print $1}')
FULL_SIZE=$(mc du "${MINIO_ALIAS}/questdb-full" | awk '{print $1}')

log "Partition backup size: ${PARTITION_SIZE}"
log "Full backup size: ${FULL_SIZE}"

log "MinIO backup monitoring completed"
```

---

## 하이브리드 백업 전략

### 권장 전략: 4단계 백업 (MinIO 포함, 프로덕션)

```
┌─────────────────────────────────────────────┐
│  Level 1: ZFS 스냅샷 (로컬)                │
│  ├─ 빈도: 6시간마다                         │
│  ├─ 보관: 7일 (프로덕션) / 24시간 (개발)    │
│  ├─ 용도: 즉시 복구, 실수 복구              │
│  ├─ 복구 시간: < 1분                        │
│  └─ 예상 용량: ~2.6GB (변경분만)            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Level 2: 파티션 백업 (로컬)                │
│  ├─ 빈도: 일 1회 (매일 자정)               │
│  ├─ 보관: 30일 (프로덕션) / 7일 (개발)      │
│  ├─ 용도: 일별 데이터 복구                  │
│  ├─ 복구 시간: 5-10분                       │
│  └─ 예상 용량: ~15.6GB (0.52GB × 30일)      │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Level 3: MinIO 파티션 백업 (오브젝트)     │
│  ├─ 빈도: 일 1회 (자정 이후)                │
│  ├─ 보관: 영구 보관 (프로덕션) / 30일 (개발) │
│  ├─ 용도: 원격 백업, 장기 보관              │
│  ├─ 복구 시간: 10-20분                      │
│  └─ 예상 용량: ~0.52GB/일, 연간 ~190GB      │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Level 4: MinIO 전체 백업 (오브젝트)       │
│  ├─ 빈도: 주 1회 (일요일)                  │
│  ├─ 보관: 영구 보관 (프로덕션) / 90일 (개발) │
│  ├─ 용도: 재해 복구, 장기 보관              │
│  ├─ 복구 시간: 30-60분                      │
│  └─ 예상 용량: ~3.67GB/주, 연간 ~191GB      │
└─────────────────────────────────────────────┘
```

### 백업 일정표 (프로덕션)

| 시간 | 작업 | 저장소 | 보관 기간 | 용도 |
|------|------|--------|----------|------|
| 00:00, 06:00, 12:00, 18:00 | ZFS 스냅샷 | 로컬 | 7일 (프로덕션) | 빠른 복구 |
| 00:00 (매일) | 파티션 백업 | 로컬 | 30일 (프로덕션) | 일별 복구 |
| 00:30 (매일) | MinIO 파티션 업로드 | MinIO | 영구 보관 | 원격 백업 |
| 02:00 (일요일) | 전체 백업 | MinIO | 영구 보관 | 재해 복구 |

**참고**: 개발 환경에서는 보관 기간이 짧습니다 (스냅샷: 24시간, 로컬 백업: 7일, MinIO: 30일/90일)

### 통합 백업 스크립트 (MinIO 포함)

```bash
#!/bin/bash
# questdb-hybrid-backup.sh

set -euo pipefail

POOL_NAME="bonanza"
QDB_VOLUME="bonanza/questdb"
QDB_DATA_DIR="/var/lib/questdb/db"
BACKUP_BASE_DIR="/backup/questdb"
MINIO_ALIAS="${MINIO_ALIAS:-questdb-backup}"
MINIO_PARTITION_BUCKET="${MINIO_PARTITION_BUCKET:-questdb-partitions}"
MINIO_FULL_BUCKET="${MINIO_FULL_BUCKET:-questdb-full}"

CURRENT_HOUR=$(date +%H)
CURRENT_MINUTE=$(date +%M)
CURRENT_DAY=$(date +%u)  # 1=Monday, 7=Sunday
DATE=$(date +%Y-%m-%d)
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# MinIO 클라이언트 확인
MC_CMD="mc"
if ! command -v mc &> /dev/null; then
    # Docker를 통한 MinIO 클라이언트 사용
    MC_CMD="docker run --rm -v ~/.mc:/root/.mc minio/mc"
fi

# Level 1: ZFS 스냅샷 (6시간마다)
if [ "$((10#$CURRENT_HOUR % 6))" -eq 0 ]; then
    log "=== Level 1: Creating ZFS snapshot ==="
    
    SNAPSHOT_NAME="${QDB_VOLUME}@snapshot-$(date +%Y%m%d-%H%M%S)"
    zfs snapshot "$SNAPSHOT_NAME"
    log "ZFS snapshot created: ${SNAPSHOT_NAME}"
    
    # 프로덕션 환경: 7일 이상 된 스냅샷 삭제 (개발 환경: 24시간)
    RETENTION_HOURS=${RETENTION_HOURS:-168}  # 기본값: 7일 (168시간)
    if [ "${NODE_ENV}" = "production" ]; then
        RETENTION_HOURS=168  # 프로덕션: 7일
    else
        RETENTION_HOURS=24   # 개발: 24시간
    fi
    
    zfs list -t snapshot -o name,creation | grep "${QDB_VOLUME}@snapshot" | \
    while read snapshot creation; do
        CREATION_EPOCH=$(date -d "$creation" +%s 2>/dev/null || echo 0)
        CURRENT_EPOCH=$(date +%s)
        AGE_HOURS=$(( (CURRENT_EPOCH - CREATION_EPOCH) / 3600 ))
        
        if [ $AGE_HOURS -gt $RETENTION_HOURS ]; then
            log "Deleting old snapshot: $snapshot (age: ${AGE_HOURS} hours, retention: ${RETENTION_HOURS} hours)"
            zfs destroy "$snapshot"
        fi
    done
fi

# Level 2: 파티션 백업 (매일 자정)
if [ "$CURRENT_HOUR" -eq 0 ] && [ "$CURRENT_MINUTE" -lt 30 ]; then
    log "=== Level 2: Creating partition backup ==="
    
    BACKUP_DIR="${BACKUP_BASE_DIR}/partitions/${YESTERDAY}"
    mkdir -p "$BACKUP_DIR"
    
    TABLES=("tb_order_book" "tb_ticker" "tb_exchange_trade" "tb_fkbrti_1sec" "tb_report" "tb_system_log")
    
    for TABLE in "${TABLES[@]}"; do
        PARTITION_DIR="${QDB_DATA_DIR}/${TABLE}/${YESTERDAY}"
        
        if [ -d "$PARTITION_DIR" ]; then
            BACKUP_FILE="${BACKUP_DIR}/${TABLE}_${YESTERDAY}.tar.gz"
            tar czf "$BACKUP_FILE" -C "${QDB_DATA_DIR}/${TABLE}" "${YESTERDAY}"
            log "Partition backed up: ${TABLE}_${YESTERDAY}.tar.gz"
        fi
    done
    
    # 프로덕션 환경: 30일 이상 된 로컬 백업 삭제 (개발 환경: 7일)
    if [ "${NODE_ENV}" = "production" ]; then
        RETENTION_DAYS=30  # 프로덕션: 30일
    else
        RETENTION_DAYS=7   # 개발: 7일
    fi
    find "${BACKUP_BASE_DIR}/partitions" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true
fi

# Level 3: MinIO 파티션 백업 (매일 자정 30분)
if [ "$CURRENT_HOUR" -eq 0 ] && [ "$CURRENT_MINUTE" -ge 30 ]; then
    log "=== Level 3: Uploading partition backup to MinIO ==="
    
    BACKUP_DIR="${BACKUP_BASE_DIR}/partitions/${YESTERDAY}"
    TABLES=("tb_order_book" "tb_ticker" "tb_exchange_trade" "tb_fkbrti_1sec" "tb_report" "tb_system_log")
    
    for TABLE in "${TABLES[@]}"; do
        BACKUP_FILE="${BACKUP_DIR}/${TABLE}_${YESTERDAY}.tar.gz"
        
        if [ -f "$BACKUP_FILE" ]; then
            MINIO_PATH="${MINIO_PARTITION_BUCKET}/${TABLE}/${YESTERDAY}/${TABLE}_${YESTERDAY}.tar.gz"
            
            log "Uploading ${TABLE} to MinIO..."
            if $MC_CMD cp "$BACKUP_FILE" "${MINIO_ALIAS}/${MINIO_PATH}"; then
                log "SUCCESS: ${TABLE} uploaded to MinIO"
            else
                log "ERROR: Failed to upload ${TABLE} to MinIO"
            fi
        fi
    done
    
    # 프로덕션 환경: MinIO 백업은 영구 보관 (자동 삭제 없음)
    # 개발 환경: 30일 이상 된 백업 삭제
    if [ "${NODE_ENV}" != "production" ]; then
        log "Cleaning up old MinIO partition backups (dev environment only)..."
        for TABLE in "${TABLES[@]}"; do
            $MC_CMD find "${MINIO_ALIAS}/${MINIO_PARTITION_BUCKET}/${TABLE}" \
                --older-than 30d \
                --exec "$MC_CMD rm {}" 2>/dev/null || true
        done
    else
        log "Production environment: MinIO backups are kept permanently (no auto-deletion)"
    fi
fi

# Level 4: MinIO 전체 백업 (일요일 새벽 2시)
if [ "$CURRENT_DAY" -eq 7 ] && [ "$CURRENT_HOUR" -eq 2 ]; then
    log "=== Level 4: Creating full backup and uploading to MinIO ==="
    
    FULL_BACKUP_DIR="${BACKUP_BASE_DIR}/full/${DATE}"
    mkdir -p "$FULL_BACKUP_DIR"
    
    FULL_BACKUP_FILE="${FULL_BACKUP_DIR}/questdb-full-${DATE}.tar.gz"
    
    # QuestDB 데이터 디렉토리 전체 백업
    log "Creating full backup archive..."
    tar czf "$FULL_BACKUP_FILE" \
        -C "$(dirname $QDB_DATA_DIR)" "$(basename $QDB_DATA_DIR)"
    
    log "Full backup created: questdb-full-${DATE}.tar.gz"
    
    # MinIO에 업로드
    MINIO_PATH="${MINIO_FULL_BUCKET}/questdb-full-${DATE}.tar.gz"
    log "Uploading full backup to MinIO..."
    
    if $MC_CMD cp "$FULL_BACKUP_FILE" "${MINIO_ALIAS}/${MINIO_PATH}"; then
        BACKUP_SIZE=$(du -h "$FULL_BACKUP_FILE" | cut -f1)
        log "SUCCESS: Full backup uploaded to MinIO (${BACKUP_SIZE})"
    else
        log "ERROR: Failed to upload full backup to MinIO"
    fi
    
    # 로컬 전체 백업 삭제 (선택사항)
    # rm -f "$FULL_BACKUP_FILE"
    
    # 프로덕션 환경: MinIO 전체 백업은 영구 보관 (자동 삭제 없음)
    # 개발 환경: 90일 이상 된 백업 삭제
    if [ "${NODE_ENV}" != "production" ]; then
        log "Cleaning up old MinIO full backups (dev environment only)..."
        $MC_CMD find "${MINIO_ALIAS}/${MINIO_FULL_BUCKET}" \
            --older-than 90d \
            --exec "$MC_CMD rm {}" 2>/dev/null || true
    else
        log "Production environment: MinIO full backups are kept permanently (no auto-deletion)"
    fi
fi

log "Backup process completed"
```

---

## 프로세스 재시작 및 크래시 대응 전략

### 개요

QuestDB는 시계열 데이터베이스로 실시간 데이터 수집이 중요한 시스템입니다. 프로세스 재시작이나 갑작스러운 크래시 발생 시에도 데이터 손실 없이 서비스를 지속적으로 제공하기 위한 이중화 전략을 제시합니다.

### 현재 구성 분석

**현재 상태:**
- **배포 방식**: Kubernetes StatefulSet
- **인스턴스 수**: 1개 (replicas: 1)
- **스토리지**: PersistentVolumeClaim (ZFS 기반)
- **WAL 모드**: 활성화 (Write-Ahead Logging)
- **자동 복구**: Kubernetes Health Check 활성화

**장점:**
- WAL 모드를 통한 데이터 일관성 보장
- PersistentVolume을 통한 데이터 영구 저장
- Kubernetes의 자동 재시작 기능

**한계점:**
- 단일 인스턴스로 인한 단일 장애점(SPOF) 존재
- 장애 시 수동 개입 필요 가능성
- 자동 장애 전환(Failover) 미지원

---

### 전략 1: Kubernetes 기반 자동 복구 (현재 구성 강화)

#### 1.1 Health Check 최적화

현재 StatefulSet에 설정된 Health Check를 강화하여 빠른 장애 감지 및 자동 복구를 보장합니다.

```yaml
# k8s/questdb/statefulset.yaml (개선된 버전)
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: questdb
  namespace: bonanza-index
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: questdb
        # ... 기존 설정 ...
        
        # Startup Probe: 초기 시작 시간 여유 제공
        startupProbe:
          httpGet:
            path: /ping
            port: 9000
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 24  # 최대 2분 대기 (5초 × 24)
          successThreshold: 1
        
        # Liveness Probe: 프로세스 크래시 감지
        livenessProbe:
          httpGet:
            path: /ping
            port: 9000
          initialDelaySeconds: 30
          periodSeconds: 10      # 10초마다 체크 (기존 30초에서 단축)
          timeoutSeconds: 5
          failureThreshold: 3    # 3회 실패 시 재시작 (기존 5회에서 단축)
          successThreshold: 1
        
        # Readiness Probe: 트래픽 수신 준비 상태 확인
        readinessProbe:
          httpGet:
            path: /ping
            port: 9000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 3    # 3회 실패 시 트래픽 차단
        
        # Graceful Shutdown: 안전한 종료 보장
        lifecycle:
          preStop:
            exec:
              command: 
              - /bin/sh
              - -c
              - |
                # QuestDB 안전 종료 (WAL 커밋 대기)
                curl -X POST http://localhost:9000/exec?query=SHUTDOWN || true
                sleep 15  # WAL 커밋 대기 시간
          postStart:
            exec:
              command:
              - /bin/sh
              - -c
              - |
                # 시작 후 초기화 작업 (필요시)
                echo "QuestDB container started"
        
        # 리소스 제한: OOM 방지
        resources:
          requests:
            memory: "2Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"        # OOM으로 인한 크래시 방지
            cpu: "1000m"
        
        # 종료 유예 시간: WAL 커밋 시간 확보
        terminationGracePeriodSeconds: 90  # 기존 60초에서 증가
```

**장점:**
- 빠른 장애 감지 (10초 주기)
- 자동 재시작 (3회 실패 시)
- Graceful Shutdown으로 데이터 손실 방지
- OOM 방지를 통한 크래시 예방

**예상 복구 시간:**
- 크래시 감지: 10-30초
- 자동 재시작: 1-2분
- 서비스 복구: 2-3분

#### 1.2 Pod Disruption Budget 설정

의도하지 않은 Pod 종료를 방지하고 가용성을 보장합니다.

```yaml
# k8s/questdb/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: questdb-pdb
  namespace: bonanza-index
spec:
  minAvailable: 1  # 최소 1개 Pod 유지
  selector:
    matchLabels:
      app: questdb
```

#### 1.3 자동 재시작 정책

Kubernetes의 기본 재시작 정책을 활용합니다.

```yaml
# StatefulSet에 포함
spec:
  template:
    spec:
      restartPolicy: Always  # 항상 재시작 (기본값)
      # 실패한 컨테이너는 자동으로 재시작됨
```

---

### 전략 2: WAL 기반 데이터 복구

#### 2.1 WAL 모드의 장점

QuestDB의 WAL(Write-Ahead Logging) 모드는 크래시 발생 시에도 데이터 일관성을 보장합니다.

**WAL 동작 원리:**
1. 모든 쓰기 작업이 먼저 WAL 파일에 기록됨
2. 주기적으로 WAL을 데이터 파일에 적용(Commit)
3. 크래시 발생 시 재시작 시 WAL을 자동으로 재적용

**현재 설정 확인:**
```sql
-- WAL 모드 확인
SELECT * FROM tables() WHERE wal = true;

-- WAL 설정 확인
SHOW PARAMETERS LIKE 'cairo.wal%';
```

#### 2.2 WAL 커밋 주기 최적화

크래시 시 데이터 손실을 최소화하기 위해 WAL 커밋 주기를 조정합니다.

```yaml
# configmap-server.conf.yaml (개선된 버전)
apiVersion: v1
kind: ConfigMap
metadata:
  name: questdb-server-config
  namespace: bonanza-index
data:
  server.conf: |
    # WAL 설정 (크래시 복구 최적화)
    cairo.wal.apply.enabled.default=true
    cairo.wal.apply.table.policy=default
    
    # WAL 커밋 주기 (기본값: 1초)
    # 더 짧은 주기 = 더 빠른 복구, 더 많은 I/O
    # 더 긴 주기 = 더 적은 I/O, 더 많은 데이터 손실 위험
    cairo.wal.commit.mode=nosync  # 성능 우선 (기본값)
    # 또는
    # cairo.wal.commit.mode=sync  # 안정성 우선 (느림)
    
    # WAL 세그먼트 크기
    cairo.wal.segment.size=1048576  # 1MB (기본값)
    
    # WAL 복구 설정
    cairo.wal.apply.enabled.default=true
    cairo.wal.apply.table.policy=default
```

**권장 설정:**
- **프로덕션**: `nosync` 모드 (성능 우선, 최대 1초 데이터 손실 가능)
- **중요 데이터**: `sync` 모드 (안정성 우선, 느리지만 데이터 손실 없음)

#### 2.3 크래시 복구 프로세스

```bash
#!/bin/bash
# questdb-crash-recovery.sh

# QuestDB 크래시 감지 및 복구 스크립트

QDB_POD="questdb-0"
NAMESPACE="bonanza-index"
LOG_FILE="/var/log/questdb-recovery.log"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# 1. Pod 상태 확인
POD_STATUS=$(kubectl get pod "$QDB_POD" -n "$NAMESPACE" -o jsonpath='{.status.phase}')

if [ "$POD_STATUS" != "Running" ]; then
    log "WARNING: QuestDB Pod is not running (status: $POD_STATUS)"
    
    # 2. 크래시 로그 확인
    log "Checking crash logs..."
    kubectl logs "$QDB_POD" -n "$NAMESPACE" --tail=100 | grep -i "error\|exception\|crash" | tee -a "$LOG_FILE"
    
    # 3. WAL 복구 상태 확인
    log "Checking WAL recovery status..."
    kubectl exec "$QDB_POD" -n "$NAMESPACE" -- \
        curl -s http://localhost:9000/exec?query=SHOW+PARAMETERS+LIKE+%27cairo.wal%25%27
    
    # 4. 자동 재시작 (Kubernetes가 자동으로 처리하지만 확인)
    log "Waiting for automatic restart..."
    sleep 30
    
    # 5. 복구 후 상태 확인
    NEW_STATUS=$(kubectl get pod "$QDB_POD" -n "$NAMESPACE" -o jsonpath='{.status.phase}')
    if [ "$NEW_STATUS" = "Running" ]; then
        log "SUCCESS: QuestDB recovered successfully"
        
        # 6. 데이터 무결성 확인
        log "Verifying data integrity..."
        kubectl exec "$QDB_POD" -n "$NAMESPACE" -- \
            curl -s "http://localhost:9000/exec?query=SELECT+count(*)+FROM+tb_order_book+LATEST+BY+marketAt"
    else
        log "ERROR: QuestDB recovery failed. Manual intervention required."
        exit 1
    fi
else
    log "QuestDB is running normally"
fi
```

---

### 전략 3: Active-Standby 이중화 (고가용성)

#### 3.1 구성 개요

단일 인스턴스의 한계를 극복하기 위한 Active-Standby 구성입니다.

```
┌─────────────────────────────────────────┐
│  Active QuestDB (questdb-0)            │
│  - 읽기/쓰기 처리                       │
│  - 실시간 데이터 수집                    │
└─────────────────────────────────────────┘
              │
              │ WAL 복제 (주기적)
              ↓
┌─────────────────────────────────────────┐
│  Standby QuestDB (questdb-1)           │
│  - 읽기 전용 (선택사항)                  │
│  - 자동 장애 전환 대기                    │
└─────────────────────────────────────────┘
```

#### 3.2 StatefulSet 확장

```yaml
# k8s/questdb/statefulset-ha.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: questdb
  namespace: bonanza-index
spec:
  serviceName: questdb-service
  replicas: 2  # Active + Standby
  
  template:
    spec:
      containers:
      - name: questdb
        # ... 기존 설정 ...
        
        # 환경 변수로 역할 구분
        env:
        - name: QDB_NODE_ROLE
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        # questdb-0: Active, questdb-1: Standby
```

#### 3.3 데이터 복제 전략

**방법 1: ZFS 스냅샷 기반 복제**

```bash
#!/bin/bash
# questdb-replication.sh

# Active에서 Standby로 데이터 복제

ACTIVE_POD="questdb-0"
STANDBY_POD="questdb-1"
NAMESPACE="bonanza-index"
REPLICATION_INTERVAL=300  # 5분마다

while true; do
    # 1. Active에서 스냅샷 생성
    kubectl exec "$ACTIVE_POD" -n "$NAMESPACE" -- \
        zfs snapshot bonanza/questdb@replication-$(date +%Y%m%d-%H%M%S)
    
    # 2. Standby로 스냅샷 전송
    LATEST_SNAPSHOT=$(zfs list -t snapshot -o name -S creation | grep questdb@replication | head -1)
    
    kubectl exec "$STANDBY_POD" -n "$NAMESPACE" -- \
        zfs receive bonanza/questdb-standby < "$LATEST_SNAPSHOT"
    
    # 3. Standby 롤백
    kubectl exec "$STANDBY_POD" -n "$NAMESPACE" -- \
        zfs rollback "$LATEST_SNAPSHOT"
    
    sleep "$REPLICATION_INTERVAL"
done
```

**방법 2: MinIO 기반 복제**

```bash
#!/bin/bash
# questdb-minio-replication.sh

# Active의 최신 파티션을 MinIO를 통해 Standby로 복제

ACTIVE_POD="questdb-0"
STANDBY_POD="questdb-1"
NAMESPACE="bonanza-index"
MINIO_ALIAS="questdb-backup"
MINIO_BUCKET="questdb-replication"

# 1. Active에서 최신 파티션 백업
DATE=$(date -d "yesterday" +%Y-%m-%d)
kubectl exec "$ACTIVE_POD" -n "$NAMESPACE" -- \
    tar czf /tmp/latest-partitions.tar.gz -C /var/lib/questdb/db .

# 2. MinIO에 업로드
kubectl exec "$ACTIVE_POD" -n "$NAMESPACE" -- \
    mc cp /tmp/latest-partitions.tar.gz \
    "${MINIO_ALIAS}/${MINIO_BUCKET}/latest-partitions.tar.gz"

# 3. Standby에서 다운로드 및 복원
kubectl exec "$STANDBY_POD" -n "$NAMESPACE" -- \
    mc cp "${MINIO_ALIAS}/${MINIO_BUCKET}/latest-partitions.tar.gz" /tmp/

kubectl exec "$STANDBY_POD" -n "$NAMESPACE" -- \
    tar xzf /tmp/latest-partitions.tar.gz -C /var/lib/questdb/db
```

#### 3.4 자동 장애 전환 (Failover)

```yaml
# k8s/questdb/failover-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: questdb-active
  namespace: bonanza-index
spec:
  type: ClusterIP
  selector:
    app: questdb
    role: active  # Active Pod만 선택
  ports:
  - port: 8812
    name: pgwire
  - port: 9000
    name: rest
  - port: 9009
    name: ilp
---
# Failover 스크립트를 실행하는 CronJob
apiVersion: batch/v1
kind: CronJob
metadata:
  name: questdb-failover-check
  namespace: bonanza-index
spec:
  schedule: "*/30 * * * *"  # 30초마다 체크
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: failover-check
            image: bitnami/kubectl:latest
            command:
            - /bin/sh
            - -c
            - |
              # Active Pod 상태 확인
              ACTIVE_STATUS=$(kubectl get pod questdb-0 -n bonanza-index -o jsonpath='{.status.phase}')
              
              if [ "$ACTIVE_STATUS" != "Running" ]; then
                echo "Active Pod failed. Initiating failover..."
                
                # Standby를 Active로 전환
                kubectl label pod questdb-1 -n bonanza-index role=active --overwrite
                kubectl label pod questdb-0 -n bonanza-index role=standby --overwrite
                
                # Service 업데이트 (자동으로 새 Active 선택)
                echo "Failover completed"
              fi
          restartPolicy: OnFailure
```

---

### 전략 4: 애플리케이션 레벨 복원력

#### 4.1 연결 재시도 로직

QuestDB에 연결하는 애플리케이션에서 자동 재연결 로직을 구현합니다.

```javascript
// be/orderbook-storage-worker/src/db/quest_db.js (개선된 버전)

const MAX_RETRIES = 5;
const RETRY_DELAY = 1000; // 1초

async function connect_quest_db(host, port, retries = 0) {
    try {
        const client = new Client({
            host: host,
            port: port,
            database: 'qdb',
            user: 'admin',
            // 연결 타임아웃 설정
            connectionTimeoutMillis: 5000,
            // 자동 재연결 설정
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
        });
        
        await client.connect();
        console.log(`Connected to QuestDB at ${host}:${port}`);
        return client;
        
    } catch (error) {
        console.error(`Connection attempt ${retries + 1} failed:`, error.message);
        
        if (retries < MAX_RETRIES) {
            console.log(`Retrying in ${RETRY_DELAY}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retries + 1)));
            return connect_quest_db(host, port, retries + 1);
        } else {
            console.error('Max retries reached. Connection failed.');
            throw error;
        }
    }
}

// 연결 끊김 감지 및 자동 재연결
function setupAutoReconnect(client, host, port) {
    client.on('error', async (error) => {
        console.error('QuestDB connection error:', error);
        console.log('Attempting to reconnect...');
        
        try {
            await client.end();
            const newClient = await connect_quest_db(host, port);
            // 전역 클라이언트 참조 업데이트
            return newClient;
        } catch (reconnectError) {
            console.error('Reconnection failed:', reconnectError);
        }
    });
}
```

#### 4.2 데이터 버퍼링

크래시 발생 시 데이터 손실을 방지하기 위해 임시 버퍼를 사용합니다.

```javascript
// 데이터 버퍼링 예시
class QuestDBBuffer {
    constructor(maxSize = 10000) {
        this.buffer = [];
        this.maxSize = maxSize;
    }
    
    async add(data) {
        this.buffer.push({
            data,
            timestamp: Date.now()
        });
        
        // 버퍼가 가득 차면 자동 플러시
        if (this.buffer.length >= this.maxSize) {
            await this.flush();
        }
    }
    
    async flush() {
        if (this.buffer.length === 0) return;
        
        try {
            // QuestDB에 일괄 삽입
            await this.insertToQuestDB(this.buffer.map(item => item.data));
            this.buffer = [];
        } catch (error) {
            console.error('Flush failed. Data remains in buffer:', error);
            // 실패 시 버퍼 유지 (재시도 가능)
        }
    }
    
    // 주기적 플러시 (예: 5초마다)
    startPeriodicFlush(interval = 5000) {
        setInterval(() => {
            this.flush();
        }, interval);
    }
}
```

---

### 전략 5: 모니터링 및 알림

#### 5.1 크래시 감지 모니터링

```yaml
# k8s/questdb/monitoring.yaml
apiVersion: v1
kind: ServiceMonitor
metadata:
  name: questdb-monitor
  namespace: bonanza-index
spec:
  selector:
    matchLabels:
      app: questdb
  endpoints:
  - port: rest
    path: /metrics
    interval: 30s
---
# Prometheus 알림 규칙
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: questdb-alerts
  namespace: bonanza-index
spec:
  groups:
  - name: questdb
    rules:
    # Pod 재시작 감지
    - alert: QuestDBPodRestart
      expr: increase(kube_pod_container_status_restarts_total{pod=~"questdb-.*"}[5m]) > 0
      for: 1m
      annotations:
        summary: "QuestDB Pod가 재시작되었습니다"
        description: "Pod {{ $labels.pod }}가 {{ $value }}회 재시작되었습니다"
    
    # 크래시 감지
    - alert: QuestDBCrash
      expr: kube_pod_status_phase{pod=~"questdb-.*", phase!="Running"} == 1
      for: 2m
      annotations:
        summary: "QuestDB Pod가 크래시되었습니다"
        description: "Pod {{ $labels.pod }}가 {{ $labels.phase }} 상태입니다"
    
    # 연결 실패 감지
    - alert: QuestDBConnectionFailure
      expr: questdb_http_requests_total{status=~"5.."} > 10
      for: 1m
      annotations:
        summary: "QuestDB 연결 실패가 발생했습니다"
        description: "HTTP 5xx 에러가 {{ $value }}회 발생했습니다"
```

#### 5.2 복구 시간 추적

```bash
#!/bin/bash
# questdb-recovery-time-tracker.sh

# 크래시부터 복구까지의 시간을 추적하는 스크립트

LOG_FILE="/var/log/questdb-recovery-times.log"

track_recovery() {
    CRASH_TIME=$(date +%s)
    
    # 크래시 감지 대기
    while kubectl get pod questdb-0 -n bonanza-index -o jsonpath='{.status.phase}' | grep -q Running; do
        sleep 5
    done
    
    CRASH_DETECTED=$(date +%s)
    echo "Crash detected at $(date)" >> "$LOG_FILE"
    
    # 복구 대기
    while ! kubectl get pod questdb-0 -n bonanza-index -o jsonpath='{.status.phase}' | grep -q Running; do
        sleep 5
    done
    
    RECOVERY_TIME=$(date +%s)
    DOWNTIME=$((RECOVERY_TIME - CRASH_DETECTED))
    
    echo "Recovery completed at $(date)" >> "$LOG_FILE"
    echo "Downtime: ${DOWNTIME} seconds" >> "$LOG_FILE"
    echo "---" >> "$LOG_FILE"
}
```

---

### 전략 비교 및 권장사항

| 전략 | 복구 시간 | 구현 난이도 | 비용 | 데이터 손실 위험 |
|------|----------|------------|------|----------------|
| **전략 1: Kubernetes 자동 복구** | 2-3분 | 낮음 | 낮음 | 낮음 (WAL 보호) |
| **전략 2: WAL 복구** | 1-2분 | 낮음 | 낮음 | 매우 낮음 |
| **전략 3: Active-Standby** | < 1분 | 높음 | 중간 | 없음 |
| **전략 4: 애플리케이션 복원력** | 즉시 | 중간 | 낮음 | 낮음 (버퍼) |
| **전략 5: 모니터링** | - | 낮음 | 낮음 | - |

### 최종 권장 전략

**현재 구성 (단일 인스턴스) 강화:**
1. ✅ **전략 1 + 전략 2 조합** (즉시 적용 가능)
   - Health Check 최적화
   - WAL 커밋 주기 조정
   - Graceful Shutdown 보장
   - 예상 복구 시간: 2-3분

**향후 고가용성 구성:**
2. **전략 3: Active-Standby** (고가용성 필요 시)
   - 자동 장애 전환
   - 예상 복구 시간: < 1분
   - 추가 리소스 필요

**모든 구성에 필수:**
3. ✅ **전략 4 + 전략 5** (애플리케이션 레벨)
   - 연결 재시도 로직
   - 데이터 버퍼링
   - 모니터링 및 알림

---

## 복구 시나리오

### 시나리오 1: 실수로 데이터 삭제 (최근 6시간 이내)

**복구 방법: ZFS 스냅샷 롤백**

```bash
# 1. 사용 가능한 스냅샷 확인
zfs list -t snapshot | grep questdb@snapshot

# 2. QuestDB 중지
kubectl scale statefulset questdb --replicas=0 -n bonanza-index

# 3. 스냅샷으로 롤백
zfs rollback bonanza/questdb@snapshot-20251128-120000

# 4. QuestDB 재시작
kubectl scale statefulset questdb --replicas=1 -n bonanza-index
```

**예상 복구 시간**: < 1분

### 시나리오 2: 특정 날짜 데이터 복구 (최근 7일 이내)

**복구 방법: 파티션 백업 복원**

```bash
# 1. QuestDB 중지
kubectl scale statefulset questdb --replicas=0 -n bonanza-index

# 2. 백업 파일 확인
ls -lh /backup/questdb/partitions/2025-11-28/

# 3. 파티션 복원
cd /var/lib/questdb/db/tb_order_book
tar xzf /backup/questdb/partitions/2025-11-28/tb_order_book_2025-11-28.tar.gz

# 4. QuestDB 재시작
kubectl scale statefulset questdb --replicas=1 -n bonanza-index
```

**예상 복구 시간**: 5-10분

### 시나리오 3: MinIO에서 특정 날짜 파티션 복구

**복구 방법: MinIO에서 파티션 다운로드 및 복원**

```bash
# 1. QuestDB 중지
kubectl scale statefulset questdb --replicas=0 -n bonanza-index

# 2. MinIO에서 파티션 다운로드
mc cp questdb-backup/questdb-partitions/tb_order_book/2025-11-28/tb_order_book_2025-11-28.tar.gz \
    /tmp/

# 3. 파티션 복원
tar xzf /tmp/tb_order_book_2025-11-28.tar.gz \
    -C /var/lib/questdb/db/tb_order_book/

# 4. QuestDB 재시작
kubectl scale statefulset questdb --replicas=1 -n bonanza-index
```

**예상 복구 시간**: 10-20분

### 시나리오 4: 전체 데이터베이스 복구 (재해 복구)

**복구 방법: MinIO에서 전체 백업 복원**

```bash
# 1. 새 서버에 QuestDB 설치

# 2. MinIO에서 전체 백업 다운로드
mc cp questdb-backup/questdb-full/questdb-full-2025-11-28.tar.gz \
    /tmp/

# 3. 전체 백업 복원
tar xzf /tmp/questdb-full-2025-11-28.tar.gz \
    -C /var/lib/questdb/

# 4. QuestDB 시작
kubectl apply -f k8s/questdb/statefulset.yaml
```

**예상 복구 시간**: 30-60분

### 시나리오 5: 특정 테이블의 특정 날짜 복구

**복구 방법: SELECT 쿼리로 데이터 추출 후 재삽입**

```sql
-- 1. 백업에서 데이터 추출
COPY (
    SELECT * FROM tb_order_book 
    WHERE marketAt >= '2025-11-28' AND marketAt < '2025-11-29'
) TO '/tmp/restore_data.csv' WITH HEADER;

-- 2. 기존 데이터 삭제 (필요한 경우)
DELETE FROM tb_order_book 
WHERE marketAt >= '2025-11-28' AND marketAt < '2025-11-29';

-- 3. 데이터 재삽입
COPY '/tmp/restore_data.csv' INTO tb_order_book;
```

---

## 자동화 스크립트

### Kubernetes CronJob 설정

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: questdb-backup
  namespace: bonanza-index
spec:
  schedule: "0 * * * *"  # 매시간 실행 (스크립트 내에서 시간별 분기)
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  jobTemplate:
    spec:
      template:
        spec:
          hostNetwork: true
          hostPID: true
          serviceAccountName: questdb-backup
          containers:
          - name: backup
            image: ubuntu:22.04
            securityContext:
              privileged: true
            volumeMounts:
            - name: questdb-data
              mountPath: /var/lib/questdb
            - name: backup-storage
              mountPath: /backup
            - name: host
              mountPath: /host
            command:
            - /bin/bash
            - -c
            - |
              # 백업 스크립트 실행
              /host/usr/local/bin/questdb-hybrid-backup.sh
          volumes:
          - name: questdb-data
            persistentVolumeClaim:
              claimName: questdb-data-questdb-0
          - name: backup-storage
            persistentVolumeClaim:
              claimName: questdb-backup-storage
          - name: host
            hostPath:
              path: /
          restartPolicy: OnFailure
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: questdb-backup
  namespace: bonanza-index
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: questdb-backup
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list"]
- apiGroups: ["apps"]
  resources: ["statefulsets"]
  verbs: ["get", "list", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: questdb-backup
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: questdb-backup
subjects:
- kind: ServiceAccount
  name: questdb-backup
  namespace: bonanza-index
```

### 모니터링 및 알림

```bash
#!/bin/bash
# questdb-backup-monitor.sh

BACKUP_DIR="/backup/questdb"
ALERT_EMAIL="admin@example.com"

# 최근 백업 확인
LATEST_SNAPSHOT=$(zfs list -t snapshot -o name -S creation | grep questdb@snapshot | head -1)
LATEST_PARTITION=$(find "${BACKUP_DIR}/partitions" -type d -maxdepth 1 | sort -r | head -1)
LATEST_FULL=$(find "${BACKUP_DIR}/full" -type d -maxdepth 1 | sort -r | head -1)

# 스냅샷 체크 (24시간 이내)
if [ -z "$LATEST_SNAPSHOT" ]; then
    echo "ALERT: No ZFS snapshot found!" | mail -s "QuestDB Backup Alert" "$ALERT_EMAIL"
fi

# 파티션 백업 체크 (48시간 이내)
if [ -z "$LATEST_PARTITION" ] || [ $(find "$LATEST_PARTITION" -type f -mtime +2 | wc -l) -gt 0 ]; then
    echo "ALERT: Partition backup is outdated!" | mail -s "QuestDB Backup Alert" "$ALERT_EMAIL"
fi

# 전체 백업 체크 (8일 이내)
if [ -z "$LATEST_FULL" ] || [ $(find "$LATEST_FULL" -type f -mtime +8 | wc -l) -gt 0 ]; then
    echo "ALERT: Full backup is outdated!" | mail -s "QuestDB Backup Alert" "$ALERT_EMAIL"
fi

echo "Backup monitoring completed"
```

---

## 백업 검증

### 백업 무결성 검증

```bash
#!/bin/bash
# questdb-backup-verify.sh

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file.tar.gz>"
    exit 1
fi

# 압축 파일 검증
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
    echo "ERROR: Backup file is corrupted (gzip test failed)"
    exit 1
fi

# tar 아카이브 검증
if ! tar tzf "$BACKUP_FILE" > /dev/null 2>&1; then
    echo "ERROR: Backup file is corrupted (tar test failed)"
    exit 1
fi

# 파일 목록 확인
FILE_COUNT=$(tar tzf "$BACKUP_FILE" | wc -l)
echo "Backup file contains ${FILE_COUNT} files"

# 크기 확인
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup file size: ${BACKUP_SIZE}"

echo "Backup file verification passed"
```

### 정기적인 복구 테스트

```bash
#!/bin/bash
# questdb-backup-restore-test.sh

# 테스트 환경에서 백업 복구 테스트
TEST_DIR="/tmp/questdb-restore-test"
BACKUP_FILE="/backup/questdb/partitions/2025-11-28/tb_order_book_2025-11-28.tar.gz"

mkdir -p "$TEST_DIR"

# 백업 복원
tar xzf "$BACKUP_FILE" -C "$TEST_DIR"

# 파일 확인
if [ -d "$TEST_DIR/2025-11-28" ]; then
    echo "Restore test PASSED"
    rm -rf "$TEST_DIR"
    exit 0
else
    echo "Restore test FAILED"
    exit 1
fi
```

---

## 성능 고려사항

### 백업 시 성능 영향 최소화

1. **백업 시간대 선택**
   - 트래픽이 적은 시간대에 실행 (새벽 2-4시)
   - QuestDB WAL을 활용하여 읽기 전용 백업

2. **리소스 제한**
   - 백업 프로세스의 CPU/메모리 제한 설정
   - I/O 우선순위 조정

3. **병렬 처리**
   - 여러 테이블을 동시에 백업 (가능한 경우)
   - 네트워크 대역폭 고려

### 백업 크기 예상

#### 데이터 저장 빈도 및 스키마 분석

**tb_order_book (호가 데이터)**
- 저장 빈도: 1초당 1번, 4개 거래소, 2개 종목
- 레코드 구조: bid/ask 각각 상위 15개씩 저장 (receiver-pull-queue.js 기준)
- 1초당 레코드 수: 4거래소 × 2종목 × (15 bid + 15 ask) = 240 레코드/초
- 하루 레코드 수: 240 × 86,400초 = 20,736,000 레코드
- 레코드 크기: ~120바이트 (QuestDB 오버헤드 포함)
  - SYMBOL 필드: tran_date(8) + tran_time(6) + exchange_cd(10) + order_tp(1) = ~25바이트
  - LONG: price_id(8) + product_id(8) = 16바이트
  - DOUBLE: price(8) + size(8) + diff_ms(8) + diff_ms_db(8) = 32바이트
  - TIMESTAMP: marketAt(8) + coollectorAt(8) + dbAt(8) = 24바이트
  - 오버헤드: ~15바이트
- **일일 데이터량: ~2.37GB** (전체의 약 90%)

**tb_fkbrti_1sec (인덱스 데이터)**
- 저장 빈도: 1초당 1번, 4개 거래소, 2개 종목
- 1초당 레코드 수: 4거래소 × 2종목 = 8 레코드/초
- 하루 레코드 수: 8 × 86,400초 = 691,200 레코드
- 레코드 크기: ~150바이트
  - SYMBOL: tran_date(8) + tran_time(6) + symbol(10) = ~24바이트
  - DOUBLE: vwap_buy(8) + vwap_sell(8) + index_mid(8) + actual_avg(8) + diff(8) + ratio(8) = 48바이트
  - BOOLEAN: no_data(1) + provisional(1) + no_publish(1) = 3바이트
  - TEXT: expected_status(~50바이트)
  - TIMESTAMP: createdAt(8바이트)
  - 오버헤드: ~17바이트
- **일일 데이터량: ~0.10GB** (전체의 약 4%)

**tb_exchange_trade (거래 데이터)**
- 저장 빈도: 평균 90만건/일
- 레코드 크기: ~180바이트
  - STRING: tran_dt(8) + tran_tm(6) + sequential_id(30) + cont_dtm(20) = ~64바이트
  - SYMBOL: exchange_cd(10) + buy_sell_gb(1) = ~11바이트
  - LONG: price_id(8) + product_id(8) + timestamp(8) = 24바이트
  - DOUBLE: trade_price(8) + trade_volumn(8) + diff_ms(8) + diff_ms_db(8) = 32바이트
  - TIMESTAMP: marketAt(8) + collectorAt(8) + dbAt(8) = 24바이트
  - 오버헤드: ~25바이트
- **일일 데이터량: ~0.15GB** (전체의 약 6%)

**tb_system_log (시스템 로그)**
- 저장 빈도: 하루 100건 미만
- 레코드 크기: ~250바이트
  - TEXT: content(~200바이트)
  - TIMESTAMP: createdAt(8바이트)
  - 오버헤드: ~42바이트
- **일일 데이터량: ~0.000025GB** (무시 가능)

**tb_report (리포트)**
- 저장 빈도: 5분에 1번 = 288번/일 (24시간 × 60분 / 5분)
- 레코드 크기: ~600바이트
  - TEXT: title(~50바이트) + content(~500바이트)
  - TIMESTAMP: createdAt(8바이트)
  - 오버헤드: ~42바이트
- **일일 데이터량: ~0.00017GB** (무시 가능)

**tb_ticker**
- 사용 안함 (데이터 저장 없음)

#### 총 예상 데이터량

```
예상 데이터량 (일일, 압축 전):
- tb_order_book: ~2.37GB (90.4%)
- tb_fkbrti_1sec: ~0.10GB (3.8%)
- tb_exchange_trade: ~0.15GB (5.7%)
- tb_system_log: ~0.000025GB (0.001%)
- tb_report: ~0.00017GB (0.006%)
- tb_ticker: 0GB (사용 안함)
총계: ~2.62GB/일

백업 크기 (압축 후, 압축률 80%):
- 파티션 백업: ~0.52GB/일 (2.62GB × 0.2)
- 주간 전체 백업: ~3.67GB/주 (2.62GB × 7일 × 0.2)
- 월간 전체 백업: ~15.7GB/월 (2.62GB × 30일 × 0.2)
```

#### 데이터 분포 분석

| 테이블 | 일일 데이터량 | 비율 | 특징 |
|--------|--------------|------|------|
| tb_order_book | ~2.37GB | 90.4% | 가장 큰 비중, 호가 데이터 |
| tb_exchange_trade | ~0.15GB | 5.7% | 거래 데이터 |
| tb_fkbrti_1sec | ~0.10GB | 3.8% | 인덱스 데이터 |
| tb_report | ~0.00017GB | 0.006% | 무시 가능 |
| tb_system_log | ~0.000025GB | 0.001% | 무시 가능 |
| **총계** | **~2.62GB** | **100%** | |

### 저장 공간 요구사항 (프로덕션: 영구 보관)

#### 프로덕션 환경

- **로컬 스토리지**:
  - ZFS 스냅샷 (7일): ~2.6GB (변경분만 저장하므로 실제로는 더 적을 수 있음)
  - 파티션 백업 (30일): ~15.6GB (0.52GB × 30일)
  - 총 로컬 용량: ~20GB

- **MinIO 스토리지** (영구 보관):
  - 파티션 백업 (일일): ~0.52GB/일
  - 연간 파티션 백업: ~190GB/년 (0.52GB × 365일)
  - 전체 백업 (주간): ~3.67GB/주
  - 연간 전체 백업: ~191GB/년 (3.67GB × 52주)
  - **총 MinIO 용량 (1년)**: ~381GB
  - **총 MinIO 용량 (5년)**: ~1.9TB
  - **총 MinIO 용량 (10년)**: ~3.8TB

#### 개발 환경

- 로컬 (7일): ~3.6GB (0.52GB × 7일)
- MinIO 파티션 (30일): ~15.6GB (0.52GB × 30일)
- MinIO 전체 (90일): ~48GB (3.67GB × 13주)
- 총 MinIO 용량: ~64GB (압축 고려 시)

### 프로덕션 환경 스토리지 계획

장기 보관을 위한 스토리지 계획:

1. **초기 계획**: 최소 500GB 용량 확보 (1-2년 분)
2. **확장 계획**: 연간 ~380GB 증가 예상
3. **스토리지 계층화**: 
   - Hot Storage (최근 3개월): 빠른 SSD (~47GB)
   - Cold Storage (3개월 이상): 저렴한 HDD 또는 테이프
4. **압축 최적화**: 백업 파일 압축률 향상 (현재 80% → 목표 85%)
5. **중복 제거**: 동일 파티션의 중복 백업 방지
6. **용량 모니터링**: 
   - 월간 용량 증가: ~32GB/월 (0.52GB × 30일 + 3.67GB × 4주)
   - 연간 용량 증가: ~380GB/년
   - 10년 예상 총 용량: ~3.8TB
7. **데이터 분포**:
   - tb_order_book: 전체의 약 90% (가장 큰 비중)
   - tb_fkbrti_1sec: 전체의 약 4%
   - tb_exchange_trade: 전체의 약 6%
```

---

## 결론 및 권장사항

### 최종 권장 전략 (프로덕션: 영구 보관)

1. **ZFS 스냅샷**: 6시간마다, 7일 보관 (프로덕션)
   - 빠른 복구를 위한 1차 방어선
   - 로컬 저장소 사용
   - 프로덕션 환경에서는 7일 보관 (개발: 24시간)

2. **파티션 백업 (로컬)**: 매일 자정, 30일 보관 (프로덕션)
   - 일별 데이터 복구를 위한 2차 방어선
   - 로컬 디스크 사용
   - 프로덕션 환경에서는 30일 보관 (개발: 7일)

3. **MinIO 파티션 백업**: 매일 자정 30분, **영구 보관**
   - 원격 백업을 위한 3차 방어선
   - MinIO 오브젝트 스토리지 사용
   - **프로덕션: 자동 삭제 없음 (영구 보관)**
   - 개발 환경: 30일 보관

4. **MinIO 전체 백업**: 주 1회 (일요일), **영구 보관**
   - 재해 복구를 위한 최종 방어선
   - MinIO 오브젝트 스토리지 사용
   - **프로덕션: 자동 삭제 없음 (영구 보관)**
   - 개발 환경: 90일 보관

### 프로덕션 환경 특별 고려사항

- **QuestDB 데이터 보관**: 3개월 (90일) - QuestDB 자체 파티션 삭제 정책
- **백업 보관**: 영구 보관 - MinIO 백업은 자동 삭제하지 않음
- **스토리지 계층화**: 최근 3개월은 Hot Storage, 이후는 Cold Storage (선택사항)
- **비용 관리**: 장기 보관을 위한 스토리지 용량 계획 필요
- **백업 검증**: 정기적인 백업 무결성 검증 및 복구 테스트 필수

### 백업 전략 비교 (프로덕션)

| 백업 레벨 | 저장소 | 보관 기간 (프로덕션) | 보관 기간 (개발) | 복구 시간 | 용도 |
|----------|--------|---------------------|----------------|----------|------|
| Level 1: ZFS 스냅샷 | 로컬 | 7일 | 24시간 | < 1분 | 즉시 복구 (~2.6GB) |
| Level 2: 파티션 백업 | 로컬 | 30일 | 7일 | 5-10분 | 일별 복구 (~15.6GB) |
| Level 3: MinIO 파티션 | MinIO | **영구 보관** | 30일 | 10-20분 | 원격 백업 (~0.52GB/일) |
| Level 4: MinIO 전체 | MinIO | **영구 보관** | 90일 | 30-60분 | 재해 복구 (~3.67GB/주) |

### 모니터링 체크리스트

- [ ] 백업 작업이 정상적으로 실행되는지 확인
- [ ] 백업 파일 크기가 예상 범위 내인지 확인
- [ ] 백업 파일 무결성 정기 검증
- [ ] 복구 테스트 정기 수행 (월 1회)
- [ ] 백업 저장소 용량 모니터링
- [ ] 백업 실패 시 알림 설정
- [ ] MinIO 연결 상태 모니터링
- [ ] MinIO 버킷 용량 모니터링
- [ ] MinIO 라이프사이클 정책 확인

### MinIO 사용 시 장점

1. **S3 호환성**: AWS S3 API와 완전 호환으로 다양한 도구 사용 가능
2. **확장성**: 수평 확장 가능한 오브젝트 스토리지
3. **비용 효율**: 오픈소스, 자체 호스팅 가능
4. **버전 관리**: 오브젝트 버전 관리로 실수 복구 용이
5. **라이프사이클 정책**: 자동 삭제/전환 정책으로 관리 자동화
6. **암호화**: 전송 및 저장 시 암호화 지원
7. **중복 제거**: 동일 파일의 중복 저장 방지

### 주의사항

1. **QuestDB WAL 모드**: WAL 모드를 사용 중이므로 백업 시 일관성 보장
2. **파티션 잠금**: 백업 중 파티션 삭제 방지
3. **네트워크 대역폭**: MinIO 백업 시 네트워크 사용량 고려
4. **저장 공간**: 백업 보관 기간에 따른 저장 공간 계획 필요
5. **MinIO 인증**: MinIO 접근 자격증명 안전하게 관리
6. **MinIO 버킷 정책**: 적절한 접근 권한 설정
7. **MinIO 라이프사이클**: 자동 삭제 정책으로 저장 공간 관리

---

**작성일:** 2025-11-28  
**최종 수정일:** 2025-11-28  
**버전:** 1.3

**변경 사항 (v1.3):**
- 예상 하루 데이터량 4GB로 반영
- 백업 크기 및 저장 공간 요구사항 재계산
- 프로덕션 환경 스토리지 계획 업데이트 (10년 예상: ~6TB)

**변경 사항 (v1.2):**
- 프로덕션 환경 백업 전략 추가 (3개월 데이터 유지, 영구 보관)
- 프로덕션 환경 보관 기간 조정:
  - ZFS 스냅샷: 24시간 → 7일
  - 로컬 파티션 백업: 7일 → 30일
  - MinIO 파티션 백업: 30일 → 영구 보관 (자동 삭제 없음)
  - MinIO 전체 백업: 90일 → 영구 보관 (자동 삭제 없음)
- 라이프사이클 정책 수정: 프로덕션 환경에서는 자동 삭제 제거
- 스토리지 계층화 전략 추가 (Hot → Cold Storage)
- 장기 보관을 위한 스토리지 용량 계획 추가

**변경 사항 (v1.1):**
- MinIO 기반 백업 전략 추가
- 4단계 백업 전략으로 업데이트 (ZFS 스냅샷 → 로컬 파티션 → MinIO 파티션 → MinIO 전체)
- MinIO 설정, 업로드, 복구 스크립트 추가
- MinIO 라이프사이클 정책 및 모니터링 추가
- 하이브리드 백업 전략에 MinIO 통합

