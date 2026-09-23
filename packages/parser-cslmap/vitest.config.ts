// packages/parser-cslmap/vitest.config.ts
// Solo valida el JSON Schema de `.vellummap` con ajv: no hace falta jsdom.
import { mergeConfig, defineConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
    },
  }),
);
