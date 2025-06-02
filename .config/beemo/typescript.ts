import type TypeScript from '@niieani/scaffold/src/configs/typescript'

export default {
  compilerOptions: {
    jsx: 'react',
    target: 'es2023' as 'es2022',
    verbatimModuleSyntax: true,
    allowSyntheticDefaultImports: false,
  },
  'ts-node': {
    compilerOptions: {
      module: 'commonjs',
    },
  },
  include: ['src/**/*'],
} as typeof TypeScript
