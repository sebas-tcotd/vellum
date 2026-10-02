import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: '../../target/landing-browser-results',
  use: {
    baseURL: 'http://127.0.0.1:4178/vellum/',
    browserName: 'chromium',
  },
  webServer: {
    command: 'node tests/static-server.mjs',
    url: 'http://127.0.0.1:4178/vellum/',
    reuseExistingServer: false,
  },
});
