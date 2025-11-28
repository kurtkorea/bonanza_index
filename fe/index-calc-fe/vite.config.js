import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // 환경 변수 로드
  const env = loadEnv(mode, process.cwd(), '');
  
  // 프록시 타겟 설정 (환경 변수 또는 기본값)
  const PROXY_TARGET = env.VITE_PROXY_TARGET || 'http://130.162.133.208:30076';
  
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
      port: 8282,
      open: true,
      // WebSocket 에러 억제
      hmr: {
        overlay: false,
      },
      proxy: {
        // /proxy 경로 프록시
        '/proxy': {
          target: PROXY_TARGET,
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              const targetUrl = new URL(PROXY_TARGET);
              proxyReq.setHeader('Origin', PROXY_TARGET);
              proxyReq.setHeader('Host', targetUrl.host);
              if (req.url.includes('xhr_streaming') || req.url.includes('xhr_send')) {
                proxyReq.removeHeader('Upgrade');
                proxyReq.removeHeader('Connection');
              }
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              proxyRes.headers['Access-Control-Allow-Origin'] = '*';
              proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
              proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma';
              proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
              proxyRes.headers['Access-Control-Expose-Headers'] = '*';
            });
            proxy.on('error', (err, req, res) => {
              // WebSocket 및 네트워크 연결 에러는 조용히 무시
              const ignoredErrors = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT'];
              if (ignoredErrors.includes(err.code)) {
                return;
              }
              if (req.url && (req.url.includes('/ws/') || req.url.includes('/sockjs-node/'))) {
                return;
              }
              // 다른 에러만 로깅
              console.error('[Proxy Error]', err.code, err.message);
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

