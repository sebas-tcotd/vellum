import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import type {
  CapabilityReport,
  ExportRequest,
  ExportSnapshot,
  MapRendererFactory,
} from '@vellum/core';
import { IPC_COMMANDS } from '@vellum/core';
import {
  App,
  AppMetaProvider,
  PlatformProvider,
  PlatformServicesProvider,
  setPreferencesPort,
  type ExportCancelHandlerRef,
} from '@vellum/ui';
import {
  buildCartographicScene,
  LegacyRasterExporter,
  MapLibreRenderer,
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
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { platform } from '@tauri-apps/plugin-os';
import { load } from '@tauri-apps/plugin-store';
import { version } from '../package.json';
import { detectPlatform } from './detect-platform';
import { createPlatformServices } from './platform-services';
import { createPreferencesAdapter } from './preferences-adapter';
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

/**
 * The single place in the app where the concrete rendering adapter is named.
 *
 * @remarks
 * `@vellum/ui` receives this as `MapRendererFactory` and never learns that
 * MapLibre is behind it — ADR-0001's composition-root rule, enforced by the
 * `packages/ui/src/**` import scope in `eslint.config.mjs`. Declared at module
 * scope so its identity is stable: `MapLibreRoot` keys the renderer's lifetime
 * on this reference, and a factory rebuilt per render would rebuild the map.
 */
const createRenderer: MapRendererFactory = (container, style) =>
  new MapLibreRenderer(container, style);

/**
 * The Tauri implementation of every shell capability `@vellum/ui` consumes.
 *
 * @remarks
 * Module scope, built exactly once: `useThemes` guards its one-time
 * `load_themes` invoke against React StrictMode's double mount, and that guard
 * only holds while this object keeps its identity across renders (ADR-0001).
 *
 * La lógica vive en `platform-services.ts` con sus dependencias inyectadas;
 * aquí sólo se nombran las primitivas concretas. Ese es el único motivo por el
 * que el desempaquetado del payload y el guard de la fase `drop` son
 * testeables: este módulo tiene efectos en el import y ningún test lo alcanza.
 */
const platformServices = createPlatformServices({
  invoke: (command, args) => invoke(command, args),
  listen: (event, handler) => listen(event, handler),
  openUrl: (url) => openUrl(url),
  onDragDropEvent: (handler) =>
    getCurrentWebviewWindow().onDragDropEvent(handler),
});

/**
 * On-disk preferences adapter.
 *
 * @remarks
 * `autoSave` stays disabled — `persistPreference` flushes every write itself so
 * a forced close cannot lose a change the user already made (NFR9). El fallback
 * silencioso ante una carga fallida vive en `preferences-adapter.ts`, con
 * `load` inyectado para poder probarlo.
 *
 * Se registra **antes** de `createRoot`: la hidratación inicial de
 * preferencias corre en el primer efecto de `App` y leería el puerto no-op si
 * el orden se invirtiera.
 */
setPreferencesPort(
  createPreferencesAdapter(() => load('preferences.json', { autoSave: false })),
);

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
// sin depender directamente de @tauri-apps/api — que a partir de ADR-0001 es
// una regla de lint, no sólo una convención.
void win.listen('tauri://drag-enter', () => {
  window.dispatchEvent(new CustomEvent('vellum:drag-enter'));
});

/**
 * Composition root that wires Tauri-specific hooks into the UI layer.
 *
 * @remarks
 * `@vellum/ui` genuinely has no `@tauri-apps/*` dependency as of ADR-0001 —
 * the renderer arrives as `createRenderer`, the shell as `platformServices`,
 * and preferences through `setPreferencesPort`. The claim is enforced by the
 * `packages/ui/src/**` scope in `eslint.config.mjs`, not left to convention.
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
      createRenderer={createRenderer}
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
        <PlatformServicesProvider services={platformServices}>
          <AppShell />
        </PlatformServicesProvider>
      </PlatformProvider>
    </AppMetaProvider>
  </React.StrictMode>,
);
