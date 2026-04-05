// apps/desktop/playwright.config.ts
// ESM-compatible: __dirname no está disponible en paquetes con "type": "module"
// Los tests E2E NO se ejecutan en CI automáticamente en v1 — ver nota en pr-validation.yml
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    // El WebView de Tauri en dev mode carga este mismo devUrl (ver tauri.conf.json)
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
  },
  webServer: {
    // Arranca el servidor Vite (el mismo que Tauri WebView carga en dev)
    // Para tests con IPC nativo real se necesitará `tauri dev` en una futura story
    command: 'pnpm dev:vite',
    port: 1420,
    reuseExistingServer: !process.env.CI,
    cwd: __dirname,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
