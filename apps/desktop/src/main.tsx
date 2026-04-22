import React from 'react';
import ReactDOM from 'react-dom/client';
import { App, AppMetaProvider } from '@vellum/ui';
// CSS global importado aquí (entry point de Vite) para que los @font-face con
// url() a @fontsource y los design tokens se procesen en build time.
// No puede importarse desde dentro de @vellum/ui (compilado con TSC, no Vite).
import '@vellum/ui/globals.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { version } from '../package.json';
import { useParseCslmap } from './hooks/use-parse-cslmap';

// Bridge: Tauri → browser custom event
// WebView2 (Windows) no propaga el evento browser 'dragenter' para drags externos
// del SO (archivos desde el explorador). Escuchamos el evento nativo de Tauri y lo
// re-despachamos como CustomEvent para que EmptyState (en @vellum/ui) lo reciba
// sin depender directamente de @tauri-apps/api.
void getCurrentWindow().listen('tauri://drag-enter', () => {
  window.dispatchEvent(new CustomEvent('vellum:drag-enter'));
});

/**
 * Composition root that wires Tauri-specific hooks into the UI layer.
 * Keeps `@vellum/ui` free of direct Tauri runtime dependencies.
 */
function AppShell() {
  const { loadFile, openFileDialog } = useParseCslmap();
  return <App loadFile={loadFile} openFileDialog={openFileDialog} />;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppMetaProvider version={version}>
      <AppShell />
    </AppMetaProvider>
  </React.StrictMode>,
);
