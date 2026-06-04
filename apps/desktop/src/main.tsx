import React from 'react';
import ReactDOM from 'react-dom/client';
import { App, AppMetaProvider, useVellumStore } from '@vellum/ui';
// CSS global importado aquí (entry point de Vite) para que los @font-face con
// url() a @fontsource y los design tokens se procesen en build time.
// No puede importarse desde dentro de @vellum/ui (compilado con TSC, no Vite).
import '@vellum/ui/globals.css';
// MapLibre GL JS default styles — must be imported at the app entry point.
// Without this, the map renders without base UI styles (attribution, controls).
import 'maplibre-gl/dist/maplibre-gl.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { version } from '../package.json';
import { useParseCslmap } from './hooks/use-parse-cslmap';

const win = getCurrentWindow();

// Bridge: Tauri → browser custom event
// WebView2 (Windows) no propaga el evento browser 'dragenter' para drags externos
// del SO (archivos desde el explorador). Escuchamos el evento nativo de Tauri y lo
// re-despachamos como CustomEvent para que EmptyState (en @vellum/ui) lo reciba
// sin depender directamente de @tauri-apps/api.
void win.listen('tauri://drag-enter', () => {
  window.dispatchEvent(new CustomEvent('vellum:drag-enter'));
});

// ── Window title ───────────────────────────────────────────────────────────────
// `document.title` may not propagate dynamically in Tauri's WKWebView.
// Subscribe to the store outside React so `setTitle` is called as soon as
// cityData changes, independently of any React rendering cycle.
let prevCityName: string | null = null;
useVellumStore.subscribe((state) => {
  const cityName = state.cityData?.cityName ?? null;
  if (cityName === prevCityName) return;
  prevCityName = cityName;
  const title = cityName ? `Vellum — ${cityName}` : 'Vellum';
  void win
    .setTitle(title)
    .catch((err) => console.error('Error Tauri setTitle:', err));
});

/**
 * Composition root that wires Tauri-specific hooks into the UI layer.
 * Keeps `@vellum/ui` free of direct Tauri runtime dependencies.
 */
function AppShell() {
  const { loadFile, openFileDialog, loadFilePartial } = useParseCslmap();
  return (
    <App
      loadFile={loadFile}
      openFileDialog={openFileDialog}
      loadFilePartial={loadFilePartial}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppMetaProvider version={version}>
      <AppShell />
    </AppMetaProvider>
  </React.StrictMode>,
);
