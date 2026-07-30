// packages/ui/src/App.tsx
import type { ServiceIconLegendState } from '@vellum/renderer-webgl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  ExportProgress,
  ExportResult,
  ExportRequest,
  ExportSnapshot,
  LayerName,
  RasterExportV2,
  VellumError,
} from '@vellum/core';
import { useVellumStore } from './store/vellum-store';

const noop = async (): Promise<void> => {};

/** Bounded time an export may run before it is treated as timed out and aborted. */
const EXPORT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Ref a composition root reads to request cancellation of any active export —
 * e.g. before allowing the window to close. `current` is non-null only while
 * an export is active, and its call resolves once that export's own
 * try/finally chain has settled (success, cancellation, or error).
 */
export type ExportCancelHandlerRef = {
  current: (() => Promise<void>) | null;
};

/** Maps an export failure to the existing `errors.*` i18n keys — never `.reason`. */
function toExportError(err: unknown): VellumError {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as Record<string, unknown>;
    if (
      (e.type === 'ExportFailed' || e.type === 'IoError') &&
      typeof e.reason === 'string'
    ) {
      return err as VellumError;
    }
  }
  return {
    type: 'ExportFailed',
    reason: err instanceof Error ? err.message : String(err),
  };
}

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
  /** Executes the injected raster export coordinator. */
  rasterExporter?: RasterExportV2;
  /** Reveals a successful export directory through the desktop IPC adapter. */
  onOpenExportFolder?: (folderPath: string) => Promise<void>;
  /** Allows a composition root to prevent interactions during an external export. */
  isExporting?: boolean;
  /** Ref set (while an export is active) to a bounded, awaitable cancel request. */
  exportCancelHandlerRef?: ExportCancelHandlerRef;
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
  rasterExporter,
  onOpenExportFolder,
  isExporting: isExportingProp = false,
  exportCancelHandlerRef,
}: AppProps) {
  const { t } = useTranslation();
  const [i18nReady, setI18nReady] = useState(false);
  const [isCleanMode, setIsCleanMode] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportPreview, setExportPreview] =
    useState<ExportPreviewSnapshot | null>(null);
  const [exportPhase, setExportPhase] = useState<
    'idle' | 'exporting' | 'cancelling'
  >('idle');
  const isExporting = isExportingProp || exportPhase !== 'idle';
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(
    null,
  );
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportCancelled, setExportCancelled] = useState(false);
  const [exportError, setExportError] = useState<VellumError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const exportOperationRef = useRef<{
    snapshotId: string;
    sessionId?: string;
  } | null>(null);
  const timedOutRef = useRef(false);
  const pendingExportRef = useRef<Promise<void> | null>(null);
  const fitToScreenRef = useRef<(() => void) | null>(null);
  const zoomInRef = useRef<(() => void) | null>(null);
  const zoomOutRef = useRef<(() => void) | null>(null);
  const toggleNavigationModeRef = useRef<(() => void) | null>(null);
  const rotateByRef = useRef<((delta: number) => void) | null>(null);
  const resetBearingRef = useRef<(() => void) | null>(null);
  const previewCaptureRef = useRef<
    (() => Promise<ExportPreviewSnapshot | null>) | null
  >(null);
  const snapshotCaptureRef = useRef<
    ((request: ExportRequest) => ExportSnapshot | null) | null
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

  /**
   * Cancels any active export before this render commits — never after,
   * since the caller (an effect reacting to `cityData`) already means the
   * global CityData/DEM is about to be replaced (AD-15: one export at a time
   * while that protocol is shared).
   */
  const handleCancelExport = useCallback((): void => {
    if (!abortControllerRef.current) return;
    setExportPhase('cancelling');
    abortControllerRef.current.abort();
  }, []);

  // Reset clean mode when a new map is loaded so the chrome is always visible on first render
  useEffect(() => {
    setIsExportDialogOpen(false);
    setExportPreview(null);
    if (cityData !== null) setIsCleanMode(false);
    handleCancelExport();
  }, [cityData, handleCancelExport]);

  // Lets a composition root (e.g. main.tsx's window close handler) request a
  // bounded cancellation of whichever export is currently active.
  useEffect(() => {
    if (!exportCancelHandlerRef) return undefined;
    exportCancelHandlerRef.current =
      exportPhase === 'idle'
        ? null
        : async () => {
            handleCancelExport();
            await (pendingExportRef.current ?? Promise.resolve());
          };
    return () => {
      exportCancelHandlerRef.current = null;
    };
  }, [exportCancelHandlerRef, exportPhase, handleCancelExport]);

  // Escape cancels an active export once the configuration dialog itself has
  // already closed (Radix's own onOpenChange handles Escape while it's open).
  useEffect(() => {
    if (exportPhase === 'idle') return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      handleCancelExport();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exportPhase, handleCancelExport]);

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

  const handleExport = useCallback(
    async (options: ExportDialogOptions): Promise<void> => {
      if (isExportingRef.current || !rasterExporter) return;
      if (options.format === 'svg') {
        setExportError({
          type: 'ExportFailed',
          reason: 'SVG export is not implemented',
        });
        return;
      }
      setExportError(null);
      setExportCancelled(false);
      setExportResult(null);
      setExportProgress(null);
      timedOutRef.current = false;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setExportPhase('exporting');
      let resolvePending: (() => void) | undefined;
      pendingExportRef.current = new Promise((resolve) => {
        resolvePending = resolve;
      });
      const timeoutId = window.setTimeout(() => {
        timedOutRef.current = true;
        controller.abort();
      }, EXPORT_TIMEOUT_MS);
      try {
        const request: ExportRequest = {
          format: options.format,
          area: options.area,
          background: options.background,
          fileName: options.fileName,
          presentation: options.presentation,
        };
        const snapshot = snapshotCaptureRef.current?.(request);
        if (!snapshot) throw new Error('Export snapshot is unavailable');
        exportOperationRef.current = { snapshotId: snapshot.snapshotId };
        const onProgress = (progress: ExportProgress): void => {
          if (exportOperationRef.current?.snapshotId !== progress.snapshotId) {
            return;
          }
          exportOperationRef.current = {
            snapshotId: progress.snapshotId,
            ...(progress.sessionId !== undefined
              ? { sessionId: progress.sessionId }
              : {}),
          };
          setExportProgress(progress);
        };
        const receipt = await rasterExporter.export(
          snapshot,
          controller.signal,
          onProgress,
        );
        if (exportOperationRef.current?.snapshotId !== snapshot.snapshotId) {
          return;
        }
        setExportResult(receipt);
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          if (timedOutRef.current) {
            setExportError({
              type: 'ExportFailed',
              reason: 'export timed out',
            });
          } else {
            setExportCancelled(true);
          }
        } else {
          console.error('[App] PNG export failed:', error);
          setExportError(toExportError(error));
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        exportOperationRef.current = null;
        setExportProgress(null);
        setExportPhase('idle');
        resolvePending?.();
      }
    },
    [rasterExporter],
  );

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
            isExporting && 'pointer-events-none',
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
            snapshotCaptureRef={snapshotCaptureRef}
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
              isCleanMode || isExporting
                ? 'invisible pointer-events-none'
                : undefined
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
            onExport={handleExport}
          />
        )}
        {isExporting && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-busy="true"
            {...(exportPhase !== 'cancelling' &&
            exportProgress?.percent !== undefined
              ? { 'aria-valuenow': exportProgress.percent }
              : {})}
            aria-valuetext={
              exportPhase === 'cancelling'
                ? t('export.cancelling')
                : exportProgress?.percent !== undefined
                  ? t('export.progressPercent', {
                      percent: exportProgress.percent,
                    })
                  : t('export.indeterminate')
            }
            className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded bg-background px-4 py-2 text-xs shadow"
          >
            <span>
              {exportPhase === 'cancelling'
                ? t('export.cancelling')
                : exportProgress?.percent !== undefined
                  ? t('export.progressPercent', {
                      percent: exportProgress.percent,
                    })
                  : t('export.exportButton')}
            </span>
            <button
              type="button"
              onClick={handleCancelExport}
              className="pointer-events-auto underline"
            >
              {t('export.cancelButton')}
            </button>
          </div>
        )}
        {exportResult && (
          <div
            role="status"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-background px-4 py-2 text-xs shadow"
          >
            {t('export.successToast', {
              fileName: exportResult.filePath.split(/[/\\]/).at(-1),
            })}
            <button
              type="button"
              className="ml-3 underline"
              onClick={() => void onOpenExportFolder?.(exportResult.folderPath)}
            >
              {t('export.openFolder')}
            </button>
          </div>
        )}
        {exportCancelled && (
          <div
            role="status"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-background px-4 py-2 text-xs shadow"
          >
            {t('export.cancelledToast')}
          </div>
        )}
        {exportError && (
          <div
            role="alert"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-background px-4 py-2 text-xs shadow"
          >
            {t(
              exportError.type === 'IoError'
                ? 'errors.IoError'
                : 'errors.ExportFailed',
            )}
          </div>
        )}
      </div>
    </Suspense>
  );
}
