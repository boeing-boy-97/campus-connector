import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Enable source maps for production debugging
    sourcemap: false,
    // Target modern browsers
    target: 'es2020',
    // Minification
    minify: 'terser',
    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions', 'firebase/storage'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    // Allow external access for preview environments
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
})
