FROM node:18-alpine

WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 모든 의존성 설치 (빌드를 위해 devDependencies 필요)
RUN npm ci

# 소스 코드 복사
COPY . .

# Babel 빌드
RUN npm run build

ENV NODE_ENV=production

CMD ["node", "dist/app.js"]

