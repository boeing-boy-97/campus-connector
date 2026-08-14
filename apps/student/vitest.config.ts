import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Pin React resolution to this workspace's copy.
 *
 * The student app runs React 19 while the admin app (and therefore the hoisted
 * root `node_modules`) is on React 18. Without these aliases Vitest resolves the
 * hoisted React 18 renderer against React 19 components and every render fails
 * with "Objects are not valid as a React child".
 */
const reactRoot = dirname(require.resolve('react/package.json'));
const reactDomRoot = dirname(require.resolve('react-dom/package.json'));

/**
 * Component tests run in jsdom against the real components. The Firebase
 * boundary is mocked per-suite; everything above it is production code.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // `dedupe` makes Vite collapse every request for these packages onto one
    // copy, which also covers @testing-library/react's own hoisted imports.
    dedupe: ['react', 'react-dom', '@testing-library/react'],
    // Every `react` / `react-dom` specifier — including the deep `cjs/` paths the
    // CommonJS builds require internally — is redirected into this workspace.
    alias: [
      { find: /^react-dom\/(.*)$/, replacement: `${reactDomRoot}/$1` },
      { find: /^react-dom$/, replacement: `${reactDomRoot}/index.js` },
      { find: /^react\/(.*)$/, replacement: `${reactRoot}/$1` },
      { find: /^react$/, replacement: `${reactRoot}/index.js` },
    ],
  },
  test: {
    environment: 'jsdom',
    // Vitest externalises node_modules by default, which makes them bypass the
    // aliases above and load the hoisted React 18 renderer through Node's
    // resolver. Inlining the testing library routes it through Vite so it shares
    // this workspace's React 19 copy.
    server: {
      deps: {
        inline: ['@testing-library/react', '@testing-library/dom', '@testing-library/jest-dom'],
      },
    },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    coverage: {
      reporter: ['text-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.test.{ts,tsx}', 'src/main.tsx'],
    },
  },
});
