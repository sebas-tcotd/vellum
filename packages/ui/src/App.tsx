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
import { UpdateToast } from './components/overlays/UpdateToast';
import { FloatingLayerPanel } from './components/panels/FloatingLayerPanel';
import { ExportDialog } from './components/panels/ExportDialog';
import { PreferencesPanel } from './components/panels/PreferencesPanel';
import { IconLegend } from './components/panels/IconLegend';
import { ExportStatusOverlay } from './components/overlays/ExportStatusOverlay';
import { initI18n } from './i18n/i18n-setup';
import { loadPersistedPreferences } from './store/preferences-store';
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';
import { useTauriEvent } from './hooks/use-tauri-event';
import { useThemes } from './hooks/use-themes';
import { useExportWorkflow } from './hooks/use-export-workflow';
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
  ExportPreviewSnapshot,
  ExportRequest,
  ExportSnapshot,
  LayerName,
  BuildingServiceCategory,
  RasterExportV2,
  SvgExportPort,
  SvgExportRequest,
  SvgExportSnapshot,
  UpdatePayload,
  MenuAction,
  TransitMode,
} from '@vellum/core';
import { IPC_COMMANDS, IPC_EVENTS, LAYER_NAMES } from '@vellum/core';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useVellumStore } from './store/vellum-store';

const noop = async (): Promise<void> => {};

function isLayerName(value: string): value is LayerName {
  return LAYER_NAMES.includes(value as LayerName);
}

function isTransitMode(value: string): value is TransitMode {
  return (
    value === 'Bus' ||
    value === 'Tram' ||
    value === 'Train' ||
    value === 'Metro' ||
    value === 'CableCar' ||
    value === 'Monorail' ||
    value === 'Ferry' ||
    value === 'Blimp' ||
    value === 'Trolleybus'
  );
}

function isBuildingCategory(value: string): value is BuildingServiceCategory {
  return (
    value === 'residential' ||
    value === 'industry' ||
    value === 'commercial' ||
    value === 'office'
  );
}

/**
 * Ref a composition root reads to request cancellation of any active export —
 * e.g. before allowing the window to close. `current` is non-null only while
 * an export is active, and its call resolves once that export's own
 * try/finally chain has settled (success, cancellation, or error).
 */
export type ExportCancelHandlerRef = {
  current: (() => Promise<void>) | null;
};

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
  /** Optional composition-root bridge for dev-only snapshot consumers. */
  exportSnapshotCaptureRef?: React.RefObject<
    ((request: ExportRequest) => ExportSnapshot | null) | null
  >;
  /** Executes the injected vector exporter; SVG stays unavailable without it. */
  svgExporter?: SvgExportPort;
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
  exportSnapshotCaptureRef,
  svgExporter,
}: AppProps) {
  const [i18nReady, setI18nReady] = useState(false);
  const [isCleanMode, setIsCleanMode] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const fitToScreenRef = useRef<(() => void) | null>(null);
  const zoomInRef = useRef<(() => void) | null>(null);
  const zoomOutRef = useRef<(() => void) | null>(null);
  const toggleNavigationModeRef = useRef<(() => void) | null>(null);
  const rotateByRef = useRef<((delta: number) => void) | null>(null);
  const resetBearingRef = useRef<(() => void) | null>(null);
  const previewCaptureRef = useRef<
    (() => Promise<ExportPreviewSnapshot | null>) | null
  >(null);
  const ownedSnapshotCaptureRef = useRef<
    ((request: ExportRequest) => ExportSnapshot | null) | null
  >(null);
  const snapshotCaptureRef =
    exportSnapshotCaptureRef ?? ownedSnapshotCaptureRef;
  const svgSnapshotCaptureRef = useRef<
    ((request: SvgExportRequest) => SvgExportSnapshot | null) | null
  >(null);
  const subscribeServiceIconLegendRef = useRef<
    ((callback: (state: ServiceIconLegendState) => void) => () => void) | null
  >(null);
  const iconLegendToggleRef = useRef<(() => void) | null>(null);
  const syncActiveLanguage = useVellumStore((s) => s.syncActiveLanguage);
  const hydratePreferences = useVellumStore((s) => s.hydratePreferences);
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
  const setActiveTheme = useVellumStore((s) => s.setActiveTheme);
  const availableThemes = useVellumStore((s) => s.availableThemes);
  const layerOptions = useVellumStore((s) => s.layerOptions);
  const transitDimmingEnabled = useVellumStore((s) => s.transitDimmingEnabled);
  const setTransitDimmingEnabled = useVellumStore(
    (s) => s.setTransitDimmingEnabled,
  );
  const toggleTransitMode = useVellumStore((s) => s.toggleTransitMode);
  const toggleBuildingCategory = useVellumStore(
    (s) => s.toggleBuildingCategory,
  );
  const setBuildingColorByCategory = useVellumStore(
    (s) => s.setBuildingColorByCategory,
  );
  const setDistrictsShowNameOnMap = useVellumStore(
    (s) => s.setDistrictsShowNameOnMap,
  );
  const setDistrictsShowParkAreas = useVellumStore(
    (s) => s.setDistrictsShowParkAreas,
  );
  const setTerrainShowContourLines = useVellumStore(
    (s) => s.setTerrainShowContourLines,
  );
  const setTerrainShowColorRelief = useVellumStore(
    (s) => s.setTerrainShowColorRelief,
  );
  const setTerrainShowHillshade = useVellumStore(
    (s) => s.setTerrainShowHillshade,
  );
  const setBasemapShowGrid = useVellumStore((s) => s.setBasemapShowGrid);
  const expandedPanelLayer = useVellumStore((s) => s.expandedPanelLayer);
  const setExpandedPanelLayer = useVellumStore((s) => s.setExpandedPanelLayer);
  const themeWarnings = useVellumStore((s) => s.themeWarnings);
  const setThemeWarnings = useVellumStore((s) => s.setThemeWarnings);
  const updateInfo = useVellumStore((s) => s.updateInfo);
  const setUpdateInfo = useVellumStore((s) => s.setUpdateInfo);

  // Load all .vellumstyle themes once at startup (populates the store + returns full styles).
  const themes = useThemes();

  const {
    isExporting,
    isExportDialogOpen,
    setIsExportDialogOpen,
    exportPreview,
    exportPhase,
    exportProgress,
    exportResult,
    exportCancelled,
    exportError,
    exportWarnings,
    handleCancelExport,
    handleOpenExport,
    handleExport,
  } = useExportWorkflow({
    cityData,
    loadingState,
    rasterExporter,
    svgExporter,
    exportCancelHandlerRef,
    previewCaptureRef,
    snapshotCaptureRef,
    svgSnapshotCaptureRef,
    isExportingProp,
  });

  useEffect(() => {
    document.title =
      cityData && cityData.cityName.trim()
        ? `Vellum — ${cityData.cityName}`
        : 'Vellum';
  }, [cityData]);

  // Reset clean mode when a new map is loaded so the chrome is always visible on first render
  useEffect(() => {
    if (cityData !== null) setIsCleanMode(false);
  }, [cityData]);

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
  const handleOpenAdvancedOptions = useCallback(
    (layer: LayerName) => {
      setExpandedPanelLayer(expandedPanelLayer === layer ? null : layer);
    },
    [expandedPanelLayer, setExpandedPanelLayer],
  );

  const handleMenuAction = useCallback(
    (action: MenuAction) => {
      if (action === 'menu.open-file') {
        void openFileDialog();
        return;
      }
      if (action === 'menu.open-export') {
        if (cityData !== null && loadingState !== 'loading' && !isExporting) {
          void handleOpenExport();
        }
        return;
      }
      if (action === 'menu.fit-to-screen') {
        if (cityData !== null) handleFitToScreen();
        return;
      }
      if (action === 'menu.zoom-in') {
        if (cityData !== null) handleZoomIn();
        return;
      }
      if (action === 'menu.zoom-out') {
        if (cityData !== null) handleZoomOut();
        return;
      }
      if (action === 'menu.clean-mode') {
        if (cityData !== null && loadingState !== 'loading') handleHidePanel();
        return;
      }
      if (action === 'menu.navigation-mode') {
        if (cityData !== null) handleToggleNavigationMode();
        return;
      }
      if (action === 'menu.icon-legend') {
        if (cityData !== null) handleToggleIconLegend();
        return;
      }
      if (action === 'menu.rotate-left') {
        if (cityData !== null) handleRotateBy(-15);
        return;
      }
      if (action === 'menu.rotate-right') {
        if (cityData !== null) handleRotateBy(15);
        return;
      }
      if (action === 'menu.reset-bearing') {
        if (cityData !== null) handleResetBearing();
        return;
      }
      if (action === 'menu.toggle-transit-dimming') {
        setTransitDimmingEnabled(!transitDimmingEnabled);
        return;
      }

      const layerPrefix = 'menu.toggle-layer.';
      if (action.startsWith(layerPrefix)) {
        const layer = action.slice(layerPrefix.length);
        if (cityData !== null && isLayerName(layer)) toggleLayer(layer);
        return;
      }

      const advancedPrefix = 'menu.open-advanced.';
      if (action.startsWith(advancedPrefix)) {
        const layer = action.slice(advancedPrefix.length);
        if (cityData !== null && isLayerName(layer)) {
          handleOpenAdvancedOptions(layer);
        }
        return;
      }

      const optionPrefix = 'menu.toggle-advanced.';
      if (action.startsWith(optionPrefix)) {
        if (cityData === null) return;
        const [, , layer, option] = action.split('.');
        if (layer === 'terrain') {
          if (option === 'contour-lines') {
            setTerrainShowContourLines(!layerOptions.terrain.showContourLines);
          } else if (option === 'color-relief') {
            setTerrainShowColorRelief(!layerOptions.terrain.showColorRelief);
          } else if (option === 'hillshade') {
            setTerrainShowHillshade(!layerOptions.terrain.showHillshade);
          }
        } else if (layer === 'basemap' && option === 'grid') {
          setBasemapShowGrid(!layerOptions.basemap.showGrid);
        } else if (layer === 'transit' && isTransitMode(option)) {
          toggleTransitMode(option);
        } else if (layer === 'buildings') {
          if (option === 'color-by-category') {
            setBuildingColorByCategory(!layerOptions.buildings.colorByCategory);
          } else if (isBuildingCategory(option)) {
            toggleBuildingCategory(option);
          }
        } else if (layer === 'districts') {
          if (option === 'show-names') {
            setDistrictsShowNameOnMap(!layerOptions.districts.showNameOnMap);
          } else if (option === 'show-park-areas') {
            setDistrictsShowParkAreas(!layerOptions.districts.showParkAreas);
          }
        }
        return;
      }

      const themePrefix = 'menu.theme.';
      if (action.startsWith(themePrefix)) {
        const themeId = action.slice(themePrefix.length);
        if (availableThemes.some((theme) => theme.id === themeId)) {
          setActiveTheme(themeId);
        }
      }
    },
    [
      availableThemes,
      cityData,
      handleFitToScreen,
      handleHidePanel,
      handleOpenAdvancedOptions,
      handleOpenExport,
      handleResetBearing,
      handleRotateBy,
      handleToggleIconLegend,
      handleToggleNavigationMode,
      handleZoomIn,
      handleZoomOut,
      isExporting,
      layerOptions,
      loadingState,
      openFileDialog,
      setActiveTheme,
      setBasemapShowGrid,
      setBuildingColorByCategory,
      setDistrictsShowNameOnMap,
      setDistrictsShowParkAreas,
      setTerrainShowColorRelief,
      setTerrainShowContourLines,
      setTerrainShowHillshade,
      setTransitDimmingEnabled,
      transitDimmingEnabled,
      toggleBuildingCategory,
      toggleLayer,
      toggleTransitMode,
    ],
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

  useTauriEvent(IPC_EVENTS.OPEN_PREFERENCES, () => setIsPreferencesOpen(true));
  useTauriEvent(IPC_EVENTS.MENU_ACTION, handleMenuAction);
  const [updateListenerSettled, setUpdateListenerSettled] = useState(false);
  useTauriEvent(
    IPC_EVENTS.UPDATE_AVAILABLE,
    (payload: UpdatePayload) => setUpdateInfo(payload),
    { onSettled: () => setUpdateListenerSettled(true) },
  );

  // Only check for a notification that arrived before the listener attached
  // once the subscription attempt above has settled (success or failure) —
  // checking earlier would race the listener and could still lose an event
  // that fires in between (backend always writes the pending slot before
  // emitting, so this ordering is race-free regardless of which side wins).
  useEffect(() => {
    if (!updateListenerSettled) return;
    void invoke<UpdatePayload | null>(IPC_COMMANDS.GET_PENDING_UPDATE)
      .then((payload) => {
        if (payload !== null) setUpdateInfo(payload);
      })
      .catch((error: unknown) => {
        console.warn('App: failed to load pending update notification', error);
      });
  }, [updateListenerSettled, setUpdateInfo]);

  useEffect(() => {
    Promise.all([initI18n(), loadPersistedPreferences()])
      .then(([detectedLang, prefs]) => {
        syncActiveLanguage(detectedLang);
        hydratePreferences(prefs);
        setI18nReady(true);
      })
      .catch((error: unknown) => {
        console.warn('App: failed to initialize preferences or i18n', error);
        syncActiveLanguage('en');
        hydratePreferences({});
        setI18nReady(true);
      });
  }, [syncActiveLanguage, hydratePreferences]);

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

  const showUpdateToast =
    updateInfo !== null && loadingState === 'idle' && !isExporting;

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
            snapshotCaptureRef={snapshotCaptureRef}
            svgSnapshotCaptureRef={svgSnapshotCaptureRef}
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
        {showUpdateToast && updateInfo !== null && (
          <UpdateToast
            version={updateInfo.version}
            onViewChangelog={() => {
              openUrl(updateInfo.url).catch((error: unknown) => {
                console.warn('App: failed to open release notes URL', error);
              });
            }}
            onDismiss={() => setUpdateInfo(null)}
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
            fullMapBounds={cityData.bounds}
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
        <PreferencesPanel
          open={isPreferencesOpen}
          onOpenChange={setIsPreferencesOpen}
        />
        <ExportStatusOverlay
          isExporting={isExporting}
          exportPhase={exportPhase}
          exportProgress={exportProgress}
          exportResult={exportResult}
          exportCancelled={exportCancelled}
          exportError={exportError}
          exportWarnings={exportWarnings}
          onCancelExport={handleCancelExport}
          onOpenExportFolder={onOpenExportFolder}
        />
      </div>
    </Suspense>
  );
}
