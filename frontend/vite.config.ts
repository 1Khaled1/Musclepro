import { defineConfig } from 'vite';

// In development Vite serves the UI on :5173 and proxies the API to Flask on
// :5000, so cookies stay same-origin exactly like production on Render.
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
});
