// @ts-check
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
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
  },
});
