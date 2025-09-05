module.exports = {
  extends: ['niieani'],
  plugins: ['eslint-comments'],
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
}
