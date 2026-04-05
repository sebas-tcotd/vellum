// packages/ui/vitest.config.ts
// NOTA: alias en array-form — los más específicos PRIMERO para evitar que
// '@vellum/core' capture el prefijo de '@vellum/core/testing'
import { mergeConfig, defineConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.base';
import path from 'path';

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: '@vellum/core/testing',
          replacement: path.resolve(__dirname, '../core/src/testing/index.ts'),
        },
        {
          find: '@vellum/core',
          replacement: path.resolve(__dirname, '../core/src/index.ts'),
        },
        {
          find: '@vellum/renderer-canvas',
          replacement: path.resolve(__dirname, '../renderer-canvas/src/index.ts'),
        },
        {
          find: '@vellum/theme-engine',
          replacement: path.resolve(__dirname, '../theme-engine/src/index.ts'),
        },
      ],
    },
  })
);
