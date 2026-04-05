// packages/core/vitest.config.ts
// @vellum/core no tiene dependencias externas — sin alias necesarios
import { mergeConfig, defineConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.base';

export default mergeConfig(baseConfig, defineConfig({}));
