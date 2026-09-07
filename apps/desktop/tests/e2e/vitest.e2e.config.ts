// apps/desktop/tests/e2e/vitest.e2e.config.ts
//
// The golden-flow E2E project. Deliberately NOT listed in the repo's
// `vitest.workspace.ts` and not merged with `vitest.config.base`: `pnpm test`
// must stay a fast, hermetic unit run that never compiles Rust, never starts
// `tauri-driver` and never opens a window. These tests are `pnpm test:e2e`,
// a separate command with separate prerequisites.
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Anchored on the desktop app, not on this file's directory, so paths read
  // the same here as in every other config in the repo.
  root: path.resolve(__dirname, '../..'),
  test: {
    // No DOM here: the DOM under test lives in the Tauri WebView and is
    // reached over WebDriver. A jsdom environment would only be a second,
    // irrelevant document in scope.
    environment: 'node',
    include: ['tests/e2e/**/*.test.mjs'],
    // Launching the app, loading a city and exporting a full-resolution PNG is
    // minutes of real work on a cold CI runner, and the driver holds a single
    // WebDriver port — so: generous timeouts, and strictly one thing at a time.
    testTimeout: 300_000,
    hookTimeout: 300_000,
    teardownTimeout: 60_000,
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { concurrent: false },
    // A silently passing run is the failure mode this whole story exists to
    // remove: if the binary or the driver is missing, say so loudly.
    passWithNoTests: false,
  },
});
