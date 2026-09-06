import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import type {
  CapabilityReport,
  ExportRequest,
  ExportSnapshot,
} from '@vellum/core';
import { IPC_COMMANDS } from '@vellum/core';
import {
  App,
  AppMetaProvider,
  PlatformProvider,
  type ExportCancelHandlerRef,
} from '@vellum/ui';
import {
  buildCartographicScene,
  LegacyRasterExporter,
  probeCapabilities,
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
import { platform } from '@tauri-apps/plugin-os';
import { version } from '../package.json';
import { detectPlatform } from './detect-platform';
import { useParseCslmap } from './hooks/use-parse-cslmap';
import { useExportPng } from './hooks/use-export-png';
import {
  EXPORT_FORCE_LEGACY_KEY,
  ExportCoordinator,
  readExportRuntimeFlag,
} from './export/export-coordinator';
import { LegacyExportSink } from './export/legacy-export-sink';
import { TauriExportSink } from './export/tauri-export-sink';
import { SvgExporter, type SvgWorkerHandle } from './export/svg/svg-exporter';
import { TauriSvgExportSink } from './export/svg/tauri-svg-export-sink';
import type {
  SvgWorkerCommand,
  SvgWorkerReply,
} from './export/svg/svg-worker-protocol';
import {
  RasterBenchmarkRunner,
  type RasterBenchmarkRoute,
} from './export/raster-benchmark-runner';

const win = getCurrentWindow();
// Single, composition-root-only OS detection point for the whole app (story
// 1.1). `platform()` from `@tauri-apps/plugin-os` resolves synchronously, so
// there's no async gap that could flash the neutral default profile before
// the real one applies — same guarantee `version` already gets from
// `AppMetaProvider`. `detectPlatform` is a pure, injected-dependency wrapper
// (mirrors `window-close-cancel.ts`) so any unsupported platform string or a
// throwing plugin call falls back to `'unknown'` without ever blocking boot.
const detectedPlatform = detectPlatform(() => platform());
const legacyExporter = new LegacyRasterExporter();
const legacySink = new LegacyExportSink();
const rasterExporter = new ExportCoordinator(legacyExporter, legacySink);

/**
 * Vector export route.
 *
 * @remarks
 * A fresh worker per operation, so a cancelled or failed serialization can
 * never leak state into the next one — `terminate()` is the only reliable way
 * to stop a generator mid-document. `type: 'module'` keeps the worker on the
 * same ESM graph Vite builds for the app.
 */
const svgExporter = new SvgExporter({
  // The one place the SVG route is allowed to meet `renderer-webgl`: the
  // composition root. `svg-exporter.ts` takes this as a port so the adapter
  // itself stays core-only (AD-16).
  buildScene: buildCartographicScene,
  createWorker: () => {
    const worker = new Worker(
      new URL('./export/svg/svg-export-worker.ts', import.meta.url),
      { type: 'module' },
    );
    // Handlers are stored on the adapter and forwarded, rather than assigned
    // straight onto the worker: `Worker.onerror` is typed against `ErrorEvent`
    // and the port deliberately accepts `unknown`, which does not round-trip
    // through a getter/setter pair.
    const handle: SvgWorkerHandle = {
      postMessage: (message: SvgWorkerCommand | SvgWorkerReply) =>
        worker.postMessage(message),
      onmessage: null,
      onerror: null,
      terminate: () => worker.terminate(),
    };
    worker.onmessage = (event) => handle.onmessage?.(event);
    worker.onerror = (event) => handle.onerror?.(event);
    return handle;
  },
  sink: new TauriSvgExportSink(),
  onWarnings: (warnings) => {
    // Aggregated counts only — no path, city name, or CityData content.
    // The user-facing half of this lives in `use-export-workflow`, which
    // surfaces the localized keys; this is the diagnostic half.
    if (warnings.length > 0)
      console.info('[App] SVG export warnings', warnings);
  },
  onMetrics: (metrics) => {
    // AC 10: duration, published size and peak memory. Every field is a
    // number by construction, so nothing here can carry user data.
    console.info('[App] SVG export metrics', metrics);
  },
});
let measuredCapability: CapabilityReport | null = null;
const benchmarkSnapshotCaptureRef = React.createRef<
  ((request: ExportRequest) => ExportSnapshot | null) | null
>();

// The 6.2I report (`adopt`, 2026-08-01) has real WebView/Tauri evidence for
// all three declared platforms — 324 exports, 0 rejections, no visual
// artifacts — so the gate is approved by default. `EXPORT_FORCE_LEGACY_KEY`
// remains the operational rollback, still readable at export time without
// rebuilding the UI.
void probeCapabilities()
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

/**
 * Runs an operation with a temporary dev-only route selection and restores it
 * afterwards.
 *
 * @remarks
 * The tiled gate is approved unconditionally (see the `probeCapabilities`
 * comment above), so forcing `'tiled'` only needs to lift the legacy kill
 * switch — there is no gate flag left to set.
 */
async function runWithBenchmarkRoute<Result>(
  route: RasterBenchmarkRoute,
  operation: () => Promise<Result>,
): Promise<Result> {
  const forceLegacy = readStoredValue(EXPORT_FORCE_LEGACY_KEY);
  try {
    if (route === 'legacy') {
      localStorage.setItem(EXPORT_FORCE_LEGACY_KEY, 'true');
    } else {
      localStorage.removeItem(EXPORT_FORCE_LEGACY_KEY);
    }
    return await operation();
  } finally {
    restoreStoredValue(EXPORT_FORCE_LEGACY_KEY, forceLegacy);
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
 * an export is active; `null` otherwise. Lives at module scope so the
 * composition root and file-loading guard share the same export lifecycle.
 */
const exportCancelHandlerRef: ExportCancelHandlerRef = { current: null };
// Bridge: Tauri → browser custom event
// WebView2 (Windows) no propaga el evento browser 'dragenter' para drags externos
// del SO (archivos desde el explorador). Escuchamos el evento nativo de Tauri y lo
// re-despachamos como CustomEvent para que EmptyState (en @vellum/ui) lo reciba
// sin depender directamente de @tauri-apps/api.
void win.listen('tauri://drag-enter', () => {
  window.dispatchEvent(new CustomEvent('vellum:drag-enter'));
});

/**
 * Composition root that wires Tauri-specific hooks into the UI layer.
 * Keeps `@vellum/ui` free of direct Tauri runtime dependencies.
 */
function AppShell() {
  const { loadFile, openFileDialog, loadFilePartial } = useParseCslmap(
    exportCancelHandlerRef,
  );
  const { openExportFolder } = useExportPng();

  React.useEffect(() => {
    const handleAlt = (event: KeyboardEvent) => {
      // Alt alone is the native menu convention. Ignore Alt combinations so
      // existing application shortcuts keep their current behavior.
      if (
        event.key !== 'Alt' ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      event.preventDefault();
      void invoke(IPC_COMMANDS.TOGGLE_NATIVE_MENU).catch((error: unknown) => {
        console.warn('[AppShell] toggle_native_menu failed:', error);
      });
    };

    window.addEventListener('keydown', handleAlt);
    return () => window.removeEventListener('keydown', handleAlt);
  }, []);

  // A `.cslmap` opened via the Windows file association (double-click) arrives
  // as a command-line argument, captured by Rust before this component mounts
  // (see `startup::capture_startup_file_path` in lib.rs). Claim it once, on
  // first mount — the Rust side clears its pending slot on read, so a second
  // call here (e.g. Vite HMR) would just find nothing (Story 7.5 AC1).
  React.useEffect(() => {
    invoke<string | null>(IPC_COMMANDS.GET_STARTUP_FILE_PATH)
      .then((path) => {
        if (path) void loadFile(path);
      })
      .catch((err) =>
        console.warn('[AppShell] get_startup_file_path failed:', err),
      );
  }, [loadFile]);

  return (
    <App
      version={version}
      loadFile={loadFile}
      openFileDialog={openFileDialog}
      loadFilePartial={loadFilePartial}
      rasterExporter={rasterExporter}
      svgExporter={svgExporter}
      onOpenExportFolder={openExportFolder}
      exportCancelHandlerRef={exportCancelHandlerRef}
      exportSnapshotCaptureRef={benchmarkSnapshotCaptureRef}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppMetaProvider version={version}>
      <PlatformProvider platform={detectedPlatform}>
        <AppShell />
      </PlatformProvider>
    </AppMetaProvider>
  </React.StrictMode>,
);
