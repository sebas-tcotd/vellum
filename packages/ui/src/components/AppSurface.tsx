import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  IPC_COMMANDS,
  geographicSchematicLayout,
  octilinearSchematicLayout,
  orthoradialSchematicLayout,
  type SchematicLayoutStrategy,
  type ServiceIconLegendState,
  type TransitMode,
} from '@vellum/core';
import type { MapLibreRootProps } from './canvas/MapLibreRoot';
import { MapViewport } from './viewport/MapViewport';
import { EmptyState } from './empty-state/EmptyState';
import { ProgressBar } from './overlays/ProgressBar';
import { ErrorToast } from './overlays/ErrorToast';
import { PartialParseDialog } from './overlays/PartialParseDialog';
import { DlcWarningToast } from './overlays/DlcWarningToast';
import { ThemeWarningToast } from './overlays/ThemeWarningToast';
import { UpdateToast } from './overlays/UpdateToast';
import { AboutDialog } from './overlays/AboutDialog';
import { ExportStatusOverlay } from './overlays/ExportStatusOverlay';
import { SchematicLayoutStatusOverlay } from './overlays/SchematicLayoutStatusOverlay';
import { ExportDialog } from './panels/ExportDialog';
import { PreferencesPanel } from './panels/PreferencesPanel';
import { DesktopShell } from './shell';
import { MapAppearanceSidebar } from './sidebar/MapAppearanceSidebar';
import type { CommandRegistry } from '../shell/commands';
import {
  publishedSchematicLayouts,
  type SchematicLayoutId,
  type ShellSession,
} from '../shell/shell-session';
import type { useExportWorkflow } from '../hooks/use-export-workflow';
import {
  useSchematicNetwork,
  type SchematicLayoutClientPort,
} from '../hooks/use-schematic-network';
// Relativo a propósito: el alias `@/` del composition root apunta a
// `packages/ui/src`, así que un `@/store/...` compilado a dist carga un SEGUNDO
// módulo del store — el resto del paquete quedaría suscrito a otra instancia.
import { useVellumStore } from '../store/vellum-store';
import { usePlatformServices } from '../context/PlatformServicesContext';

/**
 * The one place a layout id becomes a strategy.
 *
 * @remarks
 * Module-level and frozen on purpose: `useSchematicNetwork` caches per
 * strategy *by identity*, so a map rebuilt on every render would hand it a
 * fresh function each time and evict the layout it just computed.
 */
const SCHEMATIC_LAYOUT_STRATEGIES: Readonly<
  Record<SchematicLayoutId, SchematicLayoutStrategy>
> = Object.freeze({
  geographic: geographicSchematicLayout,
  octilinear: octilinearSchematicLayout,
  orthoradial: orthoradialSchematicLayout,
});

interface AppSurfaceProps {
  mapProps: MapLibreRootProps;
  subscribeServiceIconLegendRef: RefObject<
    ((callback: (state: ServiceIconLegendState) => void) => () => void) | null
  >;
  iconLegendToggleRef: RefObject<(() => void) | null>;
  exportWorkflow: ReturnType<typeof useExportWorkflow>;
  commands: CommandRegistry;
  shell: ShellSession;
  isCleanMode: boolean;
  isPreferencesOpen: boolean;
  setIsPreferencesOpen: Dispatch<SetStateAction<boolean>>;
  isAboutOpen: boolean;
  setIsAboutOpen: Dispatch<SetStateAction<boolean>>;
  version?: string | undefined;
  loadFilePartial: () => Promise<void>;
  onOpenExportFolder?: (folderPath: string) => Promise<void>;
  onDlcDismiss: () => void;
  onThemeWarningsDismiss: () => void;
  schematicLayoutClient?: SchematicLayoutClientPort | undefined;
}

/** Renders the desktop map surface, chrome, dialogs, and transient overlays. */
export function AppSurface({
  mapProps,
  subscribeServiceIconLegendRef,
  iconLegendToggleRef,
  exportWorkflow,
  commands,
  shell,
  isCleanMode,
  isPreferencesOpen,
  setIsPreferencesOpen,
  isAboutOpen,
  setIsAboutOpen,
  version,
  loadFilePartial,
  onOpenExportFolder,
  onDlcDismiss,
  onThemeWarningsDismiss,
  schematicLayoutClient,
}: AppSurfaceProps) {
  const { invoke, openExternalUrl } = usePlatformServices();
  const cityData = useVellumStore((state) => state.cityData);
  const activeTheme = useVellumStore((state) => state.activeTheme);
  const loadingState = useVellumStore((state) => state.loadingState);
  const loadingError = useVellumStore((state) => state.loadingError);
  const dlcWarnings = useVellumStore((state) => state.dlcWarnings);
  const hasPartialData = useVellumStore((state) => state.hasPartialData);
  const setLoadingState = useVellumStore((state) => state.setLoadingState);
  const themeWarnings = useVellumStore((state) => state.themeWarnings);
  const updateInfo = useVellumStore((state) => state.updateInfo);
  const setUpdateInfo = useVellumStore((state) => state.setUpdateInfo);
  const autoUpdateEnabled = useVellumStore((state) => state.autoUpdateEnabled);

  const showEmptyState = cityData === null && loadingState !== 'loading';
  const isSchematic = shell.state.viewMode === 'schematic';
  const shellDispatch = shell.dispatch;

  // The one model the schematic surface and its sidebar both read, derived at
  // their common ancestor so a stroke and its legend row cannot disagree.
  const schematicLayoutId = shell.state.schematic.layoutId;
  const schematicLayoutIds = publishedSchematicLayouts(
    cityData?.transitLines.length ?? 0,
  );
  const orthoradialEligible = schematicLayoutIds.includes('orthoradial');
  useEffect(() => {
    shellDispatch({ type: 'schematic/normalizeLayout', orthoradialEligible });
  }, [orthoradialEligible, shellDispatch]);
  const schematicModel = useSchematicNetwork({
    cityData,
    hiddenModes: shell.state.schematic.hiddenModes,
    // The record is exhaustive over `SchematicLayoutId`, but the id arrives from
    // session state that a future migration could hand us something else; the
    // geographic strategy is the honest fallback because it invents nothing.
    strategy:
      SCHEMATIC_LAYOUT_STRATEGIES[schematicLayoutId] ??
      geographicSchematicLayout,
    enabled: isSchematic,
    client: schematicLayoutClient,
    layoutId: schematicLayoutId,
    relayoutLineIds: shell.state.schematic.relayoutLineIds,
  });
  const toggleSchematicMode = useCallback(
    (mode: TransitMode) =>
      shellDispatch({ type: 'schematic/toggleMode', mode }),
    [shellDispatch],
  );
  const showAllSchematicModes = useCallback(
    () => shellDispatch({ type: 'schematic/showAllModes' }),
    [shellDispatch],
  );
  // Choosing a geometry is a question about the diagram only: it dispatches to
  // the ephemeral session and never to `useVellumStore`, so no layer, theme or
  // camera value the geographic map is subscribed to is written.
  const setSchematicLayout = useCallback(
    (layoutId: SchematicLayoutId) =>
      shellDispatch({ type: 'schematic/setLayout', layoutId }),
    [shellDispatch],
  );
  // Re-routing for a subset is the one schematic operation that is *not* a
  // projection, so it is only ever done because the user asked for it.
  const relayoutSchematic = useCallback(
    (lineIds: readonly string[] | null) =>
      shellDispatch({ type: 'schematic/relayout', lineIds }),
    [shellDispatch],
  );

  // How much of the map the sidebar covers, measured from the rendered element
  // so platform insets are included without this having to know about them.
  const [sidebarWidth, setSidebarWidth] = useState(0);
  // The geographic padding is renderer state MapLibre is subscribed to. While
  // the schematic owns the screen it must keep the value the map was last
  // framed with: widening the schematic sidebar is not a camera decision, and
  // pushing it through would reframe a map nobody is looking at.
  // Pointing at a legend row is a question about the diagram, not a change to
  // it: nothing here is persisted, and it resets when the pointer leaves.
  const [hoveredSchematicLineId, setHoveredSchematicLineId] = useState<
    string | null
  >(null);
  const geographicWidthRef = useRef(0);
  if (!isSchematic) geographicWidthRef.current = sidebarWidth;
  const mapInset = {
    left: cityData === null ? 0 : geographicWidthRef.current,
  };
  const schematicInset = { left: cityData === null ? 0 : sidebarWidth };
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
    updateInfo !== null &&
    loadingState === 'idle' &&
    !exportWorkflow.isExporting;

  return (
    <Suspense fallback={null}>
      <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
        <DesktopShell>
          <div className="desktop-shell__body">
            {cityData !== null && (
              <MapAppearanceSidebar
                cityName={cityData.cityName}
                source={cityData.source}
                fileName={cityData.fileName}
                commands={commands}
                shell={shell}
                onOccupiedWidthChange={setSidebarWidth}
                schematicModel={schematicModel}
                schematicLayoutId={schematicLayoutId}
                schematicLayoutIds={schematicLayoutIds}
                onSetSchematicLayout={setSchematicLayout}
                onRelayoutSchematic={relayoutSchematic}
                onToggleSchematicMode={toggleSchematicMode}
                onShowAllSchematicModes={showAllSchematicModes}
                onHoverSchematicLine={setHoveredSchematicLineId}
              />
            )}
            <MapViewport
              mapProps={mapProps}
              commands={commands}
              isCleanView={isCleanMode}
              viewMode={shell.state.viewMode}
              mapInset={mapInset}
              schematicInset={schematicInset}
              schematicModel={schematicModel}
              hoveredSchematicLineId={hoveredSchematicLineId}
              onShowAllSchematicModes={showAllSchematicModes}
              subscribeServiceIconLegendRef={subscribeServiceIconLegendRef}
              iconLegendToggleRef={iconLegendToggleRef}
            />
          </div>
        </DesktopShell>
        {showEmptyState && <EmptyState />}
        {loadingState === 'loading' && <ProgressBar />}
        {isSchematic && (
          <SchematicLayoutStatusOverlay
            progress={schematicModel.layoutProgress}
            failed={schematicModel.layoutError}
            diagnostic={schematicModel.layoutDiagnostic}
            onCancel={schematicModel.cancelLayout}
          />
        )}
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
            onDismiss={onDlcDismiss}
          />
        )}
        {themeWarnings.length > 0 && (
          <ThemeWarningToast
            warnings={themeWarnings}
            onDismiss={onThemeWarningsDismiss}
          />
        )}
        {showUpdateToast && updateInfo !== null && (
          <UpdateToast
            version={updateInfo.version}
            onViewChangelog={() => {
              openExternalUrl(updateInfo.url).catch((error: unknown) => {
                console.warn('App: failed to open release notes URL', error);
              });
            }}
            // The preference gates the startup check itself in the Rust
            // shell; here it additionally decides whether the toast offers to
            // install. Toggling it takes effect on the toast already on
            // screen, but the connection decision was made at launch.
            {...(autoUpdateEnabled
              ? {
                  // Best-effort, igual que como `App` trata el fallo de
                  // UPDATE_MENU_LANGUAGE: si el shell rechaza (updater no
                  // disponible, permisos), se avisa y la app sigue. Sin el
                  // `.catch` quedaba un rechazo sin manejar.
                  onInstall: () =>
                    invoke<void>(IPC_COMMANDS.INSTALL_UPDATE).catch(
                      (error: unknown) => {
                        console.warn(
                          'AppSurface: failed to install pending update',
                          error,
                        );
                      },
                    ),
                }
              : {})}
            onDismiss={() => setUpdateInfo(null)}
          />
        )}
        {cityData !== null && (
          <ExportDialog
            open={exportWorkflow.isExportDialogOpen}
            cityData={cityData}
            defaultBackground={
              activeTheme === 'night' || activeTheme === 'transit'
                ? 'dark'
                : 'white'
            }
            preview={exportWorkflow.exportPreview}
            isExporting={exportWorkflow.isExporting}
            isPreviewLoading={exportWorkflow.isPreviewCapturing}
            onOpenChange={exportWorkflow.setIsExportDialogOpen}
            onPreviewOptionsChange={exportWorkflow.handleRecapturePreview}
            onExport={exportWorkflow.handleExport}
          />
        )}
        <PreferencesPanel
          open={isPreferencesOpen}
          onOpenChange={setIsPreferencesOpen}
        />
        <AboutDialog
          open={isAboutOpen}
          onOpenChange={setIsAboutOpen}
          version={version}
        />
        <ExportStatusOverlay
          isExporting={exportWorkflow.isExporting}
          exportPhase={exportWorkflow.exportPhase}
          exportProgress={exportWorkflow.exportProgress}
          exportResult={exportWorkflow.exportResult}
          exportCancelled={exportWorkflow.exportCancelled}
          exportError={exportWorkflow.exportError}
          exportWarnings={exportWorkflow.exportWarnings}
          onCancelExport={exportWorkflow.handleCancelExport}
          onOpenExportFolder={onOpenExportFolder}
        />
      </div>
    </Suspense>
  );
}
