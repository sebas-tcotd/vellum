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
import { drawnDepartureAngle } from './corridor-angles';
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
  /** Rail lines' non-straight turns at nodes, one per line and transition. */
  readonly railNodeTurns?: number;
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
  // A rail line's turns at nodes: Story 4.10 moves direction changes between
  // a node and its corridors, so rails are judged on both together.
  const pointsOf = new Map(
    layout.corridors.map((corridor) => [corridor.edgeId, corridor.points]),
  );
  let railNodeTurns = 0;
  for (const t of routed.transitions) {
    const mode = network.lines.get(t.lineId)?.mode;
    if (mode === undefined || !RAIL_MODES.includes(mode)) continue;
    const from = pointsOf.get(t.fromEdge);
    const to = pointsOf.get(t.toEdge);
    if (from === undefined || to === undefined) continue;
    const a = drawnDepartureAngle(from, t.fromEnd);
    const b = drawnDepartureAngle(to, t.toEnd);
    if (a === null || b === null) continue;
    const turn = Math.abs(
      Math.atan2(Math.sin(b - a - Math.PI), Math.cos(b - a - Math.PI)),
    );
    if (turn > Math.PI / 8) railNodeTurns++;
  }
  const sum = (modes: readonly string[]): number =>
    modes.reduce((total, mode) => total + (bends[mode] ?? 0), 0);
  return {
    ms,
    sharedCenterlinePairs: grid.sharedCenterlinePairs,
    sharedCenterlineLength: Math.round(grid.sharedCenterlineLength),
    nodeTurns: { ...grid.nodeTurns },
    circularOrderViolations: grid.circularOrderViolations,
    railBends: sum(RAIL_MODES),
    railNodeTurns,
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
    // Against a baseline that shared a lot (main before Story 4.9, hundreds of
    // pairs): at most 2, or 5% of it, or 40 — whichever is largest. Against
    // one already near zero (this branch's own baseline): no regression. The
    // 40 is a deliberate ceiling for mid-sized baselines, not a percentage.
    const sharedBefore = before.octilinear.sharedCenterlinePairs;
    expect(after.sharedCenterlinePairs).toBeLessThanOrEqual(
      Math.max(2, Math.floor(sharedBefore * 0.05), Math.min(sharedBefore, 40)),
    );
    expect(after.fallbackRoutes).toBeLessThanOrEqual(
      before.octilinear.fallbackRoutes,
    );
    expect(
      after.nodeTurns.bend135 + after.nodeTurns.reverse,
    ).toBeLessThanOrEqual(
      before.octilinear.nodeTurns.bend135 + before.octilinear.nodeTurns.reverse,
    );
    // Rails, judged on their direction changes in corridors and at nodes
    // together: the turn a line pays at a node (Story 4.10) and the local
    // search move direction changes between the two. Sebas accepted one bend
    // of slack (Villa Coronada's tram, 23 → 24) and then 5% (San Rico, local
    // search, ADR-0008) on 2026-10-02.
    if (before.octilinear.railNodeTurns === undefined) {
      throw new Error(
        'VELLUM_GRID_BASELINE has no railNodeTurns: regenerate it with this test file on the baseline commit',
      );
    }
    // The local search must not crowd stations (octi §4.7's spring).
    expect(after.tightStationPairs).toBeLessThanOrEqual(
      before.octilinear.tightStationPairs,
    );
    const railBefore =
      before.octilinear.railBends + (before.octilinear.railNodeTurns ?? 0);
    const railAfter = after.railBends + (after.railNodeTurns ?? 0);
    expect(railAfter).toBeLessThanOrEqual(
      Math.max(railBefore + 1, Math.floor(railBefore * 1.05)),
    );
  }, 600_000);
});
