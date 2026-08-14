import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Admin panel build configuration.
 *
 * Served from `/admin/` on the same Firebase Hosting site as the student app, so
 * `base` must match the hosting rewrite. `allowedHosts` is required for the
 * proxied preview hostname used in development.
 */
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@services': path.resolve(__dirname, './src/services'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    // Sourcemaps are not published so production traces stay opaque.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Route-level lazy imports handle page splitting; these groups keep the
        // large, slow-changing vendor code in separately cacheable chunks.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/@firebase/') || id.includes('/firebase/')) return 'firebase';
          if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-')) return 'charts';
          if (id.includes('/@tanstack/')) return 'query';
          if (id.includes('/react-router')) return 'router';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) {
            return 'react';
          }
          return 'vendor';
        },
      },
    },
  },
  optimizeDeps: {
    include: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions'],
  },
});
