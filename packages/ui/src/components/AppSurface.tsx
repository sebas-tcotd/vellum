import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  Suspense,
  useState,
} from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
import { IPC_COMMANDS, type LayerName } from '@vellum/core';
import type { ServiceIconLegendState } from '@vellum/renderer-webgl';
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
import { ExportDialog } from './panels/ExportDialog';
import { PreferencesPanel } from './panels/PreferencesPanel';
import { DesktopShell } from './shell';
import { MapAppearanceSidebar } from './sidebar/MapAppearanceSidebar';
import type { CommandRegistry } from '../shell/commands';
import type { ShellSession } from '../shell/shell-session';
import type { useExportWorkflow } from '../hooks/use-export-workflow';
// Relativo a propósito: el alias `@/` del composition root apunta a
// `packages/ui/src`, así que un `@/store/...` compilado a dist carga un SEGUNDO
// módulo del store — el resto del paquete quedaría suscrito a otra instancia.
import { useVellumStore } from '../store/vellum-store';

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
}: AppSurfaceProps) {
  const cityData = useVellumStore((state) => state.cityData);
  const activeLayers = useVellumStore((state) => state.activeLayers);
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
  // How much of the map the sidebar covers, measured from the rendered element
  // so platform insets are included without this having to know about them.
  const [sidebarWidth, setSidebarWidth] = useState(0);
  const mapInset = { left: cityData === null ? 0 : sidebarWidth };
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
                fileName={cityData.fileName}
                commands={commands}
                shell={shell}
                onOccupiedWidthChange={setSidebarWidth}
              />
            )}
            <MapViewport
              mapProps={mapProps}
              commands={commands}
              isCleanView={isCleanMode}
              mapInset={mapInset}
              subscribeServiceIconLegendRef={subscribeServiceIconLegendRef}
              iconLegendToggleRef={iconLegendToggleRef}
            />
          </div>
        </DesktopShell>
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
              openUrl(updateInfo.url).catch((error: unknown) => {
                console.warn('App: failed to open release notes URL', error);
              });
            }}
            // The preference no longer decides silently at startup — it just
            // decides whether the toast offers to install. Toggling it takes
            // effect on the toast already on screen.
            {...(autoUpdateEnabled
              ? { onInstall: () => invoke<void>(IPC_COMMANDS.INSTALL_UPDATE) }
              : {})}
            onDismiss={() => setUpdateInfo(null)}
          />
        )}
        {cityData !== null && (
          <ExportDialog
            open={exportWorkflow.isExportDialogOpen}
            cityName={cityData.cityName}
            fileName={cityData.fileName}
            generatedAt={cityData.generatedAt}
            defaultBackground={
              activeTheme === 'night' || activeTheme === 'transit'
                ? 'dark'
                : 'white'
            }
            preview={exportWorkflow.exportPreview}
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
            isExporting={exportWorkflow.isExporting}
            onOpenChange={exportWorkflow.setIsExportDialogOpen}
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
