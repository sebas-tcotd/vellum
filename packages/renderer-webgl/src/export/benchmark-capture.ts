import type {
  CapabilityReport,
  ExportSnapshot,
  TilePlanTile,
} from '@vellum/core';
import {
  createBrowserPngCodec,
  preflightQuality,
  processQualityPng,
  type ExportQualityConfig,
  type RasterQualityCodec,
} from './export-quality';
import { RasterTileRenderer } from './raster-tile-renderer';
import { planTiles } from './tile-planner';

/** A real WebView capture case supplied by a desktop/E2E benchmark adapter. */
export interface QualityBenchmarkCase {
  /** Stable matrix key, e.g. fixture/area/scale/background. */
  readonly caseId: string;
  /** Immutable snapshot captured for this benchmark case. */
  readonly snapshot: ExportSnapshot;
  /** Capability report measured by the disposable export probe. */
  readonly capability: CapabilityReport;
  /** Quality variant under evaluation. */
  readonly quality: ExportQualityConfig;
}

/** Metadata and PNG bytes emitted for one real captured tile. */
export interface QualityBenchmarkArtifact {
  /** Matrix case that owns this tile. */
  readonly caseId: string;
  /** Deterministic tile sequence from the planner. */
  readonly tile: TilePlanTile;
  /** Whether the quality variant was actually applied. */
  readonly qualityApplied: boolean;
  /** PNG bytes captured in the real WebView surface. */
  readonly encodedPng: Uint8Array;
}

/** Callback used by a Tauri/E2E adapter to persist artifacts in a temporary directory. */
export type QualityBenchmarkWriter = (
  artifact: QualityBenchmarkArtifact,
) => Promise<void>;

/** Captures real planned tiles for comparison without wiring the spike into production. */
export async function captureQualityBenchmarkCase(
  benchmarkCase: QualityBenchmarkCase,
  writeArtifact: QualityBenchmarkWriter,
  signal: AbortSignal,
  createRenderer: (style: ExportSnapshot['style']) => RasterTileRenderer = (
    style,
  ) => new RasterTileRenderer(style),
  codec: RasterQualityCodec = createBrowserPngCodec(),
): Promise<void> {
  throwIfAborted(signal);
  if (benchmarkCase.capability.toBlob !== true)
    throw new Error('Benchmark case cannot be planned: to-blob');
  const plan = planTiles(
    benchmarkCase.snapshot,
    benchmarkCase.capability,
    signal,
  );
  if ('rejected' in plan)
    throw new Error('Benchmark case cannot be planned: ' + plan.reason);
  const renderer = createRenderer(benchmarkCase.snapshot.style);
  try {
    await renderer.configure(benchmarkCase.snapshot, signal);
    for (const tile of plan.tiles) {
      const captured = await captureBenchmarkTile(
        renderer,
        benchmarkCase,
        tile,
        codec,
        signal,
      );
      await writeArtifact({
        caseId: benchmarkCase.caseId,
        tile,
        qualityApplied: captured.qualityApplied,
        encodedPng: captured.encodedPng,
      });
      throwIfAborted(signal);
    }
  } finally {
    renderer.dispose();
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error('Export aborted');
  error.name = 'AbortError';
  throw error;
}

async function captureBenchmarkTile(
  renderer: RasterTileRenderer,
  benchmarkCase: QualityBenchmarkCase,
  tile: TilePlanTile,
  codec: RasterQualityCodec,
  signal: AbortSignal,
): Promise<{ qualityApplied: boolean; encodedPng: Uint8Array }> {
  const preflight = preflightQuality(
    tile,
    benchmarkCase.capability,
    benchmarkCase.quality,
  );
  if (!preflight.eligible)
    return {
      qualityApplied: false,
      encodedPng: await renderer.captureTile(tile, signal),
    };
  try {
    const physicalPng =
      preflight.factor === 1
        ? await renderer.captureTile(tile, signal)
        : await renderer.captureTileAtScale(tile, preflight.factor, signal);
    return {
      qualityApplied: true,
      encodedPng: await processQualityPng(
        physicalPng,
        tile,
        benchmarkCase.quality,
        codec,
        signal,
      ),
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return {
      qualityApplied: false,
      encodedPng: await renderer.captureTile(tile, signal),
    };
  }
}
