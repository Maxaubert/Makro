import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Makro web client (#46). Static files only; all data lives in Supabase.
// Unit tests sit next to the code as *.test.ts and run in Node (no DOM needed yet).
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Makro',
        short_name: 'Makro',
        description: 'Log food and macros.',
        theme_color: '#0D0D0E',
        background_color: '#0D0D0E',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  // sqlite-wasm ships its own worker and wasm file; Vite must not pre-bundle it.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  server: {
    port: 5174,
    // OPFS with sqlite-wasm needs cross-origin isolation (SharedArrayBuffer).
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
