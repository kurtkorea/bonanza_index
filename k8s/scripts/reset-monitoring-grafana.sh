#!/bin/bash

# Grafana 데이터소스 충돌/디렉터리 초기화를 위한 리셋 스크립트

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MONITORING_NAMESPACE="bonanza-monitoring"

function log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "Grafana/PVC 초기화 시작..."

if ! command -v kubectl >/dev/null 2>&1; then
  echo "❌ kubectl 명령을 찾을 수 없습니다."
  exit 1
fi

if ! command -v helm >/dev/null 2>&1; then
  echo "❌ helm 명령을 찾을 수 없습니다."
  exit 1
fi

log "Grafana 데이터소스 ConfigMap 삭제..."
kubectl delete configmap kube-prometheus-stack-grafana-datasource -n "$MONITORING_NAMESPACE" --ignore-not-found=true
kubectl delete configmap loki-loki-stack -n "$MONITORING_NAMESPACE" --ignore-not-found=true

log "Grafana Pod 종료..."
kubectl delete pod -n "$MONITORING_NAMESPACE" -l app.kubernetes.io/name=grafana --ignore-not-found=true

log "Grafana PVC 삭제..."
kubectl delete pvc kube-prometheus-stack-grafana -n "$MONITORING_NAMESPACE" --ignore-not-found=true

log "Helm 릴리스 재배포..."
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n "$MONITORING_NAMESPACE" \
  -f "$K8S_DIR/monitoring/values-prometheus.yaml"

helm upgrade --install loki grafana/loki-stack \
  -n "$MONITORING_NAMESPACE" \
  -f "$K8S_DIR/monitoring/values-loki.yaml"

log "Grafana 리셋 완료. 파드 상태:"
kubectl get pods -n "$MONITORING_NAMESPACE" -l app.kubernetes.io/name=grafana

log "실시간 로그 확인: kubectl logs -f -n $MONITORING_NAMESPACE deployment/kube-prometheus-stack-grafana"

