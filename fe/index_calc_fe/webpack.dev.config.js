const HtmlWebpackPlugin = require("html-webpack-plugin"); //추가
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const { LessPluginRemoveAntdGlobalStyles } = require("less-plugin-remove-antd-global-styles");
const dotenv = require("dotenv");
const webpack = require("webpack");

const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = (env, options) => {

	const proxy = require('http-proxy-middleware');

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
            proxy: {
                '/service/*': {
                    target: process.env.SERVICE,
                    secure: false,
                    changeOrigin: true,
                    onProxyRes: (proxyRes) => {
                    },
                },
                '/v1/*': {
                    target: process.env.SERVICE,
                    secure: false,
                    changeOrigin: true,
                    onProxyRes: (proxyRes) => {
                    },
                },	
                '/order/*': {
                    target: process.env.ORDER,
                    secure: false,
                    changeOrigin: true,
                    onProxyRes: (proxyRes) => {
                    },
                },					
                '/virtual/*': {
                    target: process.env.VIRTUAL,
                    secure: false,
                    changeOrigin: true,
                    onProxyRes: (proxyRes) => {
                    },
                },									
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
