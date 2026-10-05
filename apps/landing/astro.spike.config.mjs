// @ts-check
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

/**
 * Isolated build for the step-4 spike: real app components rendered at build
 * time inside Declarative Shadow DOM, next to reference pages that render the
 * same components with the app's full globals.css.
 *
 * Never published: it writes to target/landing-spike, outside dist/, and the
 * production config (astro.config.mjs) does not know about spike/.
 */
export default defineConfig({
  srcDir: './spike',
  publicDir: './spike/public',
  outDir: '../../target/landing-spike',
  base: '/',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // Astro applies the root tsconfig `paths`, which point @vellum/core at
      // its TS sources; those re-export types without `export type` and do
      // not bundle. Use the compiled package, as its `exports` says.
      alias: [
        {
          find: /^@vellum\/core$/,
          replacement: fileURLToPath(
            new URL('../../packages/core/dist/index.js', import.meta.url),
          ),
        },
      ],
    },
  },
});
