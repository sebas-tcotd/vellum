import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * Vite configuration for the static GitHub Pages landing site.
 */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        privacy: fileURLToPath(
          new URL('./privacy/index.html', import.meta.url),
        ),
      },
    },
  },
});
