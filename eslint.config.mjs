import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import eslintComments from 'eslint-plugin-eslint-comments'
import * as espree from 'espree'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
})
const tsEslintRulesOff = Object.fromEntries(
  Object.keys(tseslint.rules).map((rule) => [
    `@typescript-eslint/${rule}`,
    'off',
  ]),
)

export default [
  ...compat.extends('niieani').map((config) => {
    if (!config.rules) {
      return config
    }

    const {
      ['@typescript-eslint/no-throw-literal']: _removedThrowLiteral,
      ['@typescript-eslint/no-parameter-properties']: _removedParamProps,
      ['import/no-commonjs']: _removedImportNoCommonjs,
      ['unicorn/import-index']: _removedUnicornImportIndex,
      ...rules
    } = config.rules

    return {
      ...config,
      rules,
    }
  }),
  {
    plugins: {
      'eslint-comments': eslintComments,
    },
    rules: {
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/parameter-properties': 'error',
      '@typescript-eslint/restrict-plus-operands': [
        'error',
        {
          skipCompoundAssignments: false,
        },
      ],
      '@typescript-eslint/member-ordering': 'off',
      '@typescript-eslint/lines-between-class-members': 'off',
      'import/export': 'off',
      // just in case we want to support older browsers
      'unicorn/prefer-at': 'off',
      'import/no-deprecated': 'off',
      'compat/compat': 'off',
      'import/no-extraneous-dependencies': 'off',
      'no-magic-numbers': 'off',
      'eslint-comments/no-unused-disable': 'off',
      'arrow-body-style': 'off',
      complexity: 'off',
      'sort-keys': 'off',
      'no-tabs': 'error',
      'no-nested-ternary': 'off',
      'no-plusplus': 'off',
      // breaks with latest eslint version:
      'unicorn/expiring-todo-comments': 'off',

      // require a eslint-enable comment for every eslint-disable comment
      'eslint-comments/disable-enable-pair': [
        'error',
        {
          allowWholeFile: true,
        },
      ],
      // disallow a eslint-enable comment for multiple eslint-disable comments
      'eslint-comments/no-aggregating-enable': 'error',
      // disallow duplicate eslint-disable comments
      'eslint-comments/no-duplicate-disable': 'error',
      // disallow eslint-disable comments without rule names
      'eslint-comments/no-unlimited-disable': 'error',
      // disallow unused eslint-disable comments
      'eslint-comments/no-unused-disable': 'error',
      // disallow unused eslint-enable comments
      'eslint-comments/no-unused-enable': 'error',
      // disallow ESLint directive-comments
      'eslint-comments/no-use': [
        'error',
        {
          allow: [
            'eslint-disable',
            'eslint-disable-line',
            'eslint-disable-next-line',
            'eslint-enable',
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      parser: espree,
      parserOptions: {
        sourceType: 'module',
      },
    },
    rules: tsEslintRulesOff,
  },
]
