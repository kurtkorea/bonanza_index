import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// /env 폴더의 환경 변수 파일 로드 함수
function loadEnvFromEnvFolder(mode) {
  // 먼저 Vite의 기본 loadEnv로 프로젝트 루트의 .env 파일 로드
  const baseEnv = loadEnv(mode, process.cwd(), '');
  
  const envDir = path.resolve(process.cwd(), 'env');
  const env = { ...baseEnv };
  
  // /env 폴더의 파일을 직접 읽어서 덮어쓰기
  // 우선순위: .env.local > .env.[mode] > .env
  const envFiles = [
    path.join(envDir, '.env'),
    path.join(envDir, `.env.${mode}`),
    path.join(envDir, '.env.local'),
  ];
  
  // 중복 제거 (우선순위가 높은 파일이 나중에 로드되도록 역순)
  const uniqueFiles = [...new Set(envFiles)].reverse();
  
  uniqueFiles.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach(line => {
        const trimmed = line.trim();
        // 주석이나 빈 줄 건너뛰기
        if (trimmed && !trimmed.startsWith('#')) {
          const match = trimmed.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            // 따옴표 제거 (있는 경우)
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            env[key] = value;
          }
        }
      });
    }
  });
  
  console.log(`[Env Loader] Mode: ${mode}, Loaded VITE_PORT: ${env.VITE_PORT}`);
  
  return env;
}

export default defineConfig(({ mode }) => {
  // /env 폴더의 환경 변수 파일 로드
  const env = loadEnvFromEnvFolder(mode);
  
  // 포트 설정: 환경 변수 또는 기본값 8282
  const serverPort = Number(env.VITE_PORT || 8282);
  
  
  // 프록시 타겟 설정
  // VITE_PROXY_TARGET 우선, 없으면 SERVICE에서 추출, 그 외에는 기본값
  let PROXY_TARGET;
  if (env.VITE_PROXY_TARGET) {
    // VITE_PROXY_TARGET이 설정되어 있으면 우선 사용
    PROXY_TARGET = env.VITE_PROXY_TARGET;
    // localhost를 127.0.0.1로 변환 (IPv6 연결 문제 방지)
    if (PROXY_TARGET.includes('localhost')) {
      PROXY_TARGET = PROXY_TARGET.replace('localhost', '127.0.0.1');
    }
  } else if (env.SERVICE && env.SERVICE.startsWith('http://')) {
    // SERVICE가 http://로 시작하면 백엔드 URL로 사용
    PROXY_TARGET = env.SERVICE;
    // localhost를 127.0.0.1로 변환
    if (PROXY_TARGET.includes('localhost')) {
      PROXY_TARGET = PROXY_TARGET.replace('localhost', '127.0.0.1');
    }
  } else {
    // 기본값
    PROXY_TARGET = 'http://130.162.133.208:30076';
  }
  
  console.log(`[Vite Config] ========================================`);
  console.log(`[Vite Config] Mode: ${mode}, VITE_PORT: ${env.VITE_PORT}, Final Port: ${serverPort}`);
  console.log(`[Vite Config] SERVICE: ${env.SERVICE}, PROXY_TARGET: ${PROXY_TARGET}`);
  console.log(`[Vite Config] ========================================`);

  // WebSocket 에러 억제 플러그인
  const suppressWsErrors = () => {
    return {
      name: 'suppress-ws-errors',
      configureServer(server) {
        const originalError = console.error;
        console.error = (...args) => {
          const errorMessage = args.join(' ');
          if (errorMessage.includes('ws proxy socket error') ||
              errorMessage.includes('ECONNABORTED') ||
              errorMessage.includes('ECONNRESET') ||
              errorMessage.includes('EPIPE') ||
              errorMessage.includes('ECONNREFUSED')) {
            return;
          }
          originalError.apply(console, args);
        };
      },
    };
  };
  
  return {
    plugins: [react(), suppressWsErrors()],
    
    // esbuild 설정: .js 파일도 JSX로 처리
    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.jsx?$/,
      exclude: [],
    },
    
    // optimizeDeps 설정
    optimizeDeps: {
      include: ['react-window', 'react-window/dist/index.esm.js'],
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
      },
    },
    
    // Less 설정
    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
          modifyVars: {
            '@primary-color': '#6b5dd3',
          },
        },
      },
    },

    // 서버 설정
    server: {
      // 포트 설정: local 모드일 때는 무조건 8282
      port: serverPort,
      strictPort: true, // 포트가 사용 중이면 에러 발생 (fallback 방지)
      open: true,
      // WebSocket 에러 억제
      hmr: {
        overlay: false,
      },
      proxy: {
        // /proxy/rest 경로 프록시: /proxy/rest를 제거하고 나머지 경로만 전달
        '/proxy/rest': {
          target: PROXY_TARGET,
          changeOrigin: false, // localhost 프록시 시 false로 설정
          secure: false,
          ws: true,
          rewrite: (path) => {
            // /proxy/rest/v1/master -> /v1/master
            // /proxy/rest/ws -> /ws
            // /proxy/rest -> /
            let newPath = path.replace(/^\/proxy\/rest/, '');
            // 빈 경로인 경우 루트로
            if (!newPath || newPath === '') {
              newPath = '/';
            }
            // 경로가 /로 시작하지 않으면 / 추가
            if (!newPath.startsWith('/')) {
              newPath = '/' + newPath;
            }
            console.log(`[Proxy] Rewrite: ${path} -> ${newPath} (target: ${PROXY_TARGET})`);
            return newPath;
          },
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              const targetUrl = new URL(PROXY_TARGET);
              const rewrittenPath = req.url.replace(/^\/proxy\/rest/, '') || '/';
              // Host 헤더를 명시적으로 설정 (백엔드 서버의 호스트)
              proxyReq.setHeader('Host', targetUrl.host);
              // Origin 헤더 제거 (CORS 문제 방지)
              proxyReq.removeHeader('Origin');
              console.log(`[Proxy] Request: ${req.method} ${req.url} -> ${PROXY_TARGET}${rewrittenPath}`);
              if (req.url.includes('xhr_streaming') || req.url.includes('xhr_send')) {
                proxyReq.removeHeader('Upgrade');
                proxyReq.removeHeader('Connection');
              }
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              // CORS 헤더 추가
              proxyRes.headers['Access-Control-Allow-Origin'] = '*';
              proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
              proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma';
              proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
              proxyRes.headers['Access-Control-Expose-Headers'] = '*';
              console.log(`[Proxy] Response: ${req.url} -> ${proxyRes.statusCode} ${proxyRes.statusMessage || ''}`);
            });
            proxy.on('error', (err, req, res) => {
              // WebSocket 및 네트워크 연결 에러는 조용히 무시
              const ignoredErrors = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT'];
              if (ignoredErrors.includes(err.code)) {
                console.warn(`[Proxy] Ignored error for ${req.url}: ${err.code}`);
                return;
              }
              if (req.url && (req.url.includes('/ws/') || req.url.includes('/sockjs-node/'))) {
                return;
              }
              // 다른 에러는 상세 로깅
              console.error('[Proxy Error]', {
                code: err.code,
                message: err.message,
                url: req.url,
                target: PROXY_TARGET,
                stack: err.stack
              });
            });
            // WebSocket 프록시 에러 핸들링
            proxy.on('proxyReqWs', (proxyReq, req, socket) => {
              // WebSocket 요청 시 헤더 설정
              const targetUrl = new URL(PROXY_TARGET);
              proxyReq.setHeader('Origin', PROXY_TARGET);
              proxyReq.setHeader('Host', targetUrl.host);
            });
            proxy.on('proxyErrorWs', (err, req, socket) => {
              // WebSocket 에러는 조용히 무시
              const ignoredErrors = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT'];
              if (ignoredErrors.includes(err.code)) {
                if (socket && !socket.destroyed) {
                  socket.destroy();
                }
                return;
              }
            });
          },
        },
        // /v1, /service, /order, /virtual 경로 프록시
        '/v1': {
          target: PROXY_TARGET,
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('proxyRes', (proxyRes, req, res) => {
              proxyRes.headers['Access-Control-Allow-Origin'] = '*';
              proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
              proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma';
              proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
              proxyRes.headers['Access-Control-Expose-Headers'] = '*';
            });
            proxy.on('error', (err, req, res) => {
              const ignoredErrors = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT'];
              if (ignoredErrors.includes(err.code)) {
                return;
              }
              console.error('[Proxy Error]', err.code, err.message);
            });
            proxy.on('proxyErrorWs', (err, req, socket) => {
              const ignoredErrors = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT'];
              if (ignoredErrors.includes(err.code)) {
                if (socket && !socket.destroyed) {
                  socket.destroy();
                }
                return;
              }
            });
          },
        },
        '/service': {
          target: PROXY_TARGET,
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              const ignoredErrors = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT'];
              if (ignoredErrors.includes(err.code)) {
                return;
              }
              console.error('[Proxy Error]', err.code, err.message);
            });
            proxy.on('proxyErrorWs', (err, req, socket) => {
              const ignoredErrors = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT'];
              if (ignoredErrors.includes(err.code)) {
                if (socket && !socket.destroyed) {
                  socket.destroy();
                }
                return;
              }
            });
          },
        },
        '/order': {
          target: PROXY_TARGET,
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              const ignoredErrors = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT'];
              if (ignoredErrors.includes(err.code)) {
                return;
              }
              console.error('[Proxy Error]', err.code, err.message);
            });
            proxy.on('proxyErrorWs', (err, req, socket) => {
              const ignoredErrors = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT'];
              if (ignoredErrors.includes(err.code)) {
                if (socket && !socket.destroyed) {
                  socket.destroy();
                }
                return;
              }
            });
          },
        },
        '/virtual': {
          target: PROXY_TARGET,
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              const ignoredErrors = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT'];
              if (ignoredErrors.includes(err.code)) {
                return;
              }
              console.error('[Proxy Error]', err.code, err.message);
            });
            proxy.on('proxyErrorWs', (err, req, socket) => {
              const ignoredErrors = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT'];
              if (ignoredErrors.includes(err.code)) {
                if (socket && !socket.destroyed) {
                  socket.destroy();
                }
                return;
              }
            });
          },
        },
      },
    },

    // public 폴더 설정 (기본값은 'public'이지만 명시적으로 설정)
    publicDir: 'public',
    
    // 빌드 설정
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      // public 폴더의 파일들이 빌드 출력에 포함되도록 보장
      copyPublicDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'antd-vendor': ['antd', '@ant-design/icons'],
            'redux-vendor': ['redux', 'react-redux', 'redux-saga'],
          },
        },
      },
    },

    // 경로 별칭
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    // 환경 변수 접두사
    envPrefix: 'VITE_',
  };
});

