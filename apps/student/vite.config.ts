import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Student web app build configuration.
 *
 * `allowedHosts: true` is required because the dev server is reached through a
 * proxied preview hostname; Vite otherwise rejects the request with a host check
 * error and the preview appears broken.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    // Sourcemaps are not published, so production stack traces stay opaque.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split the large, rarely-changing vendor code out of the app bundle so
        // an app-only deploy does not invalidate the whole cache. The original
        // build shipped one 793 kB chunk.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase';
          if (id.includes('/react-router')) return 'router';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) {
            return 'react';
          }
          return 'vendor';
        },
      },
    },
  },
});
