// vitest.config.base.ts — configuración base compartida por todos los packages
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // necesario para componentes React en @vellum/ui
    globals: true, // describe/it/expect disponibles sin import explícito
    passWithNoTests: true, // packages sin tests propios no fallan (ej: @vellum/core en Story 1.5)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
  },
});
