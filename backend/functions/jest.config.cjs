/**
 * Jest configuration for the Cloud Functions workspace.
 *
 * `jose` (reached transitively via firebase-admin → jwks-rsa) is ESM-only from
 * v6, which CommonJS Jest cannot parse. The tests never verify a real JWT — the
 * whole Firebase boundary is substituted in src/test/setup.ts — so the module is
 * mapped to a lightweight stub instead of pulling ESM transform machinery into
 * the test runner.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  moduleNameMapper: {
    '^jose$': '<rootDir>/src/test/stubs/jose.cjs',
  },
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/utils/**/*.ts',
    'src/middleware/**/*.ts',
    'src/functions/**/*.ts',
    '!src/**/*.test.ts',
    '!src/test/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov'],
  clearMocks: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
