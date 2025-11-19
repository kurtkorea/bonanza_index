FROM node:18-alpine

WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 모든 의존성 설치 (빌드를 위해 devDependencies 필요)
# package-lock.json이 있으면 npm ci, 없으면 npm install 사용
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 소스 코드 복사
COPY . .

# Babel 빌드
RUN npm run build

# 환경 변수 설정
ENV NODE_ENV=production

# 포트 노출
EXPOSE 3109

# 애플리케이션 실행
CMD ["node", "dist/app.js"]

