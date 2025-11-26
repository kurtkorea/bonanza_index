# 빌드 단계
FROM node:18-alpine AS builder

WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 모든 의존성 설치 (빌드를 위해 devDependencies 필요)
# package-lock.json이 있으면 npm ci 시도, 실패하면 npm install로 폴백
RUN if [ -f package-lock.json ]; then \
        echo "Attempting npm ci..." && \
        npm ci --legacy-peer-deps 2>&1 || { \
            echo "⚠️  npm ci failed, falling back to npm install..." && \
            npm install --legacy-peer-deps; \
        }; \
    else \
        echo "No package-lock.json found, using npm install"; \
        npm install --legacy-peer-deps; \
    fi

# 소스 코드 복사
# .dockerignore가 public 폴더를 제외하지 않도록 주의
COPY . .

# 빌드 전에 public 폴더 확인
RUN echo "=== Checking public folder before build ===" && \
    ls -la public/lib/ 2>/dev/null | head -5 || echo "WARNING: lib/ directory not found in public" && \
    ls -la public/css/ 2>/dev/null | head -5 || echo "WARNING: css/ directory not found in public" && \
    ls -la public/js/ 2>/dev/null | head -5 || echo "WARNING: js/ directory not found in public"

# 환경 변수 파일 처리 (Vite는 .env.production 파일을 자동으로 읽음)
# .env.production 파일이 없으면 env/prod.env를 기반으로 생성
RUN if [ ! -f .env.production ] && [ -f env/prod.env ]; then \
        echo "Creating .env.production from env/prod.env..." && \
        awk -F'=' '/^[A-Z_]+=/ { \
            key=$1; \
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", key); \
            value=substr($0, index($0, "=") + 1); \
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", value); \
            if (key != "" && key !~ /^#/) print "VITE_" key "=" value \
        }' env/prod.env > .env.production && \
        echo "VITE_ORDERSERVERURL=" >> .env.production && \
        echo "VITE_CHATSERVERURL=" >> .env.production; \
    fi && \
    echo "=== Checking .env.production file ===" && \
    if [ -f .env.production ]; then \
        echo "Contents of .env.production:" && \
        cat .env.production && \
        echo "" && \
        echo "Checking VITE_SERVICE value:" && \
        grep "VITE_SERVICE" .env.production || echo "ERROR: VITE_SERVICE not found!"; \
    else \
        echo "ERROR: .env.production file not found!"; \
        exit 1; \
    fi

# Vite 프로덕션 빌드
# Vite는 .env.production 파일을 자동으로 읽음
# 빌드 전에 환경 변수 확인
RUN echo "=== Building with environment variables ===" && \
    if [ -f .env.production ]; then \
        echo "VITE_SERVICE from .env.production:" && \
        grep "VITE_SERVICE" .env.production || echo "WARNING: VITE_SERVICE not found in .env.production"; \
    fi && \
    npm run build:prod && \
    echo "=== Checking build output ===" && \
    echo "Files in dist directory:" && \
    ls -la dist/ | head -20 && \
    echo "Checking static directories in dist:" && \
    ls -la dist/lib/ 2>/dev/null | head -5 || echo "lib/ directory not found in dist" && \
    ls -la dist/css/ 2>/dev/null | head -5 || echo "css/ directory not found in dist" && \
    ls -la dist/js/ 2>/dev/null | head -5 || echo "js/ directory not found in dist" && \
    echo "Checking original public folder:" && \
    ls -la public/lib/ 2>/dev/null | head -5 || echo "lib/ directory not found in public" && \
    ls -la public/css/ 2>/dev/null | head -5 || echo "css/ directory not found in public" && \
    ls -la public/js/ 2>/dev/null | head -5 || echo "js/ directory not found in public" && \
    echo "=== Copying static files from public to dist ===" && \
    cp -r public/lib dist/ 2>/dev/null || echo "Failed to copy lib/" && \
    cp -r public/css dist/ 2>/dev/null || echo "Failed to copy css/" && \
    cp -r public/js dist/ 2>/dev/null || echo "Failed to copy js/" && \
    cp -r public/images dist/ 2>/dev/null || echo "Failed to copy images/" && \
    cp -r public/charting_library dist/ 2>/dev/null || echo "Failed to copy charting_library/" && \
    cp -r public/worker dist/ 2>/dev/null || echo "Failed to copy worker/" && \
    echo "=== Final check ===" && \
    ls -la dist/lib/ 2>/dev/null | head -5 || echo "lib/ still not found" && \
    ls -la dist/css/ 2>/dev/null | head -5 || echo "css/ still not found"

# 프로덕션 단계
# 구체적인 태그를 사용하여 캐시 활용 및 안정성 향상
FROM nginx:1.25-alpine

# 빌드된 정적 파일을 Nginx 웹 루트로 복사
# Vite 빌드 결과물은 dist 폴더에 생성됨 (vite.config.js의 build.outDir 설정)
# dist 폴더의 모든 내용을 복사 (정적 파일 포함)
COPY --from=builder /app/dist/ /usr/share/nginx/html/

# Nginx 설정 파일 복사
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 포트 노출
EXPOSE 80

# Nginx 시작
CMD ["nginx", "-g", "daemon off;"]
