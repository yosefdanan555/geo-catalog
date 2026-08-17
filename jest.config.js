/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
  transform: {
    '^.+\\.ts$': '@swc/jest',
  },
  clearMocks: true,
  testTimeout: 20000,
  verbose: true,
};
