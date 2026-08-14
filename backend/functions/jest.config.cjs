module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  collectCoverageFrom: ['src/utils/otp.utils.ts'],
  coverageDirectory: 'coverage',
};
