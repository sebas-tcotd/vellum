// packages/ui/vitest.config.ts
// NOTA: alias en array-form — los más específicos PRIMERO para evitar que
// '@vellum/core' capture el prefijo de '@vellum/core/testing'
import { mergeConfig, defineConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.base';
import path from 'path';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      setupFiles: [path.resolve(__dirname, 'src/test-setup.ts')],
    },
    resolve: {
      alias: [
        {
          find: '@vellum/core/testing',
          replacement: path.resolve(__dirname, '../core/src/testing/index.ts'),
        },
        {
          find: /^@\//,
          replacement: path.resolve(__dirname, 'src') + '/',
        },
        {
          find: '@vellum/core',
          replacement: path.resolve(__dirname, '../core/src/index.ts'),
        },
        {
          find: '@vellum/theme-engine',
          replacement: path.resolve(__dirname, '../theme-engine/src/index.ts'),
        },
      ],
    },
  }),
);
