import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Makro web client (#46). Static files only; all data lives in Supabase.
// Unit tests sit next to the code as *.test.ts and run in Node (sqlite-wasm runs there too).

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Dev server only: serves the fixture product file built by `npm run fixture` (never in a build). */
function fixtureProducts(): Plugin {
  const file = fileURLToPath(new URL('./scripts/out/products-fixture.sqlite', import.meta.url));
  return {
    name: 'makro-fixture-products',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__fixture/products.sqlite', (_req, res) => {
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.end('Run `npm run fixture` first.');
          return;
        }
        res.setHeader('Content-Type', 'application/vnd.sqlite3');
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    fixtureProducts(),
    VitePWA({
      registerType: 'autoUpdate',
      // The service worker caches the app shell (and the wasm) so Makro opens offline.
      // The product file is not cached here: it lives in OPFS.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/__fixture\//],
      },
      manifest: {
        name: 'Makro',
        short_name: 'Makro',
        description: 'Log food and macros.',
        theme_color: '#0D0D0E',
        background_color: '#0D0D0E',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
    }),
  ],
  // sqlite-wasm ships its own wasm file; Vite must not pre-bundle it.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  // No COOP/COEP headers: the opfs-sahpool VFS does not need SharedArrayBuffer.
  server: { port: 5174, strictPort: true },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
