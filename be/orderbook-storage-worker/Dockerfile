FROM node:18-alpine

WORKDIR /app

# orderbook-storage-worker의 package.json과 package-lock.json 복사
# 빌드 컨텍스트가 be 디렉토리이므로 orderbook-storage-worker/ 경로 사용
COPY orderbook-storage-worker/package*.json ./

# 모든 의존성 설치 (빌드를 위해 devDependencies 필요)
# package-lock.json이 있으면 npm ci, 없으면 npm install 사용
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# orderbook-storage-worker 소스 코드 복사
COPY orderbook-storage-worker/src ./src
COPY orderbook-storage-worker/env ./env
COPY orderbook-storage-worker/models ./models

# ddl 폴더 복사 (dist/app.js에서 ../../ddl을 찾을 수 있도록)
COPY ddl ./ddl

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

