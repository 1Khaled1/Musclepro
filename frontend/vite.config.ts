import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/** Emits dist/sw.js with the precache list taken from the real bundle. The
 *  heavy 3D chunks are left out (cached on first use instead) so installing
 *  the app stays light on mobile data. */
function serviceWorker(): Plugin {
  return {
    name: 'musclepro-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => /\.(js|css)$/.test(f) || /-latin-(wght|500)-normal-.*\.woff2$/.test(f))
        .filter((f) => !/three-|Anatomy3D-|AuraBackdrop-/.test(f))
        .map((f) => `/${f}`);
      const precache = [
        '/',
        '/theme-init.js',
        '/logo.svg',
        '/favicon.svg',
        '/manifest.webmanifest',
        '/apple-touch-icon.png',
        ...files.sort(),
      ];
      const template = readFileSync(new URL('./sw/sw.js', import.meta.url), 'utf8');
      // The version covers the worker's own code too, not just the bundle.
      const version = createHash('sha256').update(template).update(precache.join('\n')).digest('hex').slice(0, 12);
      const source = template
        .replaceAll('__PRECACHE__', JSON.stringify(precache))
        .replaceAll('__VERSION__', version);
      if (/__[A-Z]+__/.test(source)) this.error('sw.js: unreplaced build placeholder');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// In development Vite serves the UI on :5173 and proxies the API to Flask on
// :5000, so cookies stay same-origin exactly like production on Render.
export default defineConfig({
  plugins: [serviceWorker()],
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
