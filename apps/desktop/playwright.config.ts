// apps/desktop/playwright.config.ts
// ESM-compatible: __dirname no está disponible en paquetes con "type": "module"
// Los tests E2E NO se ejecutan en CI automáticamente en v1 — ver nota en pr-validation.yml
//
// Arquitectura: `pnpm dev` lanza `tauri dev`, que:
//   1. Ejecuta beforeDevCommand (pnpm dev:vite) → Vite escucha en localhost:1420
//   2. Compila Rust y abre la ventana nativa Tauri cargando localhost:1420
//   Playwright detecta el puerto listo y conecta al mismo devUrl que el WebView usa.
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    // devUrl que el WebView de Tauri carga (definido en tauri.conf.json)
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
  },
  webServer: {
    // `pnpm dev` = `tauri dev` → arranca la app Tauri completa (nativo + frontend)
    // El primer build de Rust puede tardar varios minutos
    command: 'pnpm dev',
    port: 1420,
    reuseExistingServer: !process.env.CI,
    cwd: __dirname,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
