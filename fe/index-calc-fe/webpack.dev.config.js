const HtmlWebpackPlugin = require("html-webpack-plugin"); //추가
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const { LessPluginRemoveAntdGlobalStyles } = require("less-plugin-remove-antd-global-styles");
const dotenv = require("dotenv");
const webpack = require("webpack");

const { createProxyMiddleware } = require('http-proxy-middleware');

// SockJS 관련 WebSocket 에러 로깅 억제
// http-proxy-middleware가 내부적으로 console.error를 호출하므로 임시로 오버라이드
const originalConsoleError = console.error;
const ignoredErrorCodes = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED'];

console.error = function(...args) {
	// HPM (http-proxy-middleware) 관련 에러이고, 무시할 에러 코드인 경우 억제
	const errorMessage = args.join(' ');
	if (errorMessage.includes('[HPM]') && 
	    (errorMessage.includes('ECONNABORTED') || 
	     errorMessage.includes('ECONNRESET') || 
	     errorMessage.includes('EPIPE') ||
	     errorMessage.includes('ECONNREFUSED'))) {
		// SockJS 전송 방식 시도 중 발생하는 정상적인 에러이므로 억제
		return;
	}
	// 다른 에러는 정상적으로 출력
	originalConsoleError.apply(console, args);
};

module.exports = (env, options) => {

	const config = dotenv.config({
		path: "./env/dev.env",
	});
	const keys = Object.keys(config.parsed);
	const define = keys.reduce((acc, key) => {
		acc["process.env." + key] = JSON.stringify(config.parsed[key]);
		return acc;
	}, {});

	return {
		entry: ["@babel/polyfill", "./src/index.js"],

		mode: "development",

		plugins: [
			new HtmlWebpackPlugin({ template: "./base.html", title: process.env.SERVICENAME }),
			new webpack.DefinePlugin(define),
			// new BundleAnalyzerPlugin()
			// new webpack.EnvironmentPlugin(["SERVICENAME"]),
		],

		output: {
			publicPath: "/",
			path: __dirname + "/public",
			filename: "dev-bundle.js",
		},

		devServer: {
			client: {
				overlay: {
				  runtimeErrors: false,
				},
				logging: 'warn', // 클라이언트 로깅 레벨 조정
			  },	
			historyApiFallback: true,
			port: 8282,
			static: {
				directory: __dirname + "/public",
			},
			proxy: [
				{
					context: (pathname, req) => {
						// /proxy 경로는 모두 프록시하되, xhr_streaming, xhr_send 등은 WebSocket이 아님
						return pathname.startsWith('/proxy');
					},
					// 개발 환경: nginx를 통해 백엔드로 프록시
					target: 'http://121.88.4.57:30076',
					secure: false,
					changeOrigin: true,
					logLevel: 'silent', // silent로 변경 (SockJS 전송 방식 시도 에러 완전 억제)
					// /proxy 경로는 그대로 유지
					onProxyReq: (proxyReq, req, res) => {
						// 프록시 요청 시 헤더 설정
						proxyReq.setHeader('Origin', 'http://121.88.4.57:30076');
						proxyReq.setHeader('Host', '121.88.4.57:30076');
						// xhr_streaming, xhr_send는 일반 HTTP 요청이므로 WebSocket 업그레이드 헤더 제거
						if (req.url.includes('xhr_streaming') || req.url.includes('xhr_send')) {
							proxyReq.removeHeader('Upgrade');
							proxyReq.removeHeader('Connection');
						}
					},
					onProxyRes: (proxyRes, req, res) => {
						// CORS 헤더 강제 추가 (모든 응답에)
						proxyRes.headers['Access-Control-Allow-Origin'] = '*';
						proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
						proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma';
						proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
						proxyRes.headers['Access-Control-Expose-Headers'] = '*';
					},
					onError: (err, req, res) => {
						// WebSocket 연결 에러는 무시 (SockJS가 다른 전송 방식을 시도함)
						// SockJS 관련 경로의 에러는 조용히 무시
						if (req.url && req.url.includes('/ws/') && 
						    (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
							// 조용히 무시 (에러 로그 출력 안 함)
							return;
						}
						console.error('[webpack-dev-server] Proxy error:', err.message);
						if (!res.headersSent) {
							res.writeHead(500, {
								'Content-Type': 'text/plain',
								'Access-Control-Allow-Origin': '*'
							});
							res.end('Proxy error: ' + err.message);
						}
					},
					// WebSocket 프록시는 실제 WebSocket 업그레이드 요청에만 적용
					ws: true,
					onProxyReqWs: (proxyReq, req, socket, options, head) => {
						// WebSocket 업그레이드 요청 처리
						// 헤더 설정
						proxyReq.setHeader('Origin', 'http://121.88.4.57:30076');
						proxyReq.setHeader('Host', '121.88.4.57:30076');
					},
					onProxyErrorWs: (err, req, socket) => {
						// WebSocket 에러 처리 (연결 중단 에러는 조용히 무시)
						// SockJS는 여러 전송 방식을 시도하므로 일부 실패는 정상
						// http-proxy-middleware가 내부적으로 에러를 로깅하지만,
						// logLevel을 'warn'으로 설정하여 일부 에러를 억제
						if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNREFUSED') {
							// 조용히 무시 (에러 로그 출력 안 함)
							// socket이 아직 열려있으면 닫기
							if (socket && !socket.destroyed) {
								socket.destroy();
							}
							return;
						}
						// 다른 에러만 로그 출력
						console.error('[webpack-dev-server] WebSocket proxy error:', err.code, err.message);
					},
				},
				{
					context: ['/v1', '/service', '/order', '/virtual'],
					// 직접 nginx로 프록시 (기존 경로들)
					target: 'http://121.88.4.57:30076',
					secure: false,
					changeOrigin: true,
					logLevel: 'debug',
					onProxyRes: (proxyRes, req, res) => {
						// CORS 헤더 강제 추가
						proxyRes.headers['Access-Control-Allow-Origin'] = '*';
						proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
						proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma';
						proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
						proxyRes.headers['Access-Control-Expose-Headers'] = '*';
					},
					ws: true,
				},
			],
		},

		module: {
			rules: [
				{
					test: /\.js$/,
					loader: "babel-loader",
					exclude: /node_modules/,
				},
				{
					test: /\.css$/,
					use: [
						{
							loader: "style-loader",
						},
						{
							loader: "css-loader",
							options: {
								url: false,
							},
						},
					],
				},
				{
					test: /\.(png|jpg|gif)$/,
					use: [
						{
							loader: "url-loader",
							options: {
								limit: 8192,
							},
						},
					],
				},
				{
					test: /\.less$/,
					use: [
						{
							loader: "style-loader",
						},
						{
							loader: "css-loader",
							options: {
								url: false,
							},
						},
						{
							loader: "less-loader",
							options: {
								lessOptions: {
									javascriptEnabled: true,
									plugins: [new LessPluginRemoveAntdGlobalStyles()],
								},
							},
						},
					],
				},
			],
		},
	};
};
