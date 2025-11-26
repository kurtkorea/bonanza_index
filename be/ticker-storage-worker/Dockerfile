FROM node:18-alpine

WORKDIR /app

# ticker-storage-worker의 package.json과 package-lock.json 복사
# 빌드 컨텍스트가 be 디렉토리이므로 ticker-storage-worker/ 경로 사용
# COPY가 실패하면 빌드가 중단되도록 --chown 옵션 없이 명시적으로 복사
COPY ticker-storage-worker/package.json ticker-storage-worker/package-lock.json* ./

# 복사 확인 및 디버깅 (파일이 없으면 즉시 실패)
RUN if [ ! -f package.json ]; then \
        echo "ERROR: package.json not found after COPY!" && \
        echo "Current directory contents:" && \
        ls -la . && \
        exit 1; \
    fi && \
    echo "✅ package.json found" && \
    if [ -f package-lock.json ]; then \
        echo "✅ package-lock.json found"; \
    else \
        echo "⚠️  package-lock.json not found, will use npm install"; \
    fi

# 모든 의존성 설치 (빌드를 위해 devDependencies 필요)
# package-lock.json이 있으면 npm ci, 없으면 npm install 사용
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ticker-storage-worker 소스 코드 복사
COPY ticker-storage-worker/src ./src
COPY ticker-storage-worker/env ./env

# Babel 빌드
RUN npm run build || (echo "Build failed!" && exit 1)

# 로그가 실시간으로 출력되도록 환경 변수 설정
ENV NODE_ENV=production
ENV NODE_OPTIONS="--no-warnings"
ENV NODE_NO_WARNINGS=1

# 포트 노출 (필요시)
# EXPOSE <port>

# 로그가 버퍼링되지 않도록 node를 직접 실행
CMD ["node", "--trace-warnings", "--unhandled-rejections=strict", "dist/app.js"]

