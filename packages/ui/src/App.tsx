// packages/ui/src/App.tsx
import type { ServiceIconLegendState } from '@vellum/renderer-webgl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppSurface } from './components/AppSurface';
import { initI18n } from './i18n/i18n-setup';
import { loadPersistedPreferences } from './store/preferences-store';
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';
import { useTauriEvent } from './hooks/use-tauri-event';
import { useThemes } from './hooks/use-themes';
import { useExportWorkflow } from './hooks/use-export-workflow';
import { useMenuAction } from './hooks/use-menu-action';
import { useDesktopCommands } from './shell/commands';
import { useShellSession, type ActiveModal } from './shell/shell-session';

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
  RasterExportV2,
  SvgExportPort,
  SvgExportRequest,
  SvgExportSnapshot,
  UpdatePayload,
} from '@vellum/core';
import { IPC_COMMANDS, IPC_EVENTS } from '@vellum/core';
import { invoke } from '@tauri-apps/api/core';
import { useVellumStore } from './store/vellum-store';

const noop = async (): Promise<void> => {};

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
  /** Build version displayed in the About surface. */
  version?: string | undefined;
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
  version,
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
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  // Ephemeral desktop-shell session (AD-10): sidebar context, Clean view,
  // modal exclusivity and focus restoration. Cartographic state stays in the
  // store; nothing here is duplicated from it.
  const shell = useShellSession(
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );
  const shellDispatch = shell.dispatch;
  const isCleanMode = shell.state.cleanView;
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
  const loadingState = useVellumStore((s) => s.loadingState);
  const loadingError = useVellumStore((s) => s.loadingError);
  const activeLayers = useVellumStore((s) => s.activeLayers);
  const setDlcWarnings = useVellumStore((s) => s.setDlcWarnings);
  const setHasPartialData = useVellumStore((s) => s.setHasPartialData);
  const toggleLayer = useVellumStore((s) => s.toggleLayer);
  const setThemeWarnings = useVellumStore((s) => s.setThemeWarnings);
  const setUpdateInfo = useVellumStore((s) => s.setUpdateInfo);

  // Load all .vellumstyle themes once at startup (populates the store + returns full styles).
  const themes = useThemes();

  const exportWorkflow = useExportWorkflow({
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
  const { isExporting, isExportDialogOpen, handleOpenExport } = exportWorkflow;

  useEffect(() => {
    document.title =
      cityData && cityData.cityName.trim()
        ? `Vellum — ${cityData.cityName}`
        : 'Vellum';
  }, [cityData]);

  // Preferences is an application-level command. Keep its Windows fallback
  // outside the map keymap so loading state and focused form controls cannot
  // suppress Ctrl+, before WebView2 has a chance to deliver the menu shortcut.
  useEffect(() => {
    const handlePreferencesShortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        (event.key === ',' || event.code === 'Comma')
      ) {
        event.preventDefault();
        event.stopPropagation();
        setIsPreferencesOpen(true);
      }
    };

    window.addEventListener('keydown', handlePreferencesShortcut, true);
    return () =>
      window.removeEventListener('keydown', handlePreferencesShortcut, true);
  }, []);

  // Reset clean view when a new map is loaded so the chrome is always visible on first render
  useEffect(() => {
    if (cityData !== null) shellDispatch({ type: 'cleanView/exit' });
  }, [cityData, shellDispatch]);

  const handleFitToScreen = useCallback(
    () => fitToScreenRef.current?.(),
    [fitToScreenRef],
  );
  const handleZoomIn = useCallback(() => zoomInRef.current?.(), [zoomInRef]);
  const handleZoomOut = useCallback(() => zoomOutRef.current?.(), [zoomOutRef]);
  const handleHidePanel = useCallback(
    (invoker?: string) =>
      shellDispatch({
        type: 'cleanView/toggle',
        ...(invoker !== undefined ? { invoker } : {}),
      }),
    [shellDispatch],
  );
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
  // Which layer's detail is open is shell session state, not cartographic
  // state — the choices it edits live in the store, the context does not.
  const handleToggleSidebar = useCallback(
    () => shellDispatch({ type: 'sidebar/toggleCollapsed' }),
    [shellDispatch],
  );

  // The platform convention is that a sidebar steps aside when its window gets
  // too narrow for it, and comes back when there is room again — but only if
  // the window was what closed it (see the reducer).
  useEffect(() => {
    const onResize = () =>
      shellDispatch({
        type: 'sidebar/viewportResized',
        width: window.innerWidth,
      });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [shellDispatch]);

  const handleOpenAdvancedOptions = useCallback(
    (layer: LayerName, invoker?: string) =>
      shellDispatch({
        type: 'sidebar/toggleDetail',
        layerId: layer,
        ...(invoker !== undefined ? { invoker } : {}),
      }),
    [shellDispatch],
  );

  // Keep the session's single modal slot in step with the dialogs that are
  // actually open (AD-7). Exclusivity is what lets Clean view refuse to start
  // under a blocking surface and lets Escape leave dialogs to their own focus
  // trap instead of racing them.
  const blockingModal: ActiveModal =
    loadingState === 'error' && loadingError?.type === 'PartialParse'
      ? 'partialParse'
      : isExportDialogOpen
        ? 'export'
        : isPreferencesOpen
          ? 'preferences'
          : isAboutOpen
            ? 'about'
            : null;

  useEffect(() => {
    if (blockingModal === null) {
      shellDispatch({ type: 'modal/close' });
      return;
    }
    shellDispatch({ type: 'modal/open', modal: blockingModal });
  }, [blockingModal, shellDispatch]);

  const availableThemes = useVellumStore((s) => s.availableThemes);
  const setActiveTheme = useVellumStore((s) => s.setActiveTheme);
  const transitDimmingEnabled = useVellumStore((s) => s.transitDimmingEnabled);
  const setTransitDimmingEnabled = useVellumStore(
    (s) => s.setTransitDimmingEnabled,
  );
  const availableThemeIds = useMemo(
    () => availableThemes.map((theme) => theme.id),
    [availableThemes],
  );

  // The one adapter every desktop surface goes through (AD-3). The native
  // menu, the keyboard shortcuts and the shell's own buttons all invoke these
  // commands, so an action cannot mean different things depending on where it
  // was triggered.
  const commands = useDesktopCommands({
    openFileDialog,
    openExport: handleOpenExport,
    fitToScreen: handleFitToScreen,
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    resetBearing: handleResetBearing,
    rotateBy: handleRotateBy,
    toggleIconLegend: handleToggleIconLegend,
    toggleNavigationMode: handleToggleNavigationMode,
    toggleLayer,
    setActiveTheme,
    setTransitDimmingEnabled,
    transitDimmingEnabled,
    availableThemeIds,
    toggleCleanView: handleHidePanel,
    toggleSidebar: handleToggleSidebar,
    toggleLayerDetail: handleOpenAdvancedOptions,
    hasMap: cityData !== null,
    isLoading: loadingState === 'loading',
    isExporting,
    hasBlockingModal: blockingModal !== null,
  });

  const handleMenuAction = useMenuAction({ commands });

  // Shortcuts are a keymap, not a second policy: each one invokes the same
  // command the menu does, and the command's own `canExecute` decides whether
  // anything happens. A shortcut is only omitted when its command is
  // unavailable, which is what kept the key inert before this migration too.
  const handleEscape = useCallback(
    () => shellDispatch({ type: 'escape' }),
    [shellDispatch],
  );

  useKeyboardShortcuts({
    onOpenFile: commands['document.open'].execute,
    onOpenPreferences: () => setIsPreferencesOpen(true),
    ...(commands['layer.toggle'].canExecute
      ? { onToggleLayer: commands['layer.toggle'].execute }
      : {}),
    onFitToScreen: commands['view.fitCity'].execute,
    ...(commands['view.zoomIn'].canExecute
      ? { onZoomIn: commands['view.zoomIn'].execute }
      : {}),
    ...(commands['view.zoomOut'].canExecute
      ? { onZoomOut: commands['view.zoomOut'].execute }
      : {}),
    ...(commands['view.cleanView'].canExecute
      ? { onHidePanel: commands['view.cleanView'].execute }
      : {}),
    ...(commands['view.mapBounds'].canExecute
      ? { onToggleNavigationMode: commands['view.mapBounds'].execute }
      : {}),
    ...(commands['view.mapSymbols'].canExecute
      ? { onToggleIconLegend: commands['view.mapSymbols'].execute }
      : {}),
    ...(commands['view.rotate'].canExecute
      ? { onRotateBy: commands['view.rotate'].execute }
      : {}),
    ...(commands['view.resetNorth'].canExecute
      ? { onResetBearing: commands['view.resetNorth'].execute }
      : {}),
    ...(commands['layer.detail'].canExecute
      ? { onOpenAdvancedOptions: commands['layer.detail'].execute }
      : {}),
    ...(commands['document.export'].canExecute
      ? { onOpenExport: commands['document.export'].execute }
      : {}),
    // Escape is only offered while no dialog owns focus — dialogs trap and
    // consume it themselves, so the ladder never has two listeners racing.
    ...(!isExportDialogOpen && !isPreferencesOpen && !isAboutOpen
      ? { onEscape: handleEscape }
      : {}),
    enabled: loadingState !== 'loading' && !isExportDialogOpen,
  });

  useTauriEvent(IPC_EVENTS.OPEN_PREFERENCES, () => setIsPreferencesOpen(true));
  useTauriEvent(IPC_EVENTS.OPEN_ABOUT, () => setIsAboutOpen(true));
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

  return (
    <AppSurface
      mapProps={{
        loadFile,
        activeLayers,
        fitToScreenRef,
        zoomInRef,
        zoomOutRef,
        toggleNavigationModeRef,
        rotateByRef,
        resetBearingRef,
        themes,
        subscribeServiceIconLegendRef,
        previewCaptureRef,
        snapshotCaptureRef,
        svgSnapshotCaptureRef,
      }}
      subscribeServiceIconLegendRef={subscribeServiceIconLegendRef}
      iconLegendToggleRef={iconLegendToggleRef}
      exportWorkflow={exportWorkflow}
      commands={commands}
      shell={shell}
      isCleanMode={isCleanMode}
      isPreferencesOpen={isPreferencesOpen}
      setIsPreferencesOpen={setIsPreferencesOpen}
      isAboutOpen={isAboutOpen}
      setIsAboutOpen={setIsAboutOpen}
      version={version}
      loadFilePartial={loadFilePartial}
      {...(onOpenExportFolder ? { onOpenExportFolder } : {})}
      onDlcDismiss={handleDlcDismiss}
      onThemeWarningsDismiss={handleThemeWarningsDismiss}
    />
  );
}
