import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Use a relative base path so assets load correctly on any GitHub Pages URL structure
  base: './',
  server: {
    port: 5173,
    // Proxy /api to backend during local development
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  define: {
    // Inject backend URL at build time via environment variable
    // In production: set VITE_BACKEND_URL to your Railway URL
    // In development: falls back to empty string → uses the proxy above
    __BACKEND_URL__: JSON.stringify(process.env.VITE_BACKEND_URL || ''),
  },
});
