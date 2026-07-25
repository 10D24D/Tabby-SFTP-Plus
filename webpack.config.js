/**
 * Webpack 配置
 * 功能描述：Tabby 插件构建配置，将 tabby 核心模块和 Node 内置模块设为 external；
 *           .html 模板经 asset/source 内联为字符串
 *           （原配置误用 raw-loader 但未安装，属隐藏债；2026-07-11 抽模板时发现并改为 webpack5 内置 asset/source，零新依赖）
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-11
 */

const path = require('path')
const webpack = require('webpack')

module.exports = {
  target: 'node',
  entry: 'src/index.ts',
  devtool: 'source-map',
  context: __dirname,
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
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
      // 唯一真源：仓库根目录 tabby-plugin-common（勿再嵌套副本）
      '@common': path.resolve(__dirname, '../tabby-plugin-common/src'),
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
        // webpack5 内置，零依赖：将 .html 文件作为字符串导出，供 Angular 组件 `template: require('./x.html')` 使用
        // （勿改回 raw-loader：该包已废弃且本项目未安装，会导致构建失败）
        test: /\.html$/,
        type: 'asset/source',
      },
      {
        // 将 .po 文件内联为字符串，供 i18n 服务运行时解析
        test: /\.po$/,
        type: 'asset/source',
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
