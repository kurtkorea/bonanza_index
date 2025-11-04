const HtmlWebpackPlugin = require("html-webpack-plugin"); //추가
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const { LessPluginRemoveAntdGlobalStyles } = require("less-plugin-remove-antd-global-styles");
const dotenv = require("dotenv");
const webpack = require("webpack");

const { createProxyMiddleware } = require('http-proxy-middleware');

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
			  },	
			historyApiFallback: true,
			port: 8282,
			static: {
				directory: __dirname + "/public",
			},
			proxy: [
				{
					context: ['/v1', '/service', '/order', '/virtual'],
					target: process.env.SERVICE,
					secure: false,
					changeOrigin: true,
					onProxyReq: (proxyReq, req, res) => {
						// 프록시 요청 시 헤더 설정
						proxyReq.setHeader('Origin', process.env.SERVICE);
					},
					onProxyRes: (proxyRes, req, res) => {
						// CORS 헤더 추가
						proxyRes.headers['Access-Control-Allow-Origin'] = '*';
						proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
						proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
						proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
					},
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
