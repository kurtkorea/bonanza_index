FROM node:18-alpine

WORKDIR /app

# orderbook-collector의 package.json과 package-lock.json 복사
# 빌드 컨텍스트가 be 디렉토리이므로 orderbook-collector/ 경로 사용
# COPY가 실패하면 빌드가 중단되도록 --chown 옵션 없이 명시적으로 복사
COPY orderbook-collector/package.json orderbook-collector/package-lock.json* ./

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
# package-lock.json이 있으면 npm ci 시도, 실패하면 npm install로 폴백
RUN if [ -f package-lock.json ]; then \
        echo "Attempting npm ci..." && \
        npm ci 2>&1 || { \
            echo "⚠️  npm ci failed, falling back to npm install..." && \
            npm install; \
        }; \
    else \
        echo "No package-lock.json found, using npm install"; \
        npm install; \
    fi

# orderbook-collector 소스 코드 복사 (src/ddl 폴더 포함)
COPY orderbook-collector/src ./src
COPY orderbook-collector/env ./env

# Babel 빌드
RUN npm run build || (echo "Build failed!" && exit 1)

# 빌드 후 src/ddl 폴더가 여전히 존재하는지 확인
# src 폴더를 복사할 때 ddl 폴더도 함께 복사되므로 별도 복사 불필요
RUN ls -la ./src/ddl 2>/dev/null || (echo "ERROR: src/ddl folder not found after build" && exit 1)

# 로그가 실시간으로 출력되도록 환경 변수 설정
# stdout/stderr 버퍼링 방지
ENV NODE_ENV=production
ENV NODE_OPTIONS="--no-warnings"
# Python 스타일의 unbuffered 출력을 위해 PYTHONUNBUFFERED와 유사한 효과
ENV NODE_NO_WARNINGS=1

# 포트 노출
EXPOSE 6001

# 로그가 버퍼링되지 않도록 node를 직접 실행 (stdout/stderr 즉시 출력)
# --trace-warnings: 경고 스택 트레이스 출력
# --unhandled-rejections=strict: 처리되지 않은 Promise rejection 시 즉시 종료
CMD ["node", "--trace-warnings", "--unhandled-rejections=strict", "dist/app.js"]

