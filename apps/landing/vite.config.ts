import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Vite configuration for the static GitHub Pages landing site.
 */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
