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
	if ((errorMessage.includes('[HPM]') || errorMessage.includes('[webpack-dev-server]')) && 
	    (errorMessage.includes('ECONNABORTED') || 
	     errorMessage.includes('ECONNRESET') || 
	     errorMessage.includes('EPIPE') ||
	     errorMessage.includes('ECONNREFUSED') ||
	     errorMessage.includes('WebSocket error'))) {
		// SockJS 전송 방식 시도 중 발생하는 정상적인 에러이므로 억제
		return;
	}
	// 다른 에러는 정상적으로 출력
	originalConsoleError.apply(console, args);
};

module.exports = (env, options) => {

	const config = dotenv.config({
		path: "./env/local.env",
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
