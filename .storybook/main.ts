import type { StorybookConfig } from '@storybook/react-webpack5'
// import { mergeConfig } from 'vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-webpack5-compiler-swc', '@storybook/addon-docs'],
  framework: '@storybook/react-webpack5',

  // framework: {
  //   // name: '@storybook/react-vite',
  //   name: '@storybook/react-webpack5',
  //   options: {},
  // },
  core: {},

  // other storybook options...,
  webpackFinal(config, options) {
    const assetRule = config.module?.rules?.find(
      (m) =>
        typeof m === 'object' &&
        m.test instanceof RegExp &&
        m.test.test('.svg'),
    )
    if (!assetRule || typeof assetRule !== 'object') {
      throw new Error('SVG rule not found')
    }
    assetRule.test =
      /\.(ico|jpg|jpeg|png|apng|gif|eot|otf|webp|ttf|woff|woff2|cur|ani|pdf)(\?.*)?$/

    config.module?.rules?.unshift({
      test: /\.svg$/,
      // issuer: /\.[jt]sx?$/,
      use: [
        { loader: '@svgr/webpack', options: { exportType: 'named' } },
        'url-loader',
      ],
      // type: 'asset/resource',
      // generator: { filename: 'static/media/[path][name][ext]' }
    })
    return config
  },

  typescript: {
    check: false,
    reactDocgen: 'react-docgen',
    reactDocgenTypescriptOptions: {}, // Available only when reactDocgen is set to 'react-docgen-typescript'
    // skipCompiler: true,
  }
}
export default config
