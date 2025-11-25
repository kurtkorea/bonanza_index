#!/bin/bash

# k3s kubeconfig 자동 설정 스크립트
# 다른 스크립트에서 source로 사용할 수 있습니다

setup_kubeconfig() {
    # 이미 KUBECONFIG가 설정되어 있고 연결이 가능한 경우 스킵
    if [ ! -z "$KUBECONFIG" ] && kubectl cluster-info &>/dev/null 2>&1; then
        return 0
    fi
    
    # k3s kubeconfig 경로 확인
    K3S_CONFIG="/etc/rancher/k3s/k3s.yaml"
    USER_CONFIG="$HOME/.kube/config"
    
    if [ -f "$K3S_CONFIG" ]; then
        # kubeconfig 디렉토리 생성
        mkdir -p "$HOME/.kube"
        
        # kubeconfig 복사 (없는 경우에만 또는 업데이트 필요 시)
        if [ ! -f "$USER_CONFIG" ] || [ "$K3S_CONFIG" -nt "$USER_CONFIG" ]; then
            sudo cp "$K3S_CONFIG" "$USER_CONFIG"
            sudo chown "$(whoami):$(whoami)" "$USER_CONFIG"
            # k3s.yaml의 server 주소를 localhost에서 실제 IP로 변경 (필요한 경우)
            # sed -i 's/127.0.0.1/localhost/g' "$USER_CONFIG"  # 필요시 주석 해제
        fi
        
        # KUBECONFIG 환경 변수 설정
        export KUBECONFIG="$USER_CONFIG"
    elif [ -f "$USER_CONFIG" ]; then
        export KUBECONFIG="$USER_CONFIG"
    else
        echo "⚠️  kubeconfig를 찾을 수 없습니다" >&2
        echo "   k3s kubeconfig 경로: $K3S_CONFIG" >&2
        echo "   사용자 kubeconfig 경로: $USER_CONFIG" >&2
        echo "" >&2
        echo "💡 kubeconfig 설정 방법:" >&2
        echo "   sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config" >&2
        echo "   sudo chown \$USER:\$USER ~/.kube/config" >&2
        echo "" >&2
        return 1
    fi
    
    # kubectl 연결 테스트
    if ! kubectl cluster-info &>/dev/null 2>&1; then
        echo "❌ Kubernetes 클러스터에 연결할 수 없습니다" >&2
        echo "" >&2
        echo "💡 확인 사항:" >&2
        echo "   1. k3s가 실행 중인지 확인: sudo systemctl status k3s" >&2
        echo "   2. kubeconfig 설정 확인: kubectl config view" >&2
        echo "   3. kubeconfig 경로 확인: echo \$KUBECONFIG" >&2
        echo "" >&2
        return 1
    fi
    
    return 0
}

# 스크립트가 직접 실행된 경우
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    if setup_kubeconfig; then
        echo "✅ kubeconfig 설정 완료"
        echo "   KUBECONFIG: $KUBECONFIG"
        echo ""
        echo "📊 클러스터 정보:"
        kubectl cluster-info
    else
        exit 1
    fi
fi

