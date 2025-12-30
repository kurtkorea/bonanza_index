#!/bin/bash
# QuestDB 디스크 용량 확인 스크립트

set -e

# 환경 변수 설정 (기본값)
QDB_HTTP_HOST=${QDB_HTTP_HOST:-127.0.0.1}
QDB_HTTP_PORT=${QDB_HTTP_PORT:-30091}
QDB_HOST=${QDB_HOST:-$QDB_HTTP_HOST}
QDB_PORT=${QDB_PORT:-$QDB_HTTP_PORT}

echo "=========================================="
echo "QuestDB 디스크 용량 확인"
echo "=========================================="
echo "연결 정보: http://${QDB_HTTP_HOST}:${QDB_HTTP_PORT}"
echo ""

# 1. 테이블 목록 및 행 수 확인
echo "=== 테이블별 행 수 ==="
curl -s -G "http://${QDB_HTTP_HOST}:${QDB_HTTP_PORT}/exec" \
  --data-urlencode "query=SELECT name, id FROM tables() ORDER BY name;" \
  | jq -r '.dataset[] | "\(.name[0])"' 2>/dev/null | while read table; do
  if [ -n "$table" ]; then
    count=$(curl -s -G "http://${QDB_HTTP_HOST}:${QDB_HTTP_PORT}/exec" \
      --data-urlencode "query=SELECT count() FROM $table;" \
      | jq -r '.dataset[0][0]' 2>/dev/null || echo "N/A")
    echo "  $table: $count 행"
  fi
done

echo ""

# 2. 테이블별 파티션 정보 확인
echo "=== 테이블별 파티션 정보 ==="
curl -s -G "http://${QDB_HTTP_HOST}:${QDB_HTTP_PORT}/exec" \
  --data-urlencode "query=SELECT name FROM tables() ORDER BY name;" \
  | jq -r '.dataset[] | .name[0]' 2>/dev/null | while read table; do
  if [ -n "$table" ]; then
    partitions=$(curl -s -G "http://${QDB_HTTP_HOST}:${QDB_HTTP_PORT}/exec" \
      --data-urlencode "query=SELECT DISTINCT partitionBy FROM table_partitions('$table');" \
      | jq -r '.dataset | length' 2>/dev/null || echo "0")
    echo "  $table: $partitions 개 파티션"
  fi
done

echo ""

# 3. Kubernetes 환경인 경우 PVC 크기 확인
if command -v kubectl &> /dev/null; then
  echo "=== Kubernetes PVC 정보 ==="
  kubectl get pvc -n bonanza-index | grep questdb || echo "  QuestDB PVC를 찾을 수 없습니다."
  echo ""
fi

# 4. QuestDB 컨테이너 내부 디스크 사용량 확인 (Kubernetes 환경)
if command -v kubectl &> /dev/null; then
  POD_NAME=$(kubectl get pod -n bonanza-index -l app=questdb -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  if [ -n "$POD_NAME" ]; then
    echo "=== QuestDB Pod 내부 디스크 사용량 ==="
    kubectl exec -n bonanza-index $POD_NAME -- df -h /var/lib/questdb 2>/dev/null || echo "  디스크 정보를 가져올 수 없습니다."
    echo ""
    echo "=== QuestDB 데이터 디렉토리 크기 ==="
    kubectl exec -n bonanza-index $POD_NAME -- du -sh /var/lib/questdb/db 2>/dev/null || echo "  데이터 디렉토리 정보를 가져올 수 없습니다."
    echo ""
    echo "=== 테이블별 디렉토리 크기 ==="
    kubectl exec -n bonanza-index $POD_NAME -- sh -c "du -sh /var/lib/questdb/db/* 2>/dev/null | sort -h" || echo "  테이블 디렉토리 정보를 가져올 수 없습니다."
  fi
fi

echo ""
echo "=========================================="
echo "완료"
echo "=========================================="

