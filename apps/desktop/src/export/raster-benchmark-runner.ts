import {
  type CapabilityReport,
  type ExportArea,
  type ExportBackground,
  type ExportMode,
  type ExportRequest,
  type ExportSnapshot,
} from '@vellum/core';
import { planTiles } from '@vellum/renderer-webgl';

const AREAS = ['viewport', 'full-map'] as const satisfies readonly ExportArea[];
const FORMATS = ['png-1x', 'png-2x', 'png-4x'] as const;
const BACKGROUNDS = [
  'white',
  'dark',
  'transparent',
] as const satisfies readonly ExportBackground[];
const FIXTURE_READY_TIMEOUT_MS = 10_000;
const FIXTURE_POLL_INTERVAL_MS = 100;

/** A route requested from the reproducible raster benchmark. */
export type RasterBenchmarkRoute = 'legacy' | 'tiled';

/** A measurement that cannot be observed safely from the renderer process. */
export type RasterBenchmarkUnknown = 'unknown';

/** Manual verification state that remains outside the automated benchmark. */
export type RasterBenchmarkVisualState = 'pending-manual';

/** One privacy-safe result from a single raster benchmark export. */
export interface RasterBenchmarkCase {
  /** Fixture identifier supplied by the operator; no source path is retained. */
  readonly fixture: string;
  /** Export area exercised by this case. */
  readonly area: ExportArea;
  /** PNG format exercised by this case. */
  readonly format: (typeof FORMATS)[number];
  /** Numeric density implied by `format`. */
  readonly scale: 1 | 2 | 4;
  /** Background treatment exercised by this case. */
  readonly background: ExportBackground;
  /** Route actually selected by the coordinator after fallback decisions. */
  readonly route: ExportMode | null;
  /** Wall-clock duration of the export operation. */
  readonly durationMs: number;
  /** Heap usage when the browser exposes it; otherwise intentionally unknown. */
  readonly peakMemoryBytes: number | RasterBenchmarkUnknown;
  /** Dimensions requested from the captured export snapshot. */
  readonly requestedDimensions: Readonly<{ width: number; height: number }>;
  /** Planned tiled chunks, unavailable for legacy or rejected plans. */
  readonly tileCount: number | RasterBenchmarkUnknown;
  /** Alpha verification requires a human review of the generated PNG. */
  readonly alpha: RasterBenchmarkUnknown;
  /** Visual comparison against golden output remains a manual gate. */
  readonly visual: RasterBenchmarkVisualState;
}

/** JSON-safe report produced after one warmup and measured benchmark matrix. */
export interface RasterBenchmarkReport {
  /** Operator-provided environment label, such as `macOS 15.5`. */
  readonly platform: string;
  /** Application build or commit supplied by the operator. */
  readonly build: string;
  /** Fixture identifier supplied by the operator. */
  readonly fixture: string;
  /** Requested route; each case records the route actually selected. */
  readonly requestedRoute: RasterBenchmarkRoute;
  /** Number of measured repetitions per matrix entry. */
  readonly repeats: number;
  /** ISO timestamp when the run started. */
  readonly startedAt: string;
  /**
   * Whether this run covered the full 2×3×3 matrix. `false` when `area`,
   * `format`, or `background` filtered it to a subset — such a report must
   * never be treated as AC1/AC2/AC12 gate evidence.
   */
  readonly isCompleteMatrix: boolean;
  /** Individual measurements, with no output paths or PNG bytes. */
  readonly cases: readonly RasterBenchmarkCase[];
}

/** Configuration supplied by the dev-only bridge. */
export interface RasterBenchmarkRunnerDependencies {
  /** Captures the current loaded map without exposing its data to the report. */
  readonly captureSnapshot: (request: ExportRequest) => ExportSnapshot | null;
  /** Runs the real coordinator already paired with the Tauri export sink. */
  readonly exportRaster: (snapshot: ExportSnapshot) => Promise<unknown>;
  /** Reads the coordinator route once the current operation is complete. */
  readonly getLastRoute: () => ExportMode | null;
  /** Reads the measured browser/GPU capability report. */
  readonly getCapability: () => CapabilityReport | null;
  /** Temporarily selects the requested route while an entire benchmark run executes. */
  readonly runWithRoute: <Result>(
    route: RasterBenchmarkRoute,
    operation: () => Promise<Result>,
  ) => Promise<Result>;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => number;
  /**
   * Awaited between matrix cases so WebKit has time to actually reclaim a
   * `WEBGL_lose_context`-released context before the next temporary renderer
   * requests one — back-to-back creation can outrun the browser's async
   * reclaim and exhaust its active-context cap. Defaults to a real delay;
   * tests inject a no-op to stay fast.
   */
  readonly releaseGpuContext?: () => Promise<void>;
}

/** Arguments an operator must provide to run a benchmark against a loaded fixture. */
export interface RasterBenchmarkRunOptions {
  /** Privacy-safe identifier of the currently loaded fixture. */
  readonly fixture: string;
  /** Route requested for this run; the report preserves actual fallback selection. */
  readonly route: RasterBenchmarkRoute;
  /** Measured repetitions after optional warmup. */
  readonly repeats: number;
  /** Whether to run an unreported warmup matrix before measurements. */
  readonly warmup: boolean;
  /** Operating-system and browser/WebView label. */
  readonly platform: string;
  /** Application build or commit label. */
  readonly build: string;
  /** Restricts the matrix to a single area instead of both. */
  readonly area?: ExportArea;
  /** Restricts the matrix to a single format instead of all three. */
  readonly format?: (typeof FORMATS)[number];
  /** Restricts the matrix to a single background instead of all three. */
  readonly background?: ExportBackground;
}

/** DevTools bridge used to run the benchmark against the currently loaded map. */
export interface RasterBenchmarkBridge {
  /** Executes a benchmark and returns a JSON-safe report for the release evidence. */
  run(options: RasterBenchmarkRunOptions): Promise<RasterBenchmarkReport>;
}

declare global {
  interface Window {
    /** Development-only raster benchmark bridge; absent from production builds. */
    __vellumRasterBenchmark?: RasterBenchmarkBridge;
  }
}

/** Real-world delay found sufficient for WebKit to reclaim a lost WebGL context. */
const GPU_CONTEXT_RELEASE_DELAY_MS = 50;

/**
 * Rejects a filter value that isn't one of the allowed options.
 *
 * @remarks
 * `undefined` means "no filter" and is always accepted — only an explicitly
 * supplied, invalid value throws. This bridge is invoked from a DevTools
 * console, an untyped boundary where a typo would otherwise silently
 * fall through (e.g. an empty string is falsy and would have matched
 * "unset" under a truthy check) or reach `ExportRequest` unchecked.
 */
function assertValidFilter<Value extends string>(
  label: string,
  value: Value | undefined,
  allowed: readonly Value[],
): void {
  if (value === undefined) return;
  if (!allowed.includes(value)) {
    throw new Error(
      `Invalid benchmark ${label} filter: ${JSON.stringify(value)} (allowed: ${allowed.join(', ')})`,
    );
  }
}

/** Runs a fixed 2 × 3 × 3 raster matrix against the map currently loaded in Tauri. */
export class RasterBenchmarkRunner {
  private readonly now: () => number;
  private readonly releaseGpuContext: () => Promise<void>;

  /** Creates a dev-only runner around the already-composed desktop export path. */
  constructor(
    private readonly dependencies: RasterBenchmarkRunnerDependencies,
  ) {
    this.now = dependencies.now ?? (() => performance.now());
    this.releaseGpuContext =
      dependencies.releaseGpuContext ??
      (() =>
        new Promise((resolve) =>
          setTimeout(resolve, GPU_CONTEXT_RELEASE_DELAY_MS),
        ));
  }

  /** Executes optional warmups followed by the complete measured matrix. */
  async run(
    options: RasterBenchmarkRunOptions,
  ): Promise<RasterBenchmarkReport> {
    if (!Number.isInteger(options.repeats) || options.repeats < 1)
      throw new Error('Benchmark repeats must be a positive integer');
    assertValidFilter('area', options.area, AREAS);
    assertValidFilter('format', options.format, FORMATS);
    assertValidFilter('background', options.background, BACKGROUNDS);
    const capability = this.dependencies.getCapability();
    if (!capability)
      throw new Error(
        'Benchmark unavailable until capability probing completes',
      );
    return this.dependencies.runWithRoute(options.route, async () => {
      const startedAt = new Date().toISOString();
      if (options.warmup) await this.executeMatrix(options, capability, false);
      const cases = await this.executeMatrix(options, capability, true);
      return {
        platform: options.platform,
        build: options.build,
        fixture: options.fixture,
        requestedRoute: options.route,
        repeats: options.repeats,
        startedAt,
        isCompleteMatrix:
          options.area === undefined &&
          options.format === undefined &&
          options.background === undefined,
        cases,
      };
    });
  }

  private async executeMatrix(
    options: RasterBenchmarkRunOptions,
    capability: CapabilityReport,
    retain: boolean,
  ): Promise<RasterBenchmarkCase[]> {
    const cases: RasterBenchmarkCase[] = [];
    const phase = retain ? 'measured' : 'warmup';
    const areas = options.area ? [options.area] : AREAS;
    const formats = options.format ? [options.format] : FORMATS;
    const backgrounds = options.background ? [options.background] : BACKGROUNDS;
    for (const area of areas)
      for (const format of formats)
        for (const background of backgrounds)
          for (let repeat = 0; repeat < options.repeats; repeat += 1) {
            const entry = await this.executeCase(
              options.fixture,
              area,
              format,
              background,
              capability,
              phase,
              repeat,
            );
            if (retain) cases.push(entry);
            await this.releaseGpuContext();
          }
    return cases;
  }

  private async executeCase(
    fixture: string,
    area: ExportArea,
    format: (typeof FORMATS)[number],
    background: ExportBackground,
    capability: CapabilityReport,
    phase: 'warmup' | 'measured',
    repeat: number,
  ): Promise<RasterBenchmarkCase> {
    const requestBase = {
      format,
      background,
      fileName: `benchmark-${fixture}-${phase}-${repeat + 1}-${area}-${format}-${background}`,
      presentation: emptyPresentation(),
    };
    const request: ExportRequest =
      area === 'full-map'
        ? { ...requestBase, area, targetLongEdge: 6000 }
        : { ...requestBase, area };
    const snapshot = await this.captureFixtureSnapshot(request, fixture);
    const startedAt = this.now();
    await this.dependencies.exportRaster(snapshot);
    const plan = planTiles(snapshot, capability);
    return {
      fixture,
      area,
      format,
      scale: scaleFor(format),
      background,
      route: this.dependencies.getLastRoute(),
      durationMs: Math.max(0, this.now() - startedAt),
      peakMemoryBytes: readHeapBytes(),
      requestedDimensions: snapshot.surface,
      tileCount: 'rejected' in plan ? 'unknown' : plan.expectedTiles,
      alpha: 'unknown',
      visual: 'pending-manual',
    };
  }

  private async captureFixtureSnapshot(
    request: ExportRequest,
    fixture: string,
  ): Promise<ExportSnapshot> {
    const deadline = Date.now() + FIXTURE_READY_TIMEOUT_MS;
    let snapshot = this.dependencies.captureSnapshot(request);
    while (!snapshot || !matchesFixture(snapshot.cityData.fileName, fixture)) {
      if (Date.now() >= deadline) {
        const actual = snapshot?.cityData.fileName ?? 'no map';
        throw new Error(
          `Benchmark fixture mismatch: requested ${fixture}, loaded ${actual}`,
        );
      }
      await delay(FIXTURE_POLL_INTERVAL_MS);
      snapshot = this.dependencies.captureSnapshot(request);
    }
    return snapshot;
  }
}

function scaleFor(format: (typeof FORMATS)[number]): 1 | 2 | 4 {
  if (format === 'png-1x') return 1;
  if (format === 'png-2x') return 2;
  return 4;
}

function emptyPresentation(): ExportRequest['presentation'] {
  return {
    showCityName: false,
    showVellumLogo: false,
    showSourceFile: false,
    showGeneratedAt: false,
    showDistrictNames: false,
    showParkNames: false,
    showLayerLegend: false,
    showRoadLegend: false,
    showTransitLegend: false,
    showElevationLegend: false,
    showScaleBar: false,
    showOrientation: false,
    showSummary: false,
  };
}

function readHeapBytes(): number | RasterBenchmarkUnknown {
  const candidate = performance as Performance & {
    readonly memory?: { readonly usedJSHeapSize?: unknown };
  };
  const value = candidate.memory?.usedJSHeapSize;
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : 'unknown';
}

function matchesFixture(fileName: string, fixture: string): boolean {
  return normalizeFixture(fileName) === normalizeFixture(fixture);
}

function normalizeFixture(value: string): string {
  return value
    .replace(/\.cslmap$/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
