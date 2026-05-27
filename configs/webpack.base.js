const { resolve } = require('path');
const nodeExternals = require('webpack-node-externals');
const webpack = require('webpack');
const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');

const package = require('../package.json');

module.exports = (env, argv) => {
  const isDevelopment = argv.mode === 'development';

  if (!isDevelopment) {
    process.env.SENTRY_PROPERTIES =
      process.env.SENTRY_PROPERTIES || resolve(__dirname, 'sentry.properties');
  }

  return {
    devServer: {
      hot: true,
      port: 8080,
      allowedHosts: 'all',
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      client: {
        overlay: {
          errors: true,
          warnings: false
        }
      }
    },
    devtool: isDevelopment ? 'inline-source-map' : 'source-map',
    externals: [
      nodeExternals({
        // Anyting related to webpack, we want to keep in the bundle
        allowlist: [
          /webpack(\/.*)?/,
          'electron-devtools-installer',
          /svg-baker-runtime(\/.*)?/,
          /svg-sprite-loader(\/.*)?/
        ]
      })
    ],
    module: {
      rules: []
    },
    node: {
      // This will make __dirname equal the bundles path
      __dirname: false
    },
    output: {
      path: resolve(__dirname, '../build')
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(
          isDevelopment ? 'development' : 'production'
        )
      })
    ].concat(
      !isDevelopment
        ? [
            sentryWebpackPlugin({
              release: {
                name: `${package.name}@${package.version}`
              },
              sourcemaps: {
                assets: './build/**/*.{js,map}',
                ignore: ['node_modules', 'webpack.config.js'],
                urlPrefix: '~/build/'
              },
              disable: !process.env.SENTRY_AUTH_TOKEN
            })
          ]
        : []
    ),
    resolve: {
      alias: {
        'realm-studio-styles': resolve(__dirname, '../styles'),
        'realm-studio-svgs': resolve(__dirname, '../static/svgs')
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.html', '.scss', '.svg']
    }
  };
};
