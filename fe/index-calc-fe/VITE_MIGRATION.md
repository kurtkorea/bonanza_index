# Vite 마이그레이션 가이드

## 완료된 작업

1. ✅ package.json 업데이트 (Vite 및 플러그인 추가)
2. ✅ vite.config.js 생성 (프록시, Less 설정 포함)
3. ✅ index.html 생성
4. ✅ 환경 변수 처리 변경 (process.env → import.meta.env)
5. ✅ Worker 경로 수정
6. ✅ 코드 수정 완료

## 필요한 추가 작업

### 1. 환경 변수 파일 생성

프로젝트 루트에 다음 파일들을 생성하세요:

#### `.env.development`
```
VITE_SERVICE=/proxy/rest
VITE_SERVICENAME=TWDMA
VITE_IS_DEBUG=true
VITE_ORDERSERVERURL=
VITE_CHATSERVERURL=
```

#### `.env.production`
```
VITE_SERVICE=/proxy/rest
VITE_SERVICENAME=TWDMA
VITE_IS_DEBUG=false
VITE_ORDERSERVERURL=
VITE_CHATSERVERURL=
```

#### `.env.local` (로컬 개발용)
```
VITE_SERVICE=/proxy/rest
VITE_SERVICENAME=TWDMA
VITE_IS_DEBUG=true
VITE_ORDERSERVERURL=
VITE_CHATSERVERURL=
```

### 2. 의존성 설치

```bash
cd fe/index-calc-fe
npm install
```

### 3. 개발 서버 실행

```bash
npm run dev
```

### 4. 빌드

```bash
npm run build
```

## 주요 변경사항

### 환경 변수
- 기존: `process.env.SERVICE`
- 변경: `import.meta.env.VITE_SERVICE` 또는 `window.process.env.SERVICE` (하위 호환성 유지)

### 빌드 도구
- 기존: Webpack 5
- 변경: Vite 5

### 개발 서버
- 기존: webpack-dev-server (포트 8282)
- 변경: Vite dev server (포트 8282)

## 주의사항

1. **환경 변수**: Vite는 `VITE_` 접두사가 있는 환경 변수만 클라이언트에 노출됩니다.
2. **정적 파일**: `public` 폴더의 파일들은 그대로 사용 가능합니다.
3. **Worker**: `/worker/websocketWorker.js`는 public 폴더에 있어야 합니다.
4. **프록시**: vite.config.js에 프록시 설정이 포함되어 있습니다.

## 문제 해결

### 환경 변수가 undefined인 경우
- `.env.development` 파일이 올바르게 생성되었는지 확인
- 환경 변수 이름에 `VITE_` 접두사가 있는지 확인
- 개발 서버를 재시작

### 프록시가 작동하지 않는 경우
- vite.config.js의 proxy 설정 확인
- 네트워크 탭에서 요청 확인

### 빌드 에러 발생 시
- `npm install` 재실행
- `node_modules` 삭제 후 재설치

