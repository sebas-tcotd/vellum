import { describe, expect, it } from 'vitest';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
  transitFixture,
} from '../../testing';
import type { CityData, RoadNode, TransitStop } from '../../types/city-data';
import { deriveTransitNetwork } from '../index';
import { geographicSchematicLayout } from './geographic';
import {
  finalizeSchematicLayout,
  gridSchematicLayout,
  routeOnGrid,
  schematicLayoutDiagnostics,
  type GridBase,
} from './grid-layout';
import { SCHEMATIC_VIEWBOX_SIZE } from './contract';
import {
  evaluateSchematicGates,
  measureSchematicLayout,
  SCHEMATIC_GATES,
} from './metrics';
import { createOctilinearGrid, octilinearSchematicLayout } from './octilinear';
import { orthoradialSchematicLayout } from './orthoradial';

const node = (id: string, x: number, z: number): RoadNode => ({
  id,
  position: { x, y: 0, z },
});

/**
 * A grid that offers no steps at all: A* can never reach the target, which is
 * the only way to observe the fallback without a fixture large enough to
 * exhaust the real search budget.
 */
function unroutableGrid(base: GridBase): GridBase {
  return {
    cellCount: base.cellCount,
    point: (cell) => base.point(cell),
    snap: (p) => base.snap(p),
    neighbors: () => [],
    lineTo: (from, to) => base.lineTo(from, to),
  };
}

describe('grid layout machinery', () => {
  it('routes around an occupied cell rather than through it', () => {
    const grid = createOctilinearGrid([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
    const from = grid.snap({ x: 0, y: 0 });
    const to = grid.snap({ x: 100, y: 0 });
    const direct = routeOnGrid(grid, from, to, new Set(), new Set());
    expect(direct).not.toBeNull();
    // Blocking the whole straight run forces a detour, and the detour is still
    // a walk over grid steps — so it is still conformant by construction.
    const blocked = new Set((direct as number[]).slice(1, -1));
    const detour = routeOnGrid(grid, from, to, blocked, new Set());
    expect(detour).not.toBeNull();
    for (const cell of (detour as number[]).slice(1, -1)) {
      expect(blocked.has(cell)).toBe(false);
    }
  });

  it('falls back to a straight grid route instead of dropping an edge', () => {
    const network = deriveTransitNetwork(transitFixture('simple'));
    const base = geographicSchematicLayout(network);
    const layout = gridSchematicLayout(network, (seeds) =>
      unroutableGrid(createOctilinearGrid(seeds)),
    );
    const diagnostics = schematicLayoutDiagnostics(layout);
    expect(diagnostics?.fallbackRoutes).toBeGreaterThan(0);
    // Every stroke the baseline draws is still drawn: a route that cannot be
    // found is a metric, never a missing corridor.
    expect(layout.segments.map((s) => s.lineId)).toEqual(
      base.segments.map((s) => s.lineId),
    );
    expect(layout.stations.map((s) => s.id)).toEqual(
      base.stations.map((s) => s.id),
    );
  });

  it('records no diagnostics for a layout it did not produce', () => {
    const network = deriveTransitNetwork(transitFixture('simple'));
    expect(schematicLayoutDiagnostics(geographicSchematicLayout(network))).toBe(
      null,
    );
  });
});

/**
 * A stop of one line sitting physically closer to *another* line's corridor.
 *
 * @remarks
 * None of the three shared fixtures produces this, which is why "nearest
 * corridor overall" survived them. Two parallel corridors 200 units apart, and
 * a stop of the southern line placed 80 units from the northern one and 120
 * from its own: nearest-overall puts the symbol on a stroke of a line that does
 * not call there, which is a station claiming a service the data never recorded.
 */
function crossedStopCity(): CityData {
  const stop = (id: string, x: number, z: number): TransitStop => ({
    id,
    mode: 'Bus',
    position: { x, y: 0, z },
    name: `Stop ${id}`,
  });
  return makeCityData({
    roadNodes: [
      node('s1', 0, 0),
      node('s2', 1000, 0),
      node('n1', 0, 200),
      node('n2', 1000, 200),
    ],
    roadSegments: [
      makeRoadSegment({ id: 'south', startNodeId: 's1', endNodeId: 's2' }),
      makeRoadSegment({ id: 'north', startNodeId: 'n1', endNodeId: 'n2' }),
    ],
    transitLines: [
      makeTransitLine({
        id: 'SOUTH',
        color: '#ff0000',
        // 120 from its own corridor, 80 from the northern one.
        stops: [stop('wanderer', 500, 120)],
        route: [{ segmentIds: ['south'] }],
      }),
      makeTransitLine({
        id: 'NORTH',
        color: '#0000ff',
        stops: [stop('northStop', 500, 200)],
        route: [{ segmentIds: ['north'] }],
      }),
    ],
  });
}

describe('stop assignment respects line membership', () => {
  it.each([
    ['octilinear', octilinearSchematicLayout],
    ['orthoradial', orthoradialSchematicLayout],
  ] as const)(
    'puts a stop on its own line rather than on the nearest one (%s)',
    (_name, strategy) => {
      const net = deriveTransitNetwork(crossedStopCity());
      const layout = strategy(net);
      const station = layout.stations.find((s) => s.id === 'wanderer');
      expect(station?.lineIds).toEqual(['SOUTH']);

      // Distance to the *stroke*, not to its vertices: a station sits in the
      // middle of a corridor, so vertex distance would say nothing.
      const at = station as { x: number; y: number };
      const toPiece = (
        a: { x: number; y: number },
        b: { x: number; y: number },
      ): number => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        const t =
          len2 === 0
            ? 0
            : Math.max(
                0,
                Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / len2),
              );
        return Math.hypot(at.x - (a.x + dx * t), at.y - (a.y + dy * t));
      };
      const distanceTo = (lineId: string): number => {
        let best = Infinity;
        for (const segment of layout.segments) {
          if (segment.lineId !== lineId) continue;
          for (let i = 1; i < segment.points.length; i++) {
            best = Math.min(
              best,
              toPiece(segment.points[i - 1], segment.points[i]),
            );
          }
        }
        return best;
      };
      // On its own stroke, and not on the other line's.
      expect(distanceTo('SOUTH')).toBeLessThan(1);
      expect(distanceTo('NORTH')).toBeGreaterThan(1);

      // And the gate that guards this agrees.
      const { metrics } = measureSchematicLayout(net, layout);
      expect(metrics.maxStationOffRoute).toBeLessThanOrEqual(
        SCHEMATIC_GATES.stationOnRoute,
      );
      expect(
        evaluateSchematicGates(metrics, 1).gates.find(
          (g) => g.id === 'legibility/stationOnRoute',
        ),
      ).toMatchObject({ passed: true });
    },
  );
});

describe('guards', () => {
  it('returns the empty layout when finalising nothing', () => {
    // Exported, so it can be called with nothing. Without the guard `minX` stays
    // Infinity and every projected coordinate comes out NaN — a layout of NaNs
    // renders as an invisible diagram with no error anywhere.
    const { layout, project } = finalizeSchematicLayout([], []);
    expect(layout.segments).toEqual([]);
    expect(layout.stations).toEqual([]);
    expect(layout.bounds.width).toBe(SCHEMATIC_VIEWBOX_SIZE);
    const p = project({ x: 3, y: 4 });
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it('refuses to let two nodes share a cell when the grid is exhausted', () => {
    // A grid smaller than the node count. Sharing a cell would draw one symbol
    // where the network has two stations, so this has to fail loudly.
    const tinyGrid = (seeds: readonly { x: number; y: number }[]): GridBase => {
      const base = createOctilinearGrid(seeds);
      return {
        cellCount: 1,
        point: (cell) => base.point(cell),
        snap: () => 0,
        neighbors: () => [],
        lineTo: (from, to) => [from, to],
      };
    };
    const network = deriveTransitNetwork(transitFixture('simple'));
    expect(() => gridSchematicLayout(network, tinyGrid)).toThrow(
      /SCHEMATIC_GRID_EXHAUSTED/,
    );
  });

  it('rejects a grid whose direction index would alias another cell', () => {
    // The A* state packs `dir + 1` into a fixed window. A direction outside it
    // silently splices two unrelated routes together, which is worse than no
    // route at all — so it is refused rather than drawn.
    const base = createOctilinearGrid([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
    const badDir: GridBase = {
      cellCount: base.cellCount,
      point: (cell) => base.point(cell),
      snap: (p) => base.snap(p),
      neighbors: (cell) =>
        base.neighbors(cell).map((step) => ({ ...step, dir: 99 })),
      lineTo: (from, to) => base.lineTo(from, to),
    };
    const from = base.snap({ x: 0, y: 0 });
    const to = base.snap({ x: 100, y: 0 });
    expect(() => routeOnGrid(badDir, from, to, new Set(), new Set())).toThrow(
      /SCHEMATIC_GRID_BAD_DIRECTION/,
    );
  });
});
