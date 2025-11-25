#!/bin/bash

# Bonanza Index 모니터링 스택 제거 스크립트
# Prometheus, Alertmanager, Grafana, Loki, Promtail을 삭제하고 옵션에 따라 PVC도 정리합니다.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MONITORING_NAMESPACE="bonanza-monitoring"
DELETE_STORAGE="false"

function usage() {
  cat <<EOF
사용법: $(basename "$0") [옵션]

옵션:
  --delete-storage   PVC 및 PV를 함께 삭제합니다. (데이터 완전 삭제)
  -h, --help         도움말 표시

예시:
  ./k8s/scripts/destroy-monitoring.sh
  ./k8s/scripts/destroy-monitoring.sh --delete-storage
EOF
}

function parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --delete-storage)
        DELETE_STORAGE="true"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "알 수 없는 옵션: $1"
        usage
        exit 1
        ;;
    esac
  done
}

function check_requirements() {
  if ! command -v kubectl >/dev/null 2>&1; then
    echo "❌ kubectl 명령을 찾을 수 없습니다. kubectl을 설치 후 다시 시도하세요."
    exit 1
  fi

  if ! command -v helm >/dev/null 2>&1; then
    echo "❌ helm 명령을 찾을 수 없습니다. Helm 3 이상을 설치 후 다시 시도하세요."
    exit 1
  fi
}

function uninstall_helm_release() {
  local release=$1
  if helm status "$release" -n "$MONITORING_NAMESPACE" >/dev/null 2>&1; then
    echo "🗑️  Helm 릴리스 삭제: $release"
    helm uninstall "$release" -n "$MONITORING_NAMESPACE"
  else
    echo "ℹ️  Helm 릴리스가 없습니다: $release"
  fi
}

function delete_namespace_if_empty() {
  if kubectl get namespace "$MONITORING_NAMESPACE" >/dev/null 2>&1; then
    if [ "$(kubectl get all -n "$MONITORING_NAMESPACE" --no-headers 2>/dev/null | wc -l | xargs)" = "0" ]; then
      echo "🧹 네임스페이스 삭제: $MONITORING_NAMESPACE"
      kubectl delete namespace "$MONITORING_NAMESPACE"
    else
      echo "ℹ️  네임스페이스에 리소스가 남아 있어 삭제하지 않습니다."
    fi
  fi
}

function delete_storage() {
  if [ "$DELETE_STORAGE" != "true" ]; then
    echo "ℹ️  PVC/PV는 유지됩니다. (데이터 보존)"
    echo "    완전 삭제를 원하면 --delete-storage 옵션을 사용하세요."
    return
  fi

  if kubectl get namespace "$MONITORING_NAMESPACE" >/dev/null 2>&1; then
    echo "🗑️  PVC 삭제 중..."
    kubectl delete pvc --all -n "$MONITORING_NAMESPACE" --ignore-not-found=true
  else
    echo "⚠️  네임스페이스가 없으므로 PVC를 찾을 수 없습니다."
  fi
}

function main() {
  parse_args "$@"

  echo "============================================="
  echo " Bonanza Index 모니터링 스택 제거 스크립트"
  echo "============================================="
  echo ""

  check_requirements

  uninstall_helm_release "kube-prometheus-stack"
  uninstall_helm_release "loki"
  echo "🧹 Grafana/Loki 데이터소스 ConfigMap 정리..."
  kubectl delete configmap kube-prometheus-stack-grafana-datasource -n "$MONITORING_NAMESPACE" --ignore-not-found=true
  kubectl delete configmap loki-loki-stack -n "$MONITORING_NAMESPACE" --ignore-not-found=true
  delete_storage
  delete_namespace_if_empty

  echo ""
  echo "✅ 모니터링 스택 제거가 완료되었습니다."
  if [ "$DELETE_STORAGE" = "true" ]; then
    echo "   - PVC/PV도 함께 삭제되었습니다."
  else
    echo "   - PVC/PV는 유지되었습니다. 필요 시 수동으로 정리하세요."
  fi
}

main "$@"

