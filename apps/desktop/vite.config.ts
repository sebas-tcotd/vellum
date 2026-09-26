import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { version } from './package.json';

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },

  resolve: {
    alias: [
      // Maps `@/*` used by shadcn/ui components to packages/ui/src/*
      {
        find: '@',
        replacement: fileURLToPath(
          new URL('../../packages/ui/src', import.meta.url),
        ),
      },
      // Resolve workspace packages from source so Vite HMR works without rebuilding dist
      // The package's one extra entry: the tree painter Worker (see its `exports`).
      {
        find: /^@vellum\/renderer-webgl\/tree-worker(?=\?|$)/,
        replacement: fileURLToPath(
          new URL(
            '../../packages/renderer-webgl/src/sources/tree-worker.ts',
            import.meta.url,
          ),
        ),
      },
      {
        find: /^@vellum\/renderer-webgl$/,
        replacement: fileURLToPath(
          new URL(
            '../../packages/renderer-webgl/src/index.ts',
            import.meta.url,
          ),
        ),
      },
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}));
