// @ts-check
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

/**
 * Static GitHub Pages build under the repository prefix.
 *
 * English lives at the root and Spanish under `/es/`. The hard URLs
 * `/vellum/#download` and `/vellum/privacy/` must keep resolving.
 */
export default defineConfig({
  site: 'https://sebas-tcotd.github.io',
  base: '/vellum/',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // The real app components (src/components/app-embed) import
      // @vellum/core. Astro applies the root tsconfig `paths`, which point at
      // its TS sources; those re-export types without `export type` and do
      // not bundle. Use the compiled package, as its `exports` says (the
      // build script compiles it first).
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
