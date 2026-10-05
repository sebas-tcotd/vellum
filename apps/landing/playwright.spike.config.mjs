import { defineConfig } from '@playwright/test';

/**
 * Step-4 spike: compares the Declarative Shadow DOM embed of real app
 * components with a reference rendering. Needs `pnpm spike:build` first.
 */
export default defineConfig({
  testDir: './tests-spike',
  outputDir: '../../target/landing-spike-results',
  use: {
    baseURL: 'http://127.0.0.1:4179/',
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'node tests-spike/static-server.mjs',
    url: 'http://127.0.0.1:4179/embed/linux-light/',
    reuseExistingServer: false,
  },
});
