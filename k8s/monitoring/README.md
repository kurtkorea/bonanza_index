# 모니터링 스택 (Prometheus + Loki + Grafana)

이 디렉터리는 `bonanza-index` 클러스터에 모니터링 스택을 배포하기 위한 Helm 값을 제공합니다.  
`kube-prometheus-stack`(Prometheus, Alertmanager, Grafana)와 `loki-stack`(Loki, Promtail)을 `bonanza-monitoring` 네임스페이스에 설치합니다.

## 구성 요소

- **Prometheus**: 애플리케이션과 노드 메트릭 수집
- **Alertmanager**: 알림 라우팅 (Slack/Email 등 추가 구성 필요)
- **Grafana**: 메트릭/로그 대시보드
- **Loki**: 로그 집계
- **Promtail**: 노드/Pod 로그 수집 에이전트

## 사전 준비

- Helm 3 이상
- `kubectl`이 클러스터에 연결되어 있어야 합니다.
- `local-path-immediate` StorageClass가 존재해야 합니다. (기존 DB 스토리지와 동일한 클래스 사용)

## 배포 절차

```bash
# 네임스페이스 생성
kubectl apply -f k8s/monitoring/namespace.yaml

# Helm 리포지토리 추가
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# kube-prometheus-stack 설치 (Prometheus + Grafana)
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n bonanza-monitoring \
  -f k8s/monitoring/values-prometheus.yaml

# loki-stack 설치 (Loki + Promtail)
helm upgrade --install loki grafana/loki-stack \
  -n bonanza-monitoring \
  -f k8s/monitoring/values-loki.yaml
```

### 스크립트로 간편 배포

```bash
./k8s/scripts/deploy-monitoring.sh

# Grafana 포트포워딩까지 자동 실행
./k8s/scripts/deploy-monitoring.sh --port-forward
```

> 스크립트는 `kubectl`, `helm` 확인과 Helm 리포지토리 추가, 두 스택 배포를 한 번에 처리합니다.

### 제거 스크립트

```bash
# PVC 유지 (기본)
./k8s/scripts/destroy-monitoring.sh

# PVC, PV까지 삭제
./k8s/scripts/destroy-monitoring.sh --delete-storage

# Grafana 데이터소스 충돌 시 초기화
./k8s/scripts/reset-monitoring-grafana.sh
```

## 접근

- **Grafana**
  - 외부 접근: `http://<노드IP>:31300/` (NodePort)
  - 내부/포트포워딩:
    ```bash
    kubectl port-forward svc/kube-prometheus-stack-grafana -n bonanza-monitoring 31300:80
    ```
  기본 계정은 `admin / changeme`입니다. 접속 후 비밀번호를 반드시 변경하세요.

- **Prometheus**
  ```bash
  kubectl port-forward svc/kube-prometheus-stack-prometheus -n bonanza-monitoring 9090:9090
  ```

- **Alertmanager**
  ```bash
  kubectl port-forward svc/kube-prometheus-stack-alertmanager -n bonanza-monitoring 9093:9093
  ```

## 배포 후 체크리스트

- `kubectl get pods -n bonanza-monitoring` 로 모든 Pod가 `Running` 상태인지 확인
- Grafana에서 `Prometheus`, `Loki` 데이터 소스가 자동 등록되었는지 확인
- 샘플 대시보드 임포트: `Node Exporter Full (1860)`, `Kubernetes / Views / Pods` 등
- Alertmanager의 수신 채널(Email/Slack/Telegram 등)을 `values-prometheus.yaml`에 추가
- 필요 시 Loki Retention, Sharding 등 고급 설정 조정

## 삭제

```bash
helm uninstall kube-prometheus-stack -n bonanza-monitoring
helm uninstall loki -n bonanza-monitoring
kubectl delete namespace bonanza-monitoring
```

> ⚠️ Helm 릴리스 삭제만으로 PVC는 제거되지 않습니다. 스토리지를 완전히 삭제하려면 관련 PVC/PV를 수동으로 제거하세요.

