FROM node:18-alpine

WORKDIR /app

# orderbook-collector의 package.json과 package-lock.json 복사
# 빌드 컨텍스트가 be 디렉토리이므로 orderbook-collector/ 경로 사용
COPY orderbook-collector/package*.json ./

# 모든 의존성 설치 (빌드를 위해 devDependencies 필요)
# package-lock.json이 있으면 npm ci, 없으면 npm install 사용
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# orderbook-collector 소스 코드 복사
COPY orderbook-collector/src ./src
COPY orderbook-collector/env ./env

# ddl 폴더 복사 (dist/app.js에서 ../../ddl을 찾을 수 있도록)
# 빌드 컨텍스트가 be 디렉토리이므로 ddl 폴더가 루트에 있어야 함
COPY ddl ./ddl

# Babel 빌드
RUN npm run build || (echo "Build failed!" && exit 1)

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

