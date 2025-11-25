# vm.max_map_count 설정 가이드

QuestDB는 메모리 맵 파일을 많이 사용하므로 `vm.max_map_count` 값을 증가시켜야 합니다.

## 현재 값 확인

```bash
# 현재 값 확인
sysctl vm.max_map_count

# 또는
cat /proc/sys/vm/max_map_count
```

## 설정 방법

### 방법 1: 임시 설정 (재부팅 시 초기화됨)

```bash
sudo sysctl -w vm.max_map_count=1048576
```

### 방법 2: 영구 설정 (권장)

#### Linux (일반적인 배포판)

```bash
# /etc/sysctl.conf 파일에 추가
echo "vm.max_map_count=1048576" | sudo tee -a /etc/sysctl.conf

# 설정 적용
sudo sysctl -p
```

#### Ubuntu/Debian

```bash
# /etc/sysctl.d/ 디렉토리에 별도 파일 생성 (권장)
echo "vm.max_map_count=1048576" | sudo tee /etc/sysctl.d/99-questdb.conf

# 설정 적용
sudo sysctl -p /etc/sysctl.d/99-questdb.conf
```

#### CentOS/RHEL/Fedora

```bash
# /etc/sysctl.d/ 디렉토리에 별도 파일 생성
echo "vm.max_map_count=1048576" | sudo tee /etc/sysctl.d/99-questdb.conf

# 설정 적용
sudo sysctl -p /etc/sysctl.d/99-questdb.conf
```

### 방법 3: Kubernetes 환경 (k3s/k8s)

Kubernetes를 사용하는 경우, **호스트 노드**에서 위의 방법으로 설정해야 합니다.

#### k3s 환경

```bash
# k3s 서버 노드에서 실행
sudo sysctl -w vm.max_map_count=1048576
echo "vm.max_map_count=1048576" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

#### 멀티 노드 Kubernetes

모든 노드에서 설정해야 합니다:

```bash
# 각 노드에서 실행
sudo sysctl -w vm.max_map_count=1048576
echo "vm.max_map_count=1048576" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

## 검증

설정 후 값을 확인합니다:

```bash
sysctl vm.max_map_count
# 출력: vm.max_map_count = 1048576
```

또는:

```bash
cat /proc/sys/vm/max_map_count
# 출력: 1048576
```

## 참고사항

- `vm.max_map_count`는 시스템 전역 설정입니다
- 모든 프로세스에 영향을 미칩니다
- 권장 값: 1048576 (1,048,576)
- 현재 값이 65530인 경우 충분하지 않을 수 있습니다
- 재부팅 후에도 유지하려면 `/etc/sysctl.conf` 또는 `/etc/sysctl.d/`에 추가해야 합니다

## Kubernetes에서 자동화 (선택사항)

만약 호스트 설정에 접근할 수 없는 경우, Kubernetes의 initContainer를 사용할 수 있지만 **privileged 모드**가 필요합니다:

```yaml
initContainers:
  - name: sysctl
    image: busybox
    command: ["sysctl", "-w", "vm.max_map_count=1048576"]
    securityContext:
      privileged: true
```

**주의**: 보안상의 이유로 privileged 모드를 사용하는 것은 권장되지 않습니다. 가능하면 호스트 노드에서 직접 설정하세요.

