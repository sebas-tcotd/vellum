// vitest.config.base.ts — configuración base compartida por todos los packages
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // necesario para componentes React en @vellum/ui
    globals: true, // describe/it/expect disponibles sin import explícito
    passWithNoTests: true, // packages sin tests propios no fallan (ej: @vellum/core en Story 1.5)
    // Never run compiled test artifacts: `tsc -b` emits stale `*.test.js` into
    // dist/, which vitest 4 does not exclude by default and which reference
    // no-longer-existing relative paths. Includes the vitest node_modules default.
    exclude: ['**/node_modules/**', '**/dist/**'],
    // CI runs every package's suite at once (turbo) on a 4-vCPU runner, and
    // each vitest defaults to one worker per core: jsdom suites starved each
    // other until map-libre-renderer.test.ts ran ~13x slower than locally and
    // a random test crossed the 5 s timeout. One worker per package there.
    ...(process.env.CI ? { maxWorkers: 1 } : {}),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
  },
});
