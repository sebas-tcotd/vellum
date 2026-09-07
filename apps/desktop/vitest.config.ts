// apps/desktop/vitest.config.ts
import { mergeConfig, defineConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.base';
import path from 'path';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // The golden-flow E2E suite lives under tests/ and runs via `test:e2e`
      // against a compiled binary; `pnpm test` must never start the app. The
      // `.unit.test.mjs` suffix is the opt-in for the ones that drive nothing:
      // an ordinary `tests/e2e/*.test.mjs` still stays out by default, so a
      // new E2E file cannot wander into this project by being added.
      exclude: ['**/node_modules/**'],
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.unit.test.mjs'],
      setupFiles: [
        path.resolve(__dirname, '../../packages/ui/src/test-setup.ts'),
      ],
    },
    resolve: {
      alias: [
        {
          find: '@vellum/core/testing',
          replacement: path.resolve(
            __dirname,
            '../../packages/core/src/testing/index.ts',
          ),
        },
        {
          find: '@vellum/core',
          replacement: path.resolve(
            __dirname,
            '../../packages/core/src/index.ts',
          ),
        },
        {
          // @/ is used internally by @vellum/ui components (e.g. button.tsx)
          find: '@',
          replacement: path.resolve(__dirname, '../../packages/ui/src'),
        },
        {
          find: '@vellum/ui',
          replacement: path.resolve(
            __dirname,
            '../../packages/ui/src/index.ts',
          ),
        },
      ],
    },
  }),
);
