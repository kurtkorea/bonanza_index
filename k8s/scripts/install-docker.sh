#!/bin/bash

# Docker 설치 스크립트 (Linux)

set -e

echo "🐳 Docker 설치"
echo "================================"
echo ""

# 이미 설치되어 있는지 확인
if command -v docker &>/dev/null; then
    echo "✅ Docker가 이미 설치되어 있습니다"
    docker --version
    exit 0
fi

# OS 확인
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "❌ OS를 확인할 수 없습니다"
    exit 1
fi

echo "📋 OS: $OS"
echo ""

# Docker 설치
if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    echo "🔧 Ubuntu/Debian에 Docker 설치 중..."
    
    # 기존 Docker 제거
    sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # 필수 패키지 설치
    sudo apt-get update
    sudo apt-get install -y \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
    
    # Docker 공식 GPG 키 추가
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$OS/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Docker 저장소 추가
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Docker 설치
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
    echo "🔧 CentOS/RHEL/Fedora에 Docker 설치 중..."
    
    # 기존 Docker 제거
    sudo yum remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null || true
    
    # 필수 패키지 설치
    sudo yum install -y yum-utils
    
    # Docker 저장소 추가
    sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    
    # Docker 설치
    sudo yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
else
    echo "❌ 지원하지 않는 OS입니다: $OS"
    echo "   수동으로 Docker를 설치하세요: https://docs.docker.com/engine/install/"
    exit 1
fi

# Docker 서비스 시작 및 자동 시작 설정
echo ""
echo "🚀 Docker 서비스 시작 중..."
sudo systemctl start docker
sudo systemctl enable docker

# 현재 사용자를 docker 그룹에 추가
echo ""
echo "👤 사용자를 docker 그룹에 추가 중..."
sudo usermod -aG docker $USER

echo ""
echo "✅ Docker 설치 완료!"
echo ""
echo "💡 다음 단계:"
echo "   1. 로그아웃 후 다시 로그인하거나 다음 명령 실행:"
echo "      newgrp docker"
echo ""
echo "   2. Docker 확인:"
echo "      docker --version"
echo "      docker run hello-world"
echo ""

