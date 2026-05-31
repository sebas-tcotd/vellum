// packages/ui/src/App.tsx
import { Suspense, useEffect, useState } from 'react';
import { CanvasRoot } from './components/canvas/CanvasRoot';
import { EmptyState } from './components/empty-state/EmptyState';
import { ProgressBar } from './components/overlays/ProgressBar';
import { initI18n } from './i18n/i18n-setup';
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';
import { cn } from './lib/utils';

/**
 * Global type augmentation for i18next.
 * @remarks
 * **CRITICAL INVARIANT:** This import must remain at the top level of the application
 * to ensure strict type-checking for the `t()` function is activated globally across
 * the entire React component tree.
 */
import './i18n/types';

import { useVellumStore } from './store/vellum-store';

const noop = async (): Promise<void> => {};

/**
 * Props injected from the Tauri composition root (`apps/desktop`).
 * Allows `@vellum/ui` to remain free of direct Tauri runtime dependencies
 * while still receiving the file-loading callbacks it needs.
 */
export interface AppProps {
  /** Loads a .cslmap file via the IPC bridge. Injected from the Tauri composition root. */
  loadFile?: (filePath: string) => Promise<void>;
  /** Opens the OS file picker. Injected from the Tauri composition root. */
  openFileDialog?: () => Promise<void>;
}

/**
 * The root React component of the Vellum desktop application.
 * @remarks
 * **Lifecycle Invariant (Localization):** The UI is strictly blocked from rendering
 * (returning `null`) until the asynchronous `initI18n()` routine completes. This
 * guarantees that users never experience a "flash of unlocalized content" or see
 * raw translation keys on startup.
 *
 * **State Synchronization:** This component is solely responsible for invoking
 * the store's `syncActiveLanguage` to align the Zustand state with the implicitly
 * detected OS language at boot time, preventing initialization loops.
 *
 * **Empty State (Story 2.1):** `<EmptyState />` se inyecta como overlay sobre el canvas
 * cuando `loadingState === 'idle'` y `cityData === null`. `CanvasRoot` permanece siempre
 * montado para preservar el contexto canvas al cargar un mapa.
 */
export function App({ loadFile, openFileDialog = noop }: AppProps) {
  const [i18nReady, setI18nReady] = useState(false);
  const syncActiveLanguage = useVellumStore((s) => s.syncActiveLanguage);
  const cityData = useVellumStore((s) => s.cityData);
  const loadingState = useVellumStore((s) => s.loadingState);

  useKeyboardShortcuts({
    onOpenFile: openFileDialog,
    enabled: loadingState !== 'loading',
  });

  useEffect(() => {
    initI18n().then((detectedLang) => {
      syncActiveLanguage(detectedLang);
      setI18nReady(true);
    });
  }, [syncActiveLanguage]);

  // Evitar flash en idioma incorrecto — no renderizar hasta que i18n esté listo
  if (!i18nReady) return null;

  // EmptyState es overlay sobre CanvasRoot — CanvasRoot siempre montado para
  // no perder el contexto canvas al cargar un mapa (Story 2.4 añadirá la transición)
  // Show EmptyState when there's no city to display — covers both idle (no file loaded)
  // and error (parse failed) states. Never show during active loading.
  const showEmptyState = cityData === null && loadingState !== 'loading';

  return (
    <Suspense fallback={null}>
      <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
        <div
          data-testid="canvas-wrapper"
          className={cn(
            'absolute inset-0 transition-opacity duration-500',
            cityData ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          <CanvasRoot loadFile={loadFile} />
        </div>
        {showEmptyState && <EmptyState />}
        {loadingState === 'loading' && <ProgressBar />}
        {cityData && loadingState === 'idle' && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="rounded-xl bg-black/75 px-5 py-3 text-sm text-white shadow-lg backdrop-blur-sm">
              Genial! el parser Rust ha completado su tarea con éxito. El
              renderizado ocurrirá pronto (stay tuned!) 😉
            </div>
          </div>
        )}
      </div>
    </Suspense>
  );
}
