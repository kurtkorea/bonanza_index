const { CleanWebpackPlugin } = require("clean-webpack-plugin"); //추가
const HtmlWebpackPlugin = require("html-webpack-plugin"); //추가
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const { LessPluginRemoveAntdGlobalStyles } = require("less-plugin-remove-antd-global-styles");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const dotenv = require("dotenv");
const webpack = require("webpack");

module.exports = (env, options) => {
  //npm run build -- --env site=[site]
  const config = dotenv.config({
    path: "./env/prod.env",
  });
  const keys = Object.keys(config.parsed);
  const define = keys.reduce((acc, key) => {
    acc["process.env." + key] = JSON.stringify(config.parsed[key]);
    return acc;
  }, {});
  // console.log(process.env.SERVICENAME, process.env.RESTSERVERURL);
  return {
    entry: ["@babel/polyfill", "./src/index.js"],

    plugins: [
      //추가
      new CleanWebpackPlugin({
        cleanOnceBeforeBuildPatterns: ["**/*", "!css/**", "!lib/**", "!doc/**", "!images/**", "!js/**", "!worker/**", "!charting_library/**"],
      }),
      new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, /ko|en/),
      new HtmlWebpackPlugin({ template: "./base.html", title: process.env.SERVICENAME }),
      new webpack.DefinePlugin(define),
      new MiniCssExtractPlugin({
        linkType: false,
        filename: "[name].[chunkhash:8].css",
        chunkFilename: "[name].[chunkhash:8].css",
      }),
      // new BundleAnalyzerPlugin(),
    ],

    output: {
      publicPath: "/",
      // path: __dirname + "/public_prod",
      path: __dirname + "/public",
      filename: "[name].[chunkhash:8].js",
      chunkFilename: "[name].[chunkhash:8].js",
    },

		devServer: {
			historyApiFallback: true,
			port: 82,
			static: {
				directory: __dirname + "/public",
			},
            proxy: {
                '/v1/*': {
                  target: process.env.SERVICE,
                  secure: false,
                  changeOrigin: true,
                  onProxyRes: (proxyRes) => {
                    // CORS 헤더 추가
                    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                    proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
                  },
              },
              '/service/*': {
                target: process.env.SERVICE,
                secure: false,
                changeOrigin: true,
                onProxyRes: (proxyRes) => {
                  proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                  proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                  proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
                },
              },
            },			
		},    

    optimization: {
      minimize: true,
      splitChunks: {
        cacheGroups: {
          vendors: {
            chunks: "async",
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            enforce: true,
            priority: 1,
          },
          styles: {
            chunks: "all",
            test: /\.s?css$/,
            enforce: true,
            reuseExistingChunk: true,
            priority: 0,
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
              loader: MiniCssExtractPlugin.loader,
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
              loader: MiniCssExtractPlugin.loader,
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
