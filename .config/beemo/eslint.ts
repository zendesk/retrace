import { ESLintConfig } from '@beemo/driver-eslint'

const config: ESLintConfig = {
  rules: {
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
  },
}

export default config
