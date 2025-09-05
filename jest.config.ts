import type { Config } from 'jest'

const config: Config = {
  verbose: true,
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/packages/*/src/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    '<rootDir>/src/**/*.test.{ts,tsx,mts,cts}',
  ],
  snapshotFormat: {
    escapeString: false,
    printBasicPrototype: false,
  },
  clearMocks: true,
  transform: {
    '^.+\\.(c|m)?(t|j)sx?$': '@swc/jest',
  },
}

export default config
