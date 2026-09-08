// vitest.scripts.config.mjs — suite for the repo-level node scripts.
//
// The scripts in `scripts/` are not a workspace package, so `turbo test` never
// reaches them. They still ship guardrails (`verify-network-surface.mjs`), and
// a guardrail without a test only proves it runs, not that it detects
// anything — so `pnpm test` chains this config after the turbo run.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/**/*.test.mjs'],
  },
});
