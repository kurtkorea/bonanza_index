#!/bin/bash

# Bonanza Index 모니터링 스택 배포 스크립트
# Prometheus, Alertmanager, Grafana, Loki, Promtail을 설치합니다.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MONITORING_NAMESPACE="bonanza-monitoring"
PROM_VALUES="$K8S_DIR/monitoring/values-prometheus.yaml"
LOKI_VALUES="$K8S_DIR/monitoring/values-loki.yaml"
PORT_FORWARD="false"

function usage() {
  cat <<EOF
사용법: $(basename "$0") [옵션]

옵션:
  --port-forward   Grafana NodePort(31300)을 로컬로 포트포워딩합니다.
  -h, --help       도움말 표시

예시:
  ./k8s/scripts/deploy-monitoring.sh
  ./k8s/scripts/deploy-monitoring.sh --port-forward
EOF
}

function parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --port-forward)
        PORT_FORWARD="true"
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

function ensure_namespace() {
  echo "📦 ${MONITORING_NAMESPACE} 네임스페이스 확인..."
  if ! kubectl get namespace "${MONITORING_NAMESPACE}" >/dev/null 2>&1; then
    echo "  - 네임스페이스 생성 중..."
    kubectl apply -f "$K8S_DIR/monitoring/namespace.yaml"
  else
    echo "  - 네임스페이스 이미 존재"
  fi
}

function add_helm_repos() {
  echo "📚 Helm 리포지토리 설정..."
  helm repo add prometheus-community https://prometheus-community.github.io/helm-charts --force-update >/dev/null
  helm repo add grafana https://grafana.github.io/helm-charts --force-update >/dev/null
  helm repo update >/dev/null
  echo "  - 리포지토리 업데이트 완료"
}

function delete_clusterrole_if_conflict() {
  local name="$1"
  if kubectl get clusterrole "$name" >/dev/null 2>&1; then
    local owner_ns
    owner_ns=$(kubectl get clusterrole "$name" -o jsonpath='{.metadata.annotations.meta\.helm\.sh/release-namespace}' 2>/dev/null || echo "")
    if [ "$owner_ns" != "$MONITORING_NAMESPACE" ]; then
      echo "  - 기존 ClusterRole ${name} 삭제 (release-namespace=${owner_ns:-없음})"
      kubectl delete clusterrole "$name"
    else
      echo "  - ClusterRole ${name} 는 ${MONITORING_NAMESPACE}에서 관리 중 (유지)"
    fi
  fi
}

function cleanup_orphan_clusterroles() {
  echo "🧹 ClusterRole 충돌 여부 확인..."
  delete_clusterrole_if_conflict "kube-prometheus-stack-grafana-clusterrole"
  delete_clusterrole_if_conflict "kube-prometheus-stack-kube-state-metrics"
  delete_clusterrole_if_conflict "kube-prometheus-stack-operator"
  delete_clusterrole_if_conflict "kube-prometheus-stack-operator-service"
  delete_clusterrole_if_conflict "kube-prometheus-stack-prometheus"
  delete_clusterrole_if_conflict "kube-prometheus-stack-prometheus-clusterrole"
  delete_clusterrole_if_conflict "loki-promtail"
}

function delete_clusterrolebinding_if_conflict() {
  local name="$1"
  if kubectl get clusterrolebinding "$name" >/dev/null 2>&1; then
    local owner_ns
    owner_ns=$(kubectl get clusterrolebinding "$name" -o jsonpath='{.metadata.annotations.meta\.helm\.sh/release-namespace}' 2>/dev/null || echo "")
    if [ "$owner_ns" != "$MONITORING_NAMESPACE" ]; then
      echo "  - 기존 ClusterRoleBinding ${name} 삭제 (release-namespace=${owner_ns:-없음})"
      kubectl delete clusterrolebinding "$name"
    else
      echo "  - ClusterRoleBinding ${name} 는 ${MONITORING_NAMESPACE}에서 관리 중 (유지)"
    fi
  fi
}

function cleanup_orphan_clusterrolebindings() {
  echo "🧹 ClusterRoleBinding 충돌 여부 확인..."
  delete_clusterrolebinding_if_conflict "kube-prometheus-stack-grafana-clusterrolebinding"
  delete_clusterrolebinding_if_conflict "kube-prometheus-stack-kube-state-metrics"
  delete_clusterrolebinding_if_conflict "kube-prometheus-stack-operator"
  delete_clusterrolebinding_if_conflict "kube-prometheus-stack-prometheus"
  delete_clusterrolebinding_if_conflict "loki-promtail"
}

function delete_service_if_conflict() {
  local name="$1"
  local ns="$2"
  if kubectl get service "$name" -n "$ns" >/dev/null 2>&1; then
    local owner_ns
    owner_ns=$(kubectl get service "$name" -n "$ns" -o jsonpath='{.metadata.annotations.meta\.helm\.sh/release-namespace}' 2>/dev/null || echo "")
    if [ "$owner_ns" != "$MONITORING_NAMESPACE" ]; then
      echo "  - 기존 Service ${ns}/${name} 삭제 (release-namespace=${owner_ns:-없음})"
      kubectl delete service "$name" -n "$ns"
    else
      echo "  - Service ${ns}/${name} 는 ${MONITORING_NAMESPACE}에서 관리 중 (유지)"
    fi
  fi
}

function cleanup_orphan_services() {
  echo "🧹 Service 충돌 여부 확인..."
  delete_service_if_conflict "kube-prometheus-stack-coredns" "kube-system"
  delete_service_if_conflict "kube-prometheus-stack-kube-controller-manager" "kube-system"
  delete_service_if_conflict "kube-prometheus-stack-kube-dns" "kube-system"
  delete_service_if_conflict "kube-prometheus-stack-kube-etcd" "kube-system"
  delete_service_if_conflict "kube-prometheus-stack-kube-proxy" "kube-system"
  delete_service_if_conflict "kube-prometheus-stack-kube-scheduler" "kube-system"
  delete_service_if_conflict "kube-prometheus-stack-kubelets" "kube-system"
}

function delete_webhook_if_conflict() {
  local kind="$1"
  local name="$2"
  if kubectl get "$kind" "$name" >/dev/null 2>&1; then
    local owner_ns
    owner_ns=$(kubectl get "$kind" "$name" -o jsonpath='{.metadata.annotations.meta\.helm\.sh/release-namespace}' 2>/dev/null || echo "")
    if [ "$owner_ns" != "$MONITORING_NAMESPACE" ]; then
      echo "  - 기존 ${kind} ${name} 삭제 (release-namespace=${owner_ns:-없음})"
      kubectl delete "$kind" "$name"
    else
      echo "  - ${kind} ${name} 는 ${MONITORING_NAMESPACE}에서 관리 중 (유지)"
    fi
  fi
}

function cleanup_orphan_webhooks() {
  echo "🧹 Webhook 충돌 여부 확인..."
  delete_webhook_if_conflict mutatingwebhookconfiguration "kube-prometheus-stack-admission"
  delete_webhook_if_conflict validatingwebhookconfiguration "kube-prometheus-stack-admission"
}

function deploy_prometheus_stack() {
  echo "🚀 kube-prometheus-stack 배포..."
  helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
    -n "${MONITORING_NAMESPACE}" \
    -f "${PROM_VALUES}"
}

function deploy_loki_stack() {
  echo "🚀 loki-stack 배포..."
  helm upgrade --install loki grafana/loki-stack \
    -n "${MONITORING_NAMESPACE}" \
    -f "${LOKI_VALUES}"
}

function main() {
  parse_args "$@"

  echo "============================================="
  echo " Bonanza Index 모니터링 스택 배포 스크립트"
  echo "============================================="
  echo ""

  check_requirements
  ensure_namespace
  add_helm_repos
  cleanup_orphan_clusterroles
  cleanup_orphan_clusterrolebindings
  cleanup_orphan_services
  cleanup_orphan_webhooks
  deploy_prometheus_stack
  deploy_loki_stack

  echo ""
  echo "✅ 모니터링 스택 배포가 완료되었습니다."
  echo "   - Grafana: NodePort 31300 → http://<노드IP>:31300/"
  echo "   - Prometheus: svc/kube-prometheus-stack-prometheus (포트포워딩 9090)"
  echo "   - Alertmanager: svc/kube-prometheus-stack-alertmanager (포트포워딩 9093)"
  echo "   - Loki: svc/loki (포트 3100)"
  echo ""
  echo "Grafana 기본 계정은 admin / changeme 입니다. 로그인 후 비밀번호를 변경하세요."
  echo ""
  echo "👉 Grafana 대시보드 접속:"
  echo "   - 외부: http://<노드IP>:31300/"
  echo "   - 로컬 포트포워딩: kubectl port-forward svc/kube-prometheus-stack-grafana -n ${MONITORING_NAMESPACE} 31300:80"

  if [ "$PORT_FORWARD" = "true" ]; then
    echo ""
    echo "🌐 Grafana 포트포워딩을 시작합니다... (백그라운드)"
    if kubectl port-forward svc/kube-prometheus-stack-grafana -n "${MONITORING_NAMESPACE}" 31300:80 >/dev/null 2>&1 & then
      PORT_FWD_PID=$!
      echo "   - PID: ${PORT_FWD_PID}"
      echo "   - 브라우저에서 http://localhost:31300 접속"
      echo "   - 중지: kill ${PORT_FWD_PID}"
    else
      echo "⚠️  포트포워딩을 시작하지 못했습니다. 수동으로 실행해주세요."
    fi
  fi
}

main "$@"

