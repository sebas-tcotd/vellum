// apps/desktop/tests/e2e/smoke.spec.ts
// Smoke test mínimo — verifica que la UI de la app carga sin errores.
// Playwright conecta al servidor Vite (puerto 1420), que es el mismo devUrl que el WebView de Tauri carga en dev.
// El flujo drag&drop→render→export se implementa en Story 2.x cuando la funcionalidad exista.
import { test, expect } from '@playwright/test';

test('app UI loads and shows empty state', async ({ page }) => {
  // El webServer en playwright.config.ts ya arrancó pnpm dev:vite en localhost:1420
  await page.goto('/');

  // Verificar que el título de la página es 'Vellum'
  await expect(page).toHaveTitle(/Vellum/);

  // Verificar que el body renderiza (empty state mínimo visible)
  // El selector exacto del EmptyState real se actualiza en Story 2.1
  await expect(page.locator('body')).toBeVisible();
});
