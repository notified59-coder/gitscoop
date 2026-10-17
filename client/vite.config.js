import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/robots.txt': 'http://localhost:8787',
      '/sitemap.xml': 'http://localhost:8787',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: { md: ['react-markdown', 'remark-gfm', 'rehype-raw', 'rehype-sanitize', 'rehype-highlight'] },
      },
    },
  },
});