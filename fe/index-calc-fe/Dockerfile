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
COPY . .

# Webpack 빌드
RUN npm run build

# 프로덕션 단계
# 구체적인 태그를 사용하여 캐시 활용 및 안정성 향상
FROM nginx:1.25-alpine

# 빌드된 정적 파일을 Nginx 웹 루트로 복사
# webpack 빌드 결과물은 public 폴더에 생성됨 (webpack.prod.config.js의 output.path 설정)
COPY --from=builder /app/public/ /usr/share/nginx/html/

# Nginx 설정 파일 복사
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 포트 노출
EXPOSE 80

# Nginx 시작
CMD ["nginx", "-g", "daemon off;"]
