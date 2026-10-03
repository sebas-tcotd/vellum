/**
 * Opt-in corpus evidence for the `octi` grid model (Stories 4.9 and 4.10,
 * ADR-0008).
 *
 * Skipped unless `VELLUM_GRID_CITY` points at a `CityData` JSON dumped with
 * `cargo run --release --example dump_city --package parser-cslmap`. It lays the
 * city out octilinearly and orthoradially and prints, per strategy, what the grid
 * model is about: shared stretches between corridors, turns at nodes, circular
 * order, bends per mode, fallbacks, crossings, station spacing and time.
 *
 * Every number is read off the geometry, so the same file measures a layout from
 * before these stories: copy it with `grid-model-metrics.ts` and
 * `corridor-angles.ts` onto a worktree of the baseline and run it there with
 * `VELLUM_GRID_OUT=<file>`. Point `VELLUM_GRID_BASELINE` at that file and the
 * run on this branch also asserts the acceptance criteria against it.
 *
 * ```powershell
 * $env:VELLUM_GRID_CITY = "$env:TEMP\san-rico.json"; pnpm --filter @vellum/core exec vitest run grid-model.corpus --silent=false
 * ```
 */
import { describe, expect, it } from 'vitest';
import type { CityData, TransitMode } from '../../types/city-data';
import type { TransitNetwork } from '../../types/transit-network';
import type { SchematicLayout } from './contract';
import { schematicLayoutDiagnostics } from './grid-layout';
import { measureGridModel } from './grid-model-metrics';
import { countBendsByMode, measureSchematicLayout } from './metrics';
import { octilinearSchematicLayout } from './octilinear';
import { orthoradialSchematicLayout } from './orthoradial';
import { deriveSchematicTransitNetwork } from './station-contraction';

interface NodeLike {
  readonly process?: {
    readonly env: Record<string, string | undefined>;
    readonly stdout: { write(text: string): void };
  };
}
const nodeProcess = (globalThis as NodeLike).process;
const cityPath = nodeProcess?.env.VELLUM_GRID_CITY;
const outPath = nodeProcess?.env.VELLUM_GRID_OUT;
const baselinePath = nodeProcess?.env.VELLUM_GRID_BASELINE;

interface Fs {
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, text: string): void;
}
const fsModule = async (): Promise<Fs> =>
  (await import(/* @vite-ignore */ `node:${'fs'}`)) as Fs;

const RAIL_MODES: readonly TransitMode[] = [
  'Metro',
  'Train',
  'Monorail',
  'Tram',
];

interface StrategyReport {
  readonly ms: number;
  readonly sharedCenterlinePairs: number;
  readonly sharedCenterlineLength: number;
  readonly nodeTurns: Record<string, number>;
  readonly circularOrderViolations: number;
  readonly railBends: number;
  readonly busBends: number;
  readonly allBends: number;
  readonly fallbackRoutes: number;
  readonly relocatedNodes: number;
  readonly corridorCrossings: number;
  readonly tightStationPairs: number;
  readonly stationsClampedToNodeArea: number;
  readonly topologyPreserved: boolean;
  readonly nodePassThroughs?: number;
}

function report(
  network: TransitNetwork,
  strategy: (network: TransitNetwork) => SchematicLayout,
): StrategyReport {
  const started = performance.now();
  const layout = strategy(network);
  const ms = Math.round(performance.now() - started);
  const diag = schematicLayoutDiagnostics(layout) as
    | (ReturnType<typeof schematicLayoutDiagnostics> & {
        readonly network?: TransitNetwork;
      })
    | null;
  // The network the router actually laid out: with split nodes it carries the
  // synthetic corridors and the rewritten transitions.
  const routed = diag?.network ?? network;
  const grid = measureGridModel(routed, layout);
  const { metrics } = measureSchematicLayout(network, layout);
  const bends = countBendsByMode(network, layout);
  const sum = (modes: readonly string[]): number =>
    modes.reduce((total, mode) => total + (bends[mode] ?? 0), 0);
  return {
    ms,
    sharedCenterlinePairs: grid.sharedCenterlinePairs,
    sharedCenterlineLength: Math.round(grid.sharedCenterlineLength),
    nodeTurns: { ...grid.nodeTurns },
    circularOrderViolations: grid.circularOrderViolations,
    railBends: sum(RAIL_MODES),
    busBends: sum(['Bus']),
    allBends: sum(Object.keys(bends)),
    fallbackRoutes: metrics.fallbackRoutes,
    relocatedNodes: metrics.relocatedNodes,
    corridorCrossings: metrics.corridorCrossings,
    tightStationPairs: metrics.tightStationPairs,
    stationsClampedToNodeArea: diag?.stationsClampedToNodeArea ?? 0,
    topologyPreserved: metrics.topologyPreserved,
    nodePassThroughs:
      (metrics as { nodePassThroughs?: number }).nodePassThroughs ?? 0,
  };
}

describe.skipIf(!cityPath)('the octi grid model on a real city', () => {
  it('measures both grid strategies', async () => {
    const fs = await fsModule();
    const city = JSON.parse(
      fs.readFileSync(cityPath as string, 'utf8'),
    ) as CityData;
    const network = deriveSchematicTransitNetwork(city);
    const result = {
      city: city.cityName,
      octilinear: report(network, octilinearSchematicLayout),
      orthoradial: report(network, orthoradialSchematicLayout),
    };
    nodeProcess?.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (outPath) fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

    // Determinism: the same network lays out the same way again.
    expect(octilinearSchematicLayout(network)).toEqual(
      octilinearSchematicLayout(network),
    );

    if (!baselinePath) return;
    const before = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as {
      octilinear: StrategyReport;
      orthoradial: StrategyReport;
    };
    // Orthoradial: no regression on what the grid model is about. Its inner
    // rings are too small for "nearly zero" (ADR-0008), so it is held to the
    // baseline, not to the octilinear bar.
    const radial = result.orthoradial;
    expect(radial.topologyPreserved).toBe(true);
    expect(radial.sharedCenterlinePairs).toBeLessThanOrEqual(
      before.orthoradial.sharedCenterlinePairs,
    );
    expect(radial.fallbackRoutes).toBeLessThanOrEqual(
      before.orthoradial.fallbackRoutes,
    );
    expect(
      radial.nodeTurns.bend135 + radial.nodeTurns.reverse,
    ).toBeLessThanOrEqual(
      before.orthoradial.nodeTurns.bend135 +
        before.orthoradial.nodeTurns.reverse,
    );
    const after = result.octilinear;
    // "Zero or nearly": at most 2, or 5% of what the baseline shared.
    expect(after.sharedCenterlinePairs).toBeLessThanOrEqual(
      Math.max(2, Math.floor(before.octilinear.sharedCenterlinePairs * 0.05)),
    );
    expect(after.fallbackRoutes).toBeLessThanOrEqual(
      before.octilinear.fallbackRoutes,
    );
    expect(
      after.nodeTurns.bend135 + after.nodeTurns.reverse,
    ).toBeLessThanOrEqual(
      before.octilinear.nodeTurns.bend135 + before.octilinear.nodeTurns.reverse,
    );
    // One bend of slack, accepted by Sebas on 2026-10-02: the turn a line
    // pays at a node (Story 4.10) can move a direction change into the
    // corridor. Villa Coronada's tram goes 23 → 24 while the metro's Z and the
    // tram's reversals at nodes disappear (ADR-0008).
    expect(after.railBends).toBeLessThanOrEqual(
      before.octilinear.railBends + 1,
    );
  }, 600_000);
});
