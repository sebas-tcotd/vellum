import React from 'react';
import ReactDOM from 'react-dom/client';
import type {
  CapabilityReport,
  ExportRequest,
  ExportSnapshot,
} from '@vellum/core';
import {
  App,
  AppMetaProvider,
  useVellumStore,
  type ExportCancelHandlerRef,
} from '@vellum/ui';
import {
  CapabilityProbe,
  LegacyRasterExporter,
  TiledRasterExporter,
} from '@vellum/renderer-webgl';
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
import { useExportPng } from './hooks/use-export-png';
import {
  EXPORT_FORCE_LEGACY_KEY,
  EXPORT_TILED_GATE_KEY,
  ExportCoordinator,
  readExportRuntimeFlag,
} from './export/export-coordinator';
import { LegacyExportSink } from './export/legacy-export-sink';
import { TauriExportSink } from './export/tauri-export-sink';
import {
  RasterBenchmarkRunner,
  type RasterBenchmarkRoute,
} from './export/raster-benchmark-runner';
import { createCloseRequestedHandler } from './window-close-cancel';

const win = getCurrentWindow();
const legacyExporter = new LegacyRasterExporter();
const legacySink = new LegacyExportSink();
const rasterExporter = new ExportCoordinator(legacyExporter, legacySink);
let measuredCapability: CapabilityReport | null = null;
const benchmarkSnapshotCaptureRef = React.createRef<
  ((request: ExportRequest) => ExportSnapshot | null) | null
>();

// The 6.2I report (`adopt`, 2026-08-01) has real WebView/Tauri evidence for
// all three declared platforms — 324 exports, 0 rejections, no visual
// artifacts — so the gate is approved by default. `EXPORT_FORCE_LEGACY_KEY`
// remains the operational rollback, still readable at export time without
// rebuilding the UI.
void new CapabilityProbe()
  .measure()
  .then((capability) => {
    measuredCapability = capability;
    rasterExporter.setTiledRoute({
      exporter: new TiledRasterExporter(capability),
      sink: new TauriExportSink(),
      capability,
      enabled: true,
      cutover: {
        gateApproved: true,
        tiledEnabled: true,
        killSwitch: () => readExportRuntimeFlag(EXPORT_FORCE_LEGACY_KEY),
      },
    });
  })
  .catch((error: unknown) => {
    console.warn(
      'Tiled export capability probe unavailable; using legacy',
      error,
    );
  });

/** Runs an operation with a temporary dev-only route selection and restores it afterwards. */
async function runWithBenchmarkRoute<Result>(
  route: RasterBenchmarkRoute,
  operation: () => Promise<Result>,
): Promise<Result> {
  const forceLegacy = readStoredValue(EXPORT_FORCE_LEGACY_KEY);
  const tiledGate = readStoredValue(EXPORT_TILED_GATE_KEY);
  try {
    if (route === 'legacy') {
      localStorage.setItem(EXPORT_FORCE_LEGACY_KEY, 'true');
      localStorage.removeItem(EXPORT_TILED_GATE_KEY);
    } else {
      localStorage.removeItem(EXPORT_FORCE_LEGACY_KEY);
      localStorage.setItem(EXPORT_TILED_GATE_KEY, 'true');
    }
    return await operation();
  } finally {
    restoreStoredValue(EXPORT_FORCE_LEGACY_KEY, forceLegacy);
    restoreStoredValue(EXPORT_TILED_GATE_KEY, tiledGate);
  }
}

function readStoredValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function restoreStoredValue(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // The normal export path already treats unavailable browser storage as legacy.
  }
}

if (import.meta.env.DEV) {
  const benchmarkRunner = new RasterBenchmarkRunner({
    captureSnapshot: (request) =>
      benchmarkSnapshotCaptureRef.current?.(request) ?? null,
    exportRaster: (snapshot) => rasterExporter.export(snapshot),
    getLastRoute: () => rasterExporter.getLastRoute(),
    getCapability: () => measuredCapability,
    runWithRoute: runWithBenchmarkRoute,
  });
  window.__vellumRasterBenchmark = {
    run: (options) => benchmarkRunner.run(options),
  };
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      delete window.__vellumRasterBenchmark;
    });
  }
}

/**
 * Set by `App` (via `AppShell`) to a bounded, awaitable cancel request while
 * an export is active; `null` otherwise. Lives at module scope, like the
 * title-sync bridge below, so the close-requested listener registered once
 * at load time can reach whatever export is active at close time.
 */
const exportCancelHandlerRef: ExportCancelHandlerRef = { current: null };

/** Bounded wait for the active export to acknowledge cancellation before closing anyway. */
const CLOSE_CANCEL_TIMEOUT_MS = 2_000;

let unlistenCloseRequested: (() => void) | null = null;
void win
  .onCloseRequested(
    createCloseRequestedHandler(
      () => exportCancelHandlerRef.current,
      () => win.destroy(),
      CLOSE_CANCEL_TIMEOUT_MS,
    ),
  )
  .then((unlisten) => {
    unlistenCloseRequested = unlisten;
  });

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unlistenCloseRequested?.();
  });
}

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
//
// The native window title survives a WebView `Reload` (only the JS context and
// the Zustand store reset — the OS-level window chrome does not). So this module
// must assert the title from the store's *actual* current state as soon as it
// runs, not just react to future transitions — otherwise a Reload leaves the
// native title showing whatever was set before it, even though the store has
// already reset to no map loaded.
function applyTitle(cityName: string | null): void {
  const title = cityName ? `Vellum — ${cityName}` : 'Vellum';
  void win
    .setTitle(title)
    .catch((err) => console.error('Error Tauri setTitle:', err));
}

let prevCityName = useVellumStore.getState().cityData?.cityName ?? null;
applyTitle(prevCityName);

const unsubTitle = useVellumStore.subscribe((state) => {
  const cityName = state.cityData?.cityName ?? null;
  if (cityName === prevCityName) return;
  prevCityName = cityName;
  applyTitle(cityName);
});

// Prevent subscription accumulation during HMR
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubTitle();
  });
}

/**
 * Composition root that wires Tauri-specific hooks into the UI layer.
 * Keeps `@vellum/ui` free of direct Tauri runtime dependencies.
 */
function AppShell() {
  const { loadFile, openFileDialog, loadFilePartial } = useParseCslmap(
    exportCancelHandlerRef,
  );
  const { openExportFolder } = useExportPng();
  return (
    <App
      loadFile={loadFile}
      openFileDialog={openFileDialog}
      loadFilePartial={loadFilePartial}
      rasterExporter={rasterExporter}
      onOpenExportFolder={openExportFolder}
      exportCancelHandlerRef={exportCancelHandlerRef}
      exportSnapshotCaptureRef={benchmarkSnapshotCaptureRef}
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
