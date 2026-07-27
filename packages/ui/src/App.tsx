// packages/ui/src/App.tsx
import type { ServiceIconLegendState } from '@vellum/renderer-webgl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { MapLibreRoot } from './components/canvas/MapLibreRoot';
import { EmptyState } from './components/empty-state/EmptyState';
import { ProgressBar } from './components/overlays/ProgressBar';
import { ErrorToast } from './components/overlays/ErrorToast';
import { PartialParseDialog } from './components/overlays/PartialParseDialog';
import { DlcWarningToast } from './components/overlays/DlcWarningToast';
import { ThemeWarningToast } from './components/overlays/ThemeWarningToast';
import { FloatingLayerPanel } from './components/panels/FloatingLayerPanel';
import { ExportDialog } from './components/panels/ExportDialog';
import { IconLegend } from './components/panels/IconLegend';
import { initI18n } from './i18n/i18n-setup';
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';
import { useThemes } from './hooks/use-themes';
import { cn } from './lib/utils';

/**
 * Global type augmentation for i18next.
 * @remarks
 * **CRITICAL INVARIANT:** This import must remain at the top level of the application
 * to ensure strict type-checking for the `t()` function is activated globally across
 * the entire React component tree.
 */
import './i18n/types';

import type {
  ExportDialogOptions,
  ExportPreviewSnapshot,
  LayerName,
} from '@vellum/core';
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
  /** Retries the last file with allow_partial=true. Injected from the Tauri composition root. */
  loadFilePartial?: () => Promise<void>;
  /** Receives export configuration until Stories 6.2/6.3 connect IPC. */
  onExport?: (options: ExportDialogOptions) => void;
  /** Blocks export entry points while a future export operation is active. */
  isExporting?: boolean;
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
 * **Empty State (Story 2.1):** `<EmptyState />` se inyecta como overlay sobre el map
 * cuando `loadingState === 'idle'` y `cityData === null`. `MapLibreRoot` permanece siempre
 * montado para preservar el contexto WebGL al cargar un mapa.
 */
export function App({
  loadFile,
  openFileDialog = noop,
  loadFilePartial = noop,
  onExport = () => {},
  isExporting = false,
}: AppProps) {
  const [i18nReady, setI18nReady] = useState(false);
  const [isCleanMode, setIsCleanMode] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportPreview, setExportPreview] =
    useState<ExportPreviewSnapshot | null>(null);
  const fitToScreenRef = useRef<(() => void) | null>(null);
  const zoomInRef = useRef<(() => void) | null>(null);
  const zoomOutRef = useRef<(() => void) | null>(null);
  const toggleNavigationModeRef = useRef<(() => void) | null>(null);
  const rotateByRef = useRef<((delta: number) => void) | null>(null);
  const resetBearingRef = useRef<(() => void) | null>(null);
  const previewCaptureRef = useRef<
    (() => Promise<ExportPreviewSnapshot | null>) | null
  >(null);
  const isExportingRef = useRef(isExporting);
  isExportingRef.current = isExporting;
  const previewCapturePendingRef = useRef(false);
  const subscribeServiceIconLegendRef = useRef<
    ((callback: (state: ServiceIconLegendState) => void) => () => void) | null
  >(null);
  const iconLegendToggleRef = useRef<(() => void) | null>(null);
  const syncActiveLanguage = useVellumStore((s) => s.syncActiveLanguage);
  const cityData = useVellumStore((s) => s.cityData);
  const activeLayers = useVellumStore((s) => s.activeLayers);
  const activeTheme = useVellumStore((s) => s.activeTheme);
  const loadingState = useVellumStore((s) => s.loadingState);
  const loadingError = useVellumStore((s) => s.loadingError);
  const dlcWarnings = useVellumStore((s) => s.dlcWarnings);
  const hasPartialData = useVellumStore((s) => s.hasPartialData);
  const setLoadingState = useVellumStore((s) => s.setLoadingState);
  const setDlcWarnings = useVellumStore((s) => s.setDlcWarnings);
  const setHasPartialData = useVellumStore((s) => s.setHasPartialData);
  const toggleLayer = useVellumStore((s) => s.toggleLayer);
  const expandedPanelLayer = useVellumStore((s) => s.expandedPanelLayer);
  const setExpandedPanelLayer = useVellumStore((s) => s.setExpandedPanelLayer);
  const themeWarnings = useVellumStore((s) => s.themeWarnings);
  const setThemeWarnings = useVellumStore((s) => s.setThemeWarnings);

  // Load all .vellumstyle themes once at startup (populates the store + returns full styles).
  const themes = useThemes();

  useEffect(() => {
    document.title =
      cityData && cityData.cityName.trim()
        ? `Vellum — ${cityData.cityName}`
        : 'Vellum';
  }, [cityData]);

  // Reset clean mode when a new map is loaded so the chrome is always visible on first render
  useEffect(() => {
    setIsExportDialogOpen(false);
    setExportPreview(null);
    if (cityData !== null) setIsCleanMode(false);
  }, [cityData]);

  useEffect(() => {
    if (loadingState !== 'loading') return;
    setIsExportDialogOpen(false);
    setExportPreview(null);
  }, [loadingState]);

  const handleFitToScreen = useCallback(
    () => fitToScreenRef.current?.(),
    [fitToScreenRef],
  );
  const handleZoomIn = useCallback(() => zoomInRef.current?.(), [zoomInRef]);
  const handleZoomOut = useCallback(() => zoomOutRef.current?.(), [zoomOutRef]);
  const handleHidePanel = useCallback(() => setIsCleanMode((v) => !v), []);
  const handleToggleNavigationMode = useCallback(
    () => toggleNavigationModeRef.current?.(),
    [toggleNavigationModeRef],
  );
  const handleToggleIconLegend = useCallback(
    () => iconLegendToggleRef.current?.(),
    [iconLegendToggleRef],
  );
  const handleRotateBy = useCallback(
    (delta: number) => rotateByRef.current?.(delta),
    [rotateByRef],
  );
  const handleResetBearing = useCallback(
    () => resetBearingRef.current?.(),
    [resetBearingRef],
  );
  const handleOpenExport = useCallback(async () => {
    if (
      cityData === null ||
      loadingState === 'loading' ||
      isExportingRef.current ||
      previewCapturePendingRef.current
    ) {
      return;
    }
    previewCapturePendingRef.current = true;
    try {
      const preview = await (previewCaptureRef.current?.() ??
        Promise.resolve(null));
      const currentState = useVellumStore.getState();
      if (
        currentState.cityData !== cityData ||
        currentState.loadingState === 'loading' ||
        isExportingRef.current
      ) {
        return;
      }
      setExportPreview(preview);
      setIsExportDialogOpen(true);
    } finally {
      previewCapturePendingRef.current = false;
    }
  }, [cityData, loadingState]);

  const handleOpenAdvancedOptions = useCallback(
    (layer: LayerName) => {
      setExpandedPanelLayer(expandedPanelLayer === layer ? null : layer);
    },
    [expandedPanelLayer, setExpandedPanelLayer],
  );

  useKeyboardShortcuts({
    onOpenFile: openFileDialog,
    // Layer shortcuts 1-7 only active when a map is loaded
    ...(cityData !== null ? { onToggleLayer: toggleLayer } : {}),
    onFitToScreen: handleFitToScreen,
    ...(cityData !== null ? { onZoomIn: handleZoomIn } : {}),
    ...(cityData !== null ? { onZoomOut: handleZoomOut } : {}),
    ...(cityData !== null && loadingState !== 'loading'
      ? { onHidePanel: handleHidePanel }
      : {}),
    ...(cityData !== null
      ? { onToggleNavigationMode: handleToggleNavigationMode }
      : {}),
    ...(cityData !== null
      ? { onToggleIconLegend: handleToggleIconLegend }
      : {}),
    ...(cityData !== null ? { onRotateBy: handleRotateBy } : {}),
    ...(cityData !== null ? { onResetBearing: handleResetBearing } : {}),
    ...(cityData !== null
      ? { onOpenAdvancedOptions: handleOpenAdvancedOptions }
      : {}),
    ...(cityData !== null && loadingState !== 'loading' && !isExporting
      ? { onOpenExport: handleOpenExport }
      : {}),
    enabled: loadingState !== 'loading' && !isExportDialogOpen,
  });

  useEffect(() => {
    initI18n().then((detectedLang) => {
      syncActiveLanguage(detectedLang);
      setI18nReady(true);
    });
  }, [syncActiveLanguage]);

  const handleDlcDismiss = useCallback(() => {
    setDlcWarnings([]);
    setHasPartialData(false);
  }, [setDlcWarnings, setHasPartialData]);

  // Stable reference — an inline arrow here would re-run ThemeWarningToast's auto-dismiss
  // effect (which depends on onDismiss) on every unrelated App re-render, never firing.
  const handleThemeWarningsDismiss = useCallback(() => {
    setThemeWarnings([]);
  }, [setThemeWarnings]);

  // Evitar flash en idioma incorrecto — no renderizar hasta que i18n esté listo
  if (!i18nReady) return null;

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
          <MapLibreRoot
            loadFile={loadFile}
            activeLayers={activeLayers}
            fitToScreenRef={fitToScreenRef}
            zoomInRef={zoomInRef}
            zoomOutRef={zoomOutRef}
            toggleNavigationModeRef={toggleNavigationModeRef}
            rotateByRef={rotateByRef}
            resetBearingRef={resetBearingRef}
            isCleanMode={isCleanMode}
            themes={themes}
            subscribeServiceIconLegendRef={subscribeServiceIconLegendRef}
            previewCaptureRef={previewCaptureRef}
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
        {themeWarnings.length > 0 && (
          <ThemeWarningToast
            warnings={themeWarnings}
            onDismiss={handleThemeWarningsDismiss}
          />
        )}
        {cityData !== null && loadingState !== 'loading' && (
          <div
            className={
              isCleanMode ? 'invisible pointer-events-none' : undefined
            }
          >
            <FloatingLayerPanel
              cityName={cityData.cityName}
              fileName={cityData.fileName}
              onOpenExport={handleOpenExport}
              exportDisabled={isExporting}
            />
            <IconLegend
              subscribeRef={subscribeServiceIconLegendRef}
              toggleRef={iconLegendToggleRef}
            />
          </div>
        )}
        {cityData !== null && (
          <ExportDialog
            open={isExportDialogOpen}
            cityName={cityData.cityName}
            fileName={cityData.fileName}
            generatedAt={cityData.generatedAt}
            defaultBackground={
              activeTheme === 'night' || activeTheme === 'transit'
                ? 'dark'
                : 'white'
            }
            preview={exportPreview}
            availability={{
              districts: cityData.districts.length > 0,
              parks: cityData.parkAreas.length > 0,
              roads: cityData.roadSegments.length > 0,
              transit: cityData.transitLines.length > 0,
              elevation: cityData.contourLines?.length > 0,
            }}
            counts={{
              roads: cityData.roadSegments.length,
              buildings: cityData.buildings.length,
              districts: cityData.districts.length,
              parks: cityData.parkAreas.length,
              transitLines: cityData.transitLines.length,
              transitStops: cityData.transitLines.reduce(
                (total, line) => total + line.stops.length,
                0,
              ),
            }}
            visibleLayerNames={Object.entries(activeLayers)
              .filter(([, visible]) => visible)
              .map(([layer]) => layer as LayerName)}
            transitLabels={cityData.transitLines.map((line) => ({
              id: line.id,
              mode: line.mode,
              name: line.name,
            }))}
            isExporting={isExporting}
            onOpenChange={setIsExportDialogOpen}
            onExport={onExport}
          />
        )}
      </div>
    </Suspense>
  );
}
