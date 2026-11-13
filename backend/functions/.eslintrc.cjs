/**
 * ESLint config for the Cloud Functions package.
 *
 * This package is Node/TypeScript only — it must not inherit the repository-root
 * .eslintrc.cjs, which loads the React-Hooks plugin. That plugin is a dependency
 * of apps/admin only, so the root config made `npm run lint` here fail with
 * "ESLint couldn't find the plugin eslint-plugin-react-hooks" and broke CI.
 *
 * `root: true` stops the lookup at this directory.
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    '**/node_modules/**',
    '**/lib/**',
    '**/*.js',
    '__tests__/**',
  ],
  rules: {
    // Existing Firestore and callable-function boundaries are progressively
    // typed. TypeScript (`tsc --noEmit` in CI) remains the enforced type gate.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-var-requires': 'off',
  },
};
