// packages/renderer-webgl/vitest.config.ts
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
      ],
    },
  }),
);
