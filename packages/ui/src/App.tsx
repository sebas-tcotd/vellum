// packages/ui/src/App.tsx
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { CanvasRoot } from './components/canvas/CanvasRoot';
import { CanvasRenderer } from '@vellum/renderer-canvas';
import type { IRenderer, LayerVisibility } from '@vellum/core';
import { LAYER_NAMES } from '@vellum/core';
import { EmptyState } from './components/empty-state/EmptyState';
import { ProgressBar } from './components/overlays/ProgressBar';
import { ErrorToast } from './components/overlays/ErrorToast';
import { PartialParseDialog } from './components/overlays/PartialParseDialog';
import { DlcWarningToast } from './components/overlays/DlcWarningToast';
import { FloatingLayerPanel } from './components/panels/FloatingLayerPanel';
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

// All layers visible — used when rendering a new CityData so the worker
// paints every layer. CSS opacity (controlled by activeLayers) handles visibility.
const ALL_LAYERS_VISIBLE: LayerVisibility = Object.fromEntries(
  LAYER_NAMES.map((l) => [l, true]),
) as LayerVisibility;

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
  /** Retries the last file with allow_partial=true. Injected from the Tauri composition root. */
  loadFilePartial?: () => Promise<void>;
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
export function App({
  loadFile,
  openFileDialog = noop,
  loadFilePartial = noop,
}: AppProps) {
  const [i18nReady, setI18nReady] = useState(false);
  const rendererRef = useRef<IRenderer | null>(null);
  const [renderer, setRenderer] = useState<IRenderer | null>(null);
  const fitToScreenRef = useRef<(() => void) | null>(null);
  const syncActiveLanguage = useVellumStore((s) => s.syncActiveLanguage);
  const cityData = useVellumStore((s) => s.cityData);
  const activeLayers = useVellumStore((s) => s.activeLayers);
  const loadingState = useVellumStore((s) => s.loadingState);
  const loadingError = useVellumStore((s) => s.loadingError);
  const dlcWarnings = useVellumStore((s) => s.dlcWarnings);
  const hasPartialData = useVellumStore((s) => s.hasPartialData);
  const setLoadingState = useVellumStore((s) => s.setLoadingState);
  const setDlcWarnings = useVellumStore((s) => s.setDlcWarnings);
  const setHasPartialData = useVellumStore((s) => s.setHasPartialData);
  const toggleLayer = useVellumStore((s) => s.toggleLayer);

  useKeyboardShortcuts({
    onOpenFile: openFileDialog,
    // Layer shortcuts 1-7 only active when a map is loaded
    ...(cityData !== null ? { onToggleLayer: toggleLayer } : {}),
    onFitToScreen: () => fitToScreenRef.current?.(),
    enabled: loadingState !== 'loading',
  });

  useEffect(() => {
    initI18n().then((detectedLang) => {
      syncActiveLanguage(detectedLang);
      setI18nReady(true);
    });
  }, [syncActiveLanguage]);

  useEffect(() => {
    const r = new CanvasRenderer();
    rendererRef.current = r;
    setRenderer(r);
    return () => {
      r.dispose();
      rendererRef.current = null;
      setRenderer(null);
    };
  }, []);

  useEffect(() => {
    if (!cityData || !rendererRef.current) return;
    // Reset zoom/pan when a new map loads so the user sees the full map
    fitToScreenRef.current?.();
    rendererRef.current.render(cityData, { activeLayers: ALL_LAYERS_VISIBLE });
  }, [cityData]);

  const handleDlcDismiss = useCallback(() => {
    setDlcWarnings([]);
    setHasPartialData(false);
  }, [setDlcWarnings, setHasPartialData]);

  // Evitar flash en idioma incorrecto — no renderizar hasta que i18n esté listo
  if (!i18nReady) return null;

  // EmptyState es overlay sobre CanvasRoot — CanvasRoot siempre montado para
  // no perder el contexto canvas al cargar un mapa.
  // Show EmptyState when there's no city to display — covers both idle (no file loaded)
  // and error (parse failed) states. Never show during active loading.
  const showEmptyState = cityData === null && loadingState !== 'loading';

  const showPartialParseDialog =
    loadingState === 'error' && loadingError?.type === 'PartialParse';

  const showErrorToast =
    loadingState === 'error' &&
    loadingError != null &&
    loadingError.type !== 'PartialParse';

  const showDlcWarningToast =
    cityData !== null &&
    loadingState === 'idle' &&
    (dlcWarnings.length > 0 || hasPartialData);

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
          <CanvasRoot
            loadFile={loadFile}
            renderer={renderer}
            activeLayers={activeLayers}
            fitToScreenRef={fitToScreenRef}
          />
        </div>
        {showEmptyState && <EmptyState />}
        {loadingState === 'loading' && <ProgressBar />}
        {showPartialParseDialog && loadingError?.type === 'PartialParse' && (
          <PartialParseDialog
            error={loadingError}
            onPartialRender={loadFilePartial}
            onCancel={() => setLoadingState('idle')}
          />
        )}
        {showErrorToast && loadingError != null && (
          <ErrorToast
            error={loadingError}
            onDismiss={() => setLoadingState('idle')}
          />
        )}
        {showDlcWarningToast && (
          <DlcWarningToast
            isPartialData={hasPartialData}
            onDismiss={handleDlcDismiss}
          />
        )}
        {cityData !== null && loadingState !== 'loading' && (
          <FloatingLayerPanel cityName={cityData.cityName} />
        )}
      </div>
    </Suspense>
  );
}
