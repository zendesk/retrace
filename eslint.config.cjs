const globals = require('globals')
const tsParser = require('@typescript-eslint/parser')

const normalizeGlobals = (value) =>
  Object.fromEntries(
    Object.entries(value).map(([key, config]) => [key.trim(), config]),
  )

module.exports = [
  {
    ignores: ['cjs/**', 'dist/**', 'esm/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...normalizeGlobals(globals.browser),
        ...normalizeGlobals(globals.jest),
        ...normalizeGlobals(globals.node),
      },
    },
    linterOptions: {
      noInlineConfig: true,
      reportUnusedInlineConfigs: 'off',
    },
    rules: {
      'no-tabs': 'error',
    },
  },
]
