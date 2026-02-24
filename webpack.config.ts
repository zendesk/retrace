// call like: yarn webpack build --mode production --entry ./lib/hashids.ts --env moduleTarget=esm --env engineTarget=web --env outDir=dist/umd

import * as path from 'path'
import webpack from 'webpack'
import type { Configuration, Compiler } from 'webpack'
import webpackSources from 'webpack-sources'
import type { Source } from 'webpack-sources'

const { ReplaceSource } = webpackSources

type ExternalFn = Extract<
  NonNullable<Configuration['externals']>,
  (data: any) => Promise<any>
>

class PostProcessChunkWebpackPlugin {
  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap(
      'PostProcessChunkWebpackPlugin',
      (compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: 'PostProcessChunkWebpackPlugin',
            stage:
              webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_COMPATIBILITY,
          },
          (assetRecord) => {
            const jsAssets = Object.entries(
              assetRecord as Record<string, Source>,
            ).filter(([name]) => name.endsWith('.js'))
            const mappedAssets = jsAssets.map(([name, source]) => {
              const newSource = new ReplaceSource(source)
              const contents = source.source().toString()
              const regexp = /__webpack_require__/g
              const matches = contents.matchAll(regexp)
              for (const match of matches) {
                const index = match.index!
                const length = '__webpack_require__'.length
                if (length) {
                  newSource.replace(
                    index,
                    index + length - 1,
                    '__interna_require__',
                  )
                }
              }
              return [name, newSource]
            })
            Object.assign(assetRecord, Object.fromEntries(mappedAssets))
          },
        )
      },
    )
  }
}

// eslint-disable-next-line import/no-default-export
export default ({
  moduleTarget = 'esm',
  codeTarget = 'es2020',
  engineTarget = 'web',
  filename = 'main.js',
  outDir = moduleTarget,
}: {
  moduleTarget: string
  codeTarget?: string
  engineTarget?: string
  filename?: string
  outDir?: string
}): Configuration => {
  return {
    target: [codeTarget, engineTarget],
    experiments: {
      outputModule: true,
      // futureDefaults: true,
      // topLevelAwait: true,
      // css: false,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '...'],
      alias: {
        '#image_overlay': path.join(__dirname, 'src/dummy.png'),
        // react: path.join(__dirname, 'src/reactInterop.js'),
        // 'react-dom': path.join(__dirname, 'src/reactDomInterop'),
        // 'external-react': 'react',
        // 'external-react-dom': 'react-dom',
        // 'external-react-dom-client': 'react-dom/client',
      },
    },
    mode: 'production',
    optimization: {
      concatenateModules: true,
    },
    // entry: {
    //   main: {
    //     import: './src/main',
    //     // this should work, but doesn't for some reason:
    //     baseUri: 'data:',
    //   },
    // },
    output: {
      module: true,
      library: {
        type: 'module',
      },
      chunkFormat: 'module',
      filename,
      path: path.join(process.cwd(), outDir),
      publicPath: '',
      importMetaName: `({url: 'https://_'})`,
    },
    devtool: 'source-map',
    plugins: [new PostProcessChunkWebpackPlugin()],
    module: {
      rules: [
        {
          test: /\.tsx?$/i,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                compilerOptions: {
                  module: 'esnext',
                  moduleResolution: 'node',
                  target: 'es2020',
                  esModuleInterop: false,
                  sourceMap: true,
                },
              },
            },
          ],
        },
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.svg$/i,
          type: 'asset/inline',
        },
      ],
    },
    ignoreWarnings: [
      {
        module: /node_modules\/lodash\/_freeGlobal\.js$/,
      },
    ],
    externals: [
      'react',
      'react-dom',
      'react-dom/client',
      // (async (data) => {
      //   const { request } = data
      //   if (request === 'external-react') {
      //     return 'react'
      //   }
      //   if (request === 'external-react-dom') {
      //     return 'react-dom'
      //   }
      //   return false
      // }) as ExternalFn,
    ],
    externalsType: 'module',
  }
}
