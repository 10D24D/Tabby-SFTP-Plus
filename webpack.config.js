/**
 * Webpack 配置
 * 功能描述：Tabby 插件构建配置，将 tabby 核心模块和 Node 内置模块设为 external
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Claude
 * 修改时间：2026-06-21
 */

const path = require('path')
const webpack = require('webpack')

module.exports = {
  target: 'node',
  entry: 'src/index.ts',
  devtool: 'source-map',
  context: __dirname,
  mode: 'development',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: 'webpack-tabby-sftp-plus:///[resource-path]',
  },
  resolve: {
    modules: ['.', 'src', 'node_modules'].map(x => path.join(__dirname, x)),
    extensions: ['.ts', '.js', '.json'],
    alias: {
      '@common': path.resolve(__dirname, 'tabby-plugin-common/src'),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: {
          configFile: path.resolve(__dirname, 'tsconfig.json'),
        },
      },
      {
        test: /\.scss$/,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.html$/,
        use: 'raw-loader',
      },
    ],
  },
  externals: [
    'fs',
    'path',
    'os',
    'crypto',
    'net',
    'stream',
    'readline',
    'electron',
    /^rxjs/,
    /^@angular/,
    /^tabby-/,
  ],
  plugins: [
    new webpack.DefinePlugin({
      // 每次 npm run build 时写入当前时间，供设置页「关于」展示
      __SFTP_PLUS_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    }),
  ],
}
