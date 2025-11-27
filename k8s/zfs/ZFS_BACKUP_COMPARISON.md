# ZFS 백업 전략 비교: 스냅샷 vs 증분백업

이 문서는 ZFS를 이용한 백업에서 스냅샷(Snapshot)과 증분백업(Incremental Backup)의 장단점을 비교분석합니다.

## 목차

1. [개요](#개요)
2. [ZFS 스냅샷 (Snapshot)](#zfs-스냅샷-snapshot)
3. [증분백업 (Incremental Backup)](#증분백업-incremental-backup)
4. [비교 분석](#비교-분석)
5. [사용 사례별 권장사항](#사용-사례별-권장사항)
6. [실제 구현 예시](#실제-구현-예시)
7. [하이브리드 전략](#하이브리드-전략)

---

## 개요

### ZFS 스냅샷 (Snapshot)
- **정의**: 특정 시점의 파일 시스템 상태를 읽기 전용으로 저장하는 메타데이터 포인트
- **특징**: Copy-on-Write(COW) 방식으로 공간 효율적, 즉시 생성 가능
- **용도**: 빠른 복구, 롤백, 데이터 보호

### 증분백업 (Incremental Backup)
- **정의**: 이전 백업 이후 변경된 데이터만 백업하는 방식
- **특징**: 네트워크 전송량 최소화, 저장 공간 절약
- **용도**: 원격 백업, 장기 보관, 대용량 데이터 백업

---

## ZFS 스냅샷 (Snapshot)

### 작동 원리

```bash
# 스냅샷 생성 (즉시 완료, 공간 사용 없음)
zfs snapshot bonanza@backup-2025-11-28

# 스냅샷 목록 확인
zfs list -t snapshot

# 스냅샷으로부터 복구
zfs rollback bonanza@backup-2025-11-28
```

### 특징

#### ✅ 장점

1. **즉시 생성**
   - 메타데이터만 기록하므로 생성 시간이 거의 없음 (수 초 이내)
   - 애플리케이션 성능에 거의 영향 없음

2. **공간 효율성**
   - Copy-on-Write 방식으로 변경된 블록만 저장
   - 초기 생성 시 추가 공간 사용 없음
   - 변경이 적으면 공간 사용량 최소화

3. **빠른 복구**
   - 전체 데이터셋을 즉시 이전 상태로 롤백 가능
   - 파일 단위 복구도 빠름

4. **다중 버전 관리**
   - 여러 시점의 스냅샷을 동시에 보관 가능
   - 시간 여행(time travel) 기능

5. **원자적 작업**
   - 파일 시스템 일관성 보장
   - 중간 상태 없이 완전한 백업

#### ❌ 단점

1. **로컬 저장소 의존**
   - 같은 풀 내에만 존재
   - 풀 손상 시 스냅샷도 함께 손실

2. **용량 제한**
   - 풀 용량 내에서만 관리 가능
   - 장기 보관 시 공간 부족 가능

3. **원격 백업 불가**
   - 기본 스냅샷은 로컬에만 존재
   - 원격 전송하려면 `zfs send` 필요

4. **관리 복잡도**
   - 스냅샷이 많아지면 관리 복잡
   - 정기적인 정리 필요

### 공간 사용 예시

```
원본 데이터: 100GB
스냅샷 생성 직후: 0GB 추가 (메타데이터만)
데이터 10GB 변경 후: 10GB 추가 사용
총 사용량: 110GB (원본 100GB + 변경분 10GB)
```

---

## 증분백업 (Incremental Backup)

### 작동 원리

```bash
# 초기 전체 백업
zfs send bonanza@backup-full | gzip > backup-full.gz

# 증분 백업 (이전 스냅샷 이후 변경분만)
zfs send -i bonanza@backup-full bonanza@backup-inc1 | gzip > backup-inc1.gz

# 증분 백업 복원
gunzip -c backup-full.gz | zfs receive backup-restore
gunzip -c backup-inc1.gz | zfs receive backup-restore
```

### 특징

#### ✅ 장점

1. **네트워크 효율성**
   - 변경된 데이터만 전송
   - 대역폭 사용량 최소화
   - 원격 백업에 유리

2. **저장 공간 절약**
   - 전체 백업 대비 공간 절약
   - 백업 서버 용량 효율적 사용

3. **백업 시간 단축**
   - 변경분만 처리하므로 빠름
   - 대용량 데이터셋에 유리

4. **원격 저장소 지원**
   - 네트워크를 통한 안전한 백업
   - 재해 복구(DR)에 적합

5. **장기 보관**
   - 여러 백업 버전을 효율적으로 보관
   - 보관 정책 구현 용이

#### ❌ 단점

1. **복구 복잡도**
   - 전체 백업 + 모든 증분 백업 필요
   - 복구 시간이 길어질 수 있음

2. **의존성 관리**
   - 증분 백업은 이전 백업에 의존
   - 중간 백업 손실 시 복구 불가

3. **초기 백업 필요**
   - 첫 번째는 전체 백업 필요
   - 초기 설정 시간 소요

4. **네트워크 의존**
   - 원격 백업 시 네트워크 필수
   - 네트워크 장애 시 백업 중단

### 백업 크기 비교

```
전체 데이터: 100GB
일일 변경량: 5GB

전체 백업 (매일): 100GB × 30일 = 3TB
증분 백업 (매일): 100GB + (5GB × 29일) = 245GB

공간 절약: 약 92% 절감
```

---

## 비교 분석

### 상세 비교표

| 항목 | ZFS 스냅샷 | 증분백업 |
|------|-----------|---------|
| **생성 속도** | ⚡ 즉시 (수 초) | 🐌 느림 (데이터 전송 시간) |
| **초기 공간** | ✅ 0GB (메타데이터만) | ❌ 전체 데이터 크기 |
| **공간 효율성** | ✅ 높음 (COW) | ✅ 높음 (변경분만) |
| **복구 속도** | ⚡ 매우 빠름 (즉시) | 🐌 느림 (전송 + 적용) |
| **복구 복잡도** | ✅ 간단 (단일 명령) | ❌ 복잡 (여러 단계) |
| **로컬 보호** | ✅ 우수 | ⚠️ 제한적 |
| **원격 백업** | ❌ 불가 (직접) | ✅ 가능 |
| **재해 복구** | ❌ 부적합 | ✅ 적합 |
| **장기 보관** | ⚠️ 제한적 | ✅ 적합 |
| **네트워크 사용** | ✅ 없음 | ❌ 필요 |
| **의존성** | ✅ 없음 | ❌ 이전 백업 필요 |
| **관리 복잡도** | ⚠️ 중간 | ⚠️ 중간 |

### 성능 비교

#### 백업 생성 시간

```
데이터셋 크기: 100GB
일일 변경량: 5GB

스냅샷 생성: ~1초
증분 백업 생성: ~5분 (네트워크 1Gbps 기준)
전체 백업: ~15분
```

#### 복구 시간

```
스냅샷 롤백: ~1초
증분 백업 복구: ~10분 (전체 + 증분)
전체 백업 복구: ~15분
```

### 비용 분석

#### 스토리지 비용 (월간)

```
풀 용량: 1TB
데이터: 500GB
일일 변경: 10GB

스냅샷 (30일 보관):
- 초기: 0GB
- 30일 후: ~300GB (변경분 누적)
- 총 필요 용량: 800GB

증분 백업 (원격, 30일 보관):
- 전체 백업: 500GB
- 증분 백업: 10GB × 29일 = 290GB
- 총 필요 용량: 790GB
- 네트워크 비용: 추가
```

---

## 사용 사례별 권장사항

### 1. 빠른 복구가 필요한 경우

**권장: ZFS 스냅샷**

```
사용 사례:
- 개발 환경 롤백
- 실수로 삭제한 파일 복구
- 설정 변경 전 백업
- 데이터베이스 마이그레이션 전 백업

장점:
- 즉시 복구 가능
- 애플리케이션 다운타임 최소화
```

### 2. 원격 백업이 필요한 경우

**권장: 증분백업**

```
사용 사례:
- 재해 복구(DR) 준비
- 규정 준수(Compliance) 요구사항
- 장기 데이터 보관
- 오프사이트 백업

장점:
- 물리적으로 분리된 저장소
- 네트워크를 통한 안전한 전송
```

### 3. 대용량 데이터셋

**권장: 증분백업**

```
사용 사례:
- 수백 GB 이상의 데이터
- 일일 변경량이 적은 경우
- 네트워크 대역폭이 제한적인 경우

장점:
- 백업 시간 단축
- 네트워크 부하 감소
```

### 4. 고빈도 백업이 필요한 경우

**권장: ZFS 스냅샷**

```
사용 사례:
- 시간당 백업
- 실시간 데이터 보호
- 버전 관리

장점:
- 백업 오버헤드 최소
- 성능 영향 없음
```

### 5. 규정 준수 및 감사

**권장: 증분백업 (원격)**

```
사용 사례:
- 금융 데이터
- 의료 기록
- 법적 증거 자료

장점:
- 물리적 분리
- 장기 보관 용이
- 감사 추적 가능
```

---

## 실제 구현 예시

### 스냅샷 기반 백업 스크립트

```bash
#!/bin/bash
# zfs-snapshot-backup.sh

POOL_NAME="bonanza"
RETENTION_DAYS=7
SNAPSHOT_PREFIX="backup"

# 스냅샷 생성
SNAPSHOT_NAME="${POOL_NAME}@${SNAPSHOT_PREFIX}-$(date +%Y%m%d-%H%M%S)"
zfs snapshot "${SNAPSHOT_NAME}"

# 오래된 스냅샷 삭제
zfs list -t snapshot -o name | grep "${POOL_NAME}@${SNAPSHOT_PREFIX}" | \
while read snapshot; do
    SNAPSHOT_DATE=$(echo "$snapshot" | grep -o '[0-9]\{8\}-[0-9]\{6\}')
    if [ -n "$SNAPSHOT_DATE" ]; then
        SNAPSHOT_EPOCH=$(date -d "${SNAPSHOT_DATE:0:8} ${SNAPSHOT_DATE:9:2}:${SNAPSHOT_DATE:11:2}:${SNAPSHOT_DATE:13:2}" +%s)
        CURRENT_EPOCH=$(date +%s)
        AGE_DAYS=$(( (CURRENT_EPOCH - SNAPSHOT_EPOCH) / 86400 ))
        
        if [ $AGE_DAYS -gt $RETENTION_DAYS ]; then
            echo "Deleting old snapshot: $snapshot (age: $AGE_DAYS days)"
            zfs destroy "$snapshot"
        fi
    fi
done

echo "Snapshot created: ${SNAPSHOT_NAME}"
```

### 증분백업 스크립트

```bash
#!/bin/bash
# zfs-incremental-backup.sh

POOL_NAME="bonanza"
BACKUP_SERVER="backup.example.com"
BACKUP_PATH="/backup/bonanza"
RETENTION_DAYS=30

# 현재 스냅샷 생성
CURRENT_SNAPSHOT="${POOL_NAME}@backup-$(date +%Y%m%d-%H%M%S)"
zfs snapshot "${CURRENT_SNAPSHOT}"

# 마지막 백업 스냅샷 찾기
LAST_SNAPSHOT=$(ssh "${BACKUP_SERVER}" "ls -t ${BACKUP_PATH}/*.full 2>/dev/null | head -1" | xargs basename | sed 's/.full$//')

if [ -z "$LAST_SNAPSHOT" ] || [ ! -f "${BACKUP_PATH}/${LAST_SNAPSHOT}.full" ]; then
    # 전체 백업 (첫 번째 또는 주간)
    echo "Creating full backup..."
    zfs send "${CURRENT_SNAPSHOT}" | \
        ssh "${BACKUP_SERVER}" "gzip > ${BACKUP_PATH}/${CURRENT_SNAPSHOT}.full.gz"
    
    # 전체 백업 마커 생성
    ssh "${BACKUP_SERVER}" "touch ${BACKUP_PATH}/${CURRENT_SNAPSHOT}.full"
else
    # 증분 백업
    echo "Creating incremental backup from ${LAST_SNAPSHOT}..."
    zfs send -i "${POOL_NAME}@${LAST_SNAPSHOT}" "${CURRENT_SNAPSHOT}" | \
        ssh "${BACKUP_SERVER}" "gzip > ${BACKUP_PATH}/${CURRENT_SNAPSHOT}.inc.gz"
fi

# 오래된 백업 삭제
ssh "${BACKUP_SERVER}" "find ${BACKUP_PATH} -name '*.gz' -mtime +${RETENTION_DAYS} -delete"

echo "Backup completed: ${CURRENT_SNAPSHOT}"
```

### Kubernetes CronJob으로 자동화

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: zfs-snapshot-backup
  namespace: bonanza-index
spec:
  schedule: "0 */6 * * *"  # 6시간마다
  jobTemplate:
    spec:
      template:
        spec:
          hostNetwork: true
          hostPID: true
          containers:
          - name: zfs-backup
            image: ubuntu:22.04
            securityContext:
              privileged: true
            volumeMounts:
            - name: zfs
              mountPath: /host
            command:
            - /bin/bash
            - -c
            - |
              # ZFS 명령어 실행
              /host/usr/sbin/zfs snapshot bonanza@backup-$(date +%Y%m%d-%H%M%S)
          volumes:
          - name: zfs
            hostPath:
              path: /
```

---

## 하이브리드 전략

### 권장: 스냅샷 + 증분백업 조합

가장 효과적인 백업 전략은 두 방식을 조합하는 것입니다.

#### 전략 개요

```
로컬 스냅샷 (빠른 복구)
├── 매 시간 스냅샷 생성
├── 최근 24시간 보관
└── 빠른 롤백 제공

원격 증분백업 (장기 보관)
├── 일일 전체 백업 (주 1회)
├── 일일 증분 백업 (평일)
├── 30일 보관
└── 재해 복구 준비
```

#### 구현 예시

```bash
#!/bin/bash
# zfs-hybrid-backup.sh

POOL_NAME="bonanza"
BACKUP_SERVER="backup.example.com"
BACKUP_PATH="/backup/bonanza"

# 1. 로컬 스냅샷 생성 (빠른 복구용)
HOURLY_SNAPSHOT="${POOL_NAME}@hourly-$(date +%Y%m%d-%H%M%S)"
zfs snapshot "${HOURLY_SNAPSHOT}"

# 오래된 시간별 스냅샷 삭제 (24시간 이상)
zfs list -t snapshot -o name | grep "${POOL_NAME}@hourly" | \
while read snapshot; do
    SNAPSHOT_TIME=$(echo "$snapshot" | grep -o '[0-9]\{8\}-[0-9]\{6\}')
    if [ -n "$SNAPSHOT_TIME" ]; then
        SNAPSHOT_EPOCH=$(date -d "${SNAPSHOT_TIME:0:8} ${SNAPSHOT_TIME:9:2}:${SNAPSHOT_TIME:11:2}:${SNAPSHOT_TIME:13:2}" +%s)
        CURRENT_EPOCH=$(date +%s)
        AGE_HOURS=$(( (CURRENT_EPOCH - SNAPSHOT_EPOCH) / 3600 ))
        
        if [ $AGE_HOURS -gt 24 ]; then
            zfs destroy "$snapshot"
        fi
    fi
done

# 2. 원격 백업 (일일 1회, 자정에 실행)
if [ "$(date +%H)" = "00" ]; then
    DAILY_SNAPSHOT="${POOL_NAME}@daily-$(date +%Y%m%d)"
    zfs snapshot "${DAILY_SNAPSHOT}"
    
    # 주간 전체 백업 (일요일)
    if [ "$(date +%u)" = "7" ]; then
        echo "Creating weekly full backup..."
        zfs send "${DAILY_SNAPSHOT}" | \
            ssh "${BACKUP_SERVER}" "gzip > ${BACKUP_PATH}/weekly-${DAILY_SNAPSHOT}.full.gz"
    else
        # 평일 증분 백업
        LAST_DAILY=$(ssh "${BACKUP_SERVER}" "ls -t ${BACKUP_PATH}/daily-*.inc.gz 2>/dev/null | head -1" | xargs basename | sed 's/.inc.gz$//')
        if [ -n "$LAST_DAILY" ]; then
            LAST_SNAPSHOT="${POOL_NAME}@${LAST_DAILY}"
            if zfs list -t snapshot | grep -q "${LAST_SNAPSHOT}"; then
                echo "Creating incremental backup from ${LAST_SNAPSHOT}..."
                zfs send -i "${LAST_SNAPSHOT}" "${DAILY_SNAPSHOT}" | \
                    ssh "${BACKUP_SERVER}" "gzip > ${BACKUP_PATH}/daily-${DAILY_SNAPSHOT}.inc.gz"
            fi
        fi
    fi
fi
```

### 하이브리드 전략의 장점

1. **빠른 복구**: 로컬 스냅샷으로 즉시 복구
2. **안전한 백업**: 원격 증분백업으로 재해 대비
3. **비용 효율**: 로컬 스냅샷은 공간 효율적, 원격 백업은 네트워크 효율적
4. **유연성**: 용도에 따라 적절한 백업 방식 선택

---

## 결론 및 권장사항

### 일반적인 권장사항

1. **로컬 빠른 복구**: ZFS 스냅샷 사용
   - 최근 24-48시간 보관
   - 시간별 또는 6시간마다 생성

2. **장기 보관 및 재해 복구**: 증분백업 사용
   - 주간 전체 백업
   - 일일 증분 백업
   - 원격 저장소에 보관

3. **하이브리드 전략**: 두 방식 조합
   - 로컬 스냅샷: 빠른 복구
   - 원격 백업: 장기 보관

### QuestDB 데이터베이스 백업 권장사항

```
로컬 스냅샷:
- 빈도: 6시간마다
- 보관: 24시간 (4개)
- 용도: 빠른 롤백, 실수 복구

원격 증분백업:
- 전체 백업: 주 1회 (일요일)
- 증분 백업: 일 1회 (평일)
- 보관: 30일
- 용도: 재해 복구, 장기 보관
```

### 성능 고려사항

- **스냅샷**: 애플리케이션 성능 영향 거의 없음
- **증분백업**: 네트워크 대역폭과 백업 서버 성능 고려
- **백업 시간**: 트래픽이 적은 시간대에 실행 권장

---

**작성일:** 2025-11-28  
**버전:** 1.0

