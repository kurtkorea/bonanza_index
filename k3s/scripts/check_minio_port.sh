#!/bin/bash

# MinIO 포트 확인 스크립트
# 사용법: ./check_minio_port.sh

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# k3s 환경에서 kubectl 명령어 확인
if command -v kubectl &> /dev/null; then
    KUBECTL="kubectl"
elif command -v k3s &> /dev/null; then
    KUBECTL="k3s kubectl"
else
    echo -e "${RED}❌ 오류: kubectl 또는 k3s 명령어를 찾을 수 없습니다.${NC}"
    exit 1
fi

NAMESPACE="bonanza-index"
MINIO_PORT="30902"

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  MinIO 포트 확인${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""

# 1. MinIO 서비스 확인
echo -e "${BLUE}1. MinIO 서비스 상태 확인${NC}"
echo "----------------------------------------"
$KUBECTL get svc minio-service -n "$NAMESPACE" 2>/dev/null || {
    echo -e "${RED}❌ minio-service를 찾을 수 없습니다.${NC}"
    exit 1
}
echo ""

# 2. NodePort 확인
echo -e "${BLUE}2. NodePort 확인${NC}"
echo "----------------------------------------"
NODEPORT=$($KUBECTL get svc minio-service -n "$NAMESPACE" -o jsonpath='{.spec.ports[?(@.name=="api")].nodePort}' 2>/dev/null)
if [ -n "$NODEPORT" ]; then
    echo -e "${GREEN}✅ NodePort: ${NODEPORT}${NC}"
    if [ "$NODEPORT" = "$MINIO_PORT" ]; then
        echo -e "${GREEN}✅ 포트가 올바르게 설정되었습니다.${NC}"
    else
        echo -e "${YELLOW}⚠️  포트가 ${MINIO_PORT}가 아닙니다.${NC}"
    fi
else
    echo -e "${RED}❌ NodePort를 찾을 수 없습니다.${NC}"
fi
echo ""

# 3. 노드 IP 확인
echo -e "${BLUE}3. 노드 IP 확인${NC}"
echo "----------------------------------------"
NODE_IPS=$($KUBECTL get nodes -o jsonpath='{.items[*].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null)
if [ -z "$NODE_IPS" ]; then
    NODE_IPS=$($KUBECTL get nodes -o jsonpath='{.items[*].status.addresses[?(@.type=="ExternalIP")].address}' 2>/dev/null)
fi

if [ -n "$NODE_IPS" ]; then
    echo -e "${GREEN}노드 IP 목록:${NC}"
    for IP in $NODE_IPS; do
        echo -e "  - ${GREEN}${IP}${NC}"
    done
else
    echo -e "${YELLOW}⚠️  노드 IP를 찾을 수 없습니다.${NC}"
fi
echo ""

# 4. MinIO Pod 상태 확인
echo -e "${BLUE}4. MinIO Pod 상태 확인${NC}"
echo "----------------------------------------"
POD_STATUS=$($KUBECTL get pods -n "$NAMESPACE" -l app=minio -o jsonpath='{.items[0].status.phase}' 2>/dev/null)
POD_NAME=$($KUBECTL get pods -n "$NAMESPACE" -l app=minio -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -n "$POD_NAME" ]; then
    if [ "$POD_STATUS" = "Running" ]; then
        echo -e "${GREEN}✅ Pod 상태: ${POD_STATUS}${NC}"
        echo -e "${GREEN}   Pod 이름: ${POD_NAME}${NC}"
    else
        echo -e "${YELLOW}⚠️  Pod 상태: ${POD_STATUS}${NC}"
        echo -e "${YELLOW}   Pod 이름: ${POD_NAME}${NC}"
    fi
else
    echo -e "${RED}❌ MinIO Pod를 찾을 수 없습니다.${NC}"
fi
echo ""

# 5. 포트 연결 테스트 (각 노드 IP에 대해)
echo -e "${BLUE}5. 포트 연결 테스트${NC}"
echo "----------------------------------------"
if [ -n "$NODE_IPS" ] && [ -n "$NODEPORT" ]; then
    for IP in $NODE_IPS; do
        echo -n "  테스트 중: ${IP}:${NODEPORT} ... "
        
        # nc (netcat) 또는 telnet을 사용하여 포트 확인
        if command -v nc &> /dev/null; then
            if nc -z -w 2 "$IP" "$NODEPORT" 2>/dev/null; then
                echo -e "${GREEN}✅ 열려있음${NC}"
            else
                echo -e "${RED}❌ 닫혀있음 또는 연결 실패${NC}"
            fi
        elif command -v telnet &> /dev/null; then
            timeout 2 telnet "$IP" "$NODEPORT" </dev/null 2>&1 | grep -q "Connected" && \
                echo -e "${GREEN}✅ 열려있음${NC}" || \
                echo -e "${RED}❌ 닫혀있음 또는 연결 실패${NC}"
        elif command -v curl &> /dev/null; then
            if curl -s --connect-timeout 2 "http://${IP}:${NODEPORT}/minio/health/live" >/dev/null 2>&1; then
                echo -e "${GREEN}✅ 열려있음 (MinIO 응답 확인)${NC}"
            else
                echo -e "${YELLOW}⚠️  연결 시도 실패 (포트가 열려있을 수도 있음)${NC}"
            fi
        else
            echo -e "${YELLOW}⚠️  포트 테스트 도구가 없습니다 (nc, telnet, curl)${NC}"
            break
        fi
    done
else
    echo -e "${YELLOW}⚠️  노드 IP 또는 NodePort를 찾을 수 없어 포트 테스트를 건너뜁니다.${NC}"
fi
echo ""

# 6. 외부 접속 경로 요약
echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  외부 접속 경로${NC}"
echo -e "${CYAN}==========================================${NC}"
if [ -n "$NODE_IPS" ] && [ -n "$NODEPORT" ]; then
    for IP in $NODE_IPS; do
        echo -e "${GREEN}http://${IP}:${NODEPORT}${NC}"
    done
else
    echo -e "${YELLOW}⚠️  노드 IP 또는 NodePort 정보를 확인할 수 없습니다.${NC}"
fi
echo ""

# 7. 방화벽 확인 안내
echo -e "${BLUE}방화벽 확인${NC}"
echo "----------------------------------------"
echo -e "${YELLOW}노드에서 다음 명령으로 방화벽 상태를 확인하세요:${NC}"
echo "  sudo firewall-cmd --list-ports  # firewalld 사용 시"
echo "  sudo iptables -L -n | grep ${NODEPORT}  # iptables 사용 시"
echo "  sudo ufw status | grep ${NODEPORT}  # ufw 사용 시"
echo ""

