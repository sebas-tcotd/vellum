/**
 * The `octi` grid model (Stories 4.9 and 4.10, ADR-0008): one corridor per
 * grid step, turns priced at nodes, circular order, node splitting and evenly
 * spaced stops. One test per row of the spec's I/O matrix.
 */
import { describe, expect, it } from 'vitest';
import { makeCityData, makeRoadSegment, makeTransitLine } from '../../testing';
import type { RoadNode, TransitStop } from '../../types/city-data';
import type { TransitNetwork } from '../../types/transit-network';
import { deriveTransitNetwork } from '../index';
import {
  bendCost,
  gridSchematicLayout,
  gridStepKey,
  nodeTurnCost,
  routeBetween,
  schematicLayoutDiagnostics,
} from './grid-layout';
import {
  countCircularOrderViolations,
  countNodeTurns,
  measureGridModel,
  sharedCenterlineRuns,
} from './grid-model-metrics';
import type { SchematicLayout } from './contract';
import { measureSchematicLayout } from './metrics';
import { isSplitCorridorId, splitHighDegreeNodes } from './node-splitting';
import { createOctilinearGrid, octilinearSchematicLayout } from './octilinear';
import {
  createOrthoradialGrid,
  orthoradialSchematicLayout,
} from './orthoradial';
import { departureAngle, sameCircularOrder } from './corridor-angles';
import { CS1_LAT_SIGN } from '../../coordinate-transform';

const node = (id: string, x: number, z: number): RoadNode => ({
  id,
  position: { x, y: 0, z },
});

const stop = (id: string, x: number, z: number): TransitStop => ({
  id,
  mode: 'Bus',
  position: { x, y: 0, z },
  name: `Stop ${id}`,
});

/**
 * A star: one hub, an arm per angle (degrees), one line per arm. Arm `i` is
 * `1 + i · stretch` km long.
 */
function starCity(
  angles: readonly number[],
  through: [number, number][] = [],
  stretch = 0,
) {
  const roadNodes = [node('hub', 0, 0)];
  const roadSegments = angles.map((angle, i) => {
    const radians = (angle * Math.PI) / 180;
    const length = 1000 * (1 + i * stretch);
    roadNodes.push(
      node(`arm${i}`, length * Math.cos(radians), length * Math.sin(radians)),
    );
    return makeRoadSegment({
      id: `s${i}`,
      startNodeId: 'hub',
      endNodeId: `arm${i}`,
    });
  });
  const transitLines = [
    ...angles.map((_, i) =>
      makeTransitLine({ id: `L${i}`, route: [{ segmentIds: [`s${i}`] }] }),
    ),
    // Lines crossing the hub from one arm to another.
    ...through.map(([from, to], k) =>
      makeTransitLine({
        id: `T${k}`,
        route: [{ segmentIds: [`s${from}`, `s${to}`] }],
      }),
    ),
  ];
  return makeCityData({ roadNodes, roadSegments, transitLines });
}

const routedOf = (
  network: TransitNetwork,
  layout: ReturnType<typeof octilinearSchematicLayout>,
): TransitNetwork => schematicLayoutDiagnostics(layout)?.network ?? network;

describe('one corridor per grid step (Story 4.9)', () => {
  it('gives two parallel corridors parallel runs instead of one', () => {
    // Two lines 30 m apart: they snap onto the same row of cells, and before
    // Story 4.9 the second simply paid to run over the first.
    const city = makeCityData({
      roadNodes: [
        node('a', 0, 0),
        node('b', 2000, 0),
        node('c', 0, 30),
        node('d', 2000, 30),
      ],
      roadSegments: [
        makeRoadSegment({ id: 'ab', startNodeId: 'a', endNodeId: 'b' }),
        makeRoadSegment({ id: 'cd', startNodeId: 'c', endNodeId: 'd' }),
      ],
      transitLines: [
        makeTransitLine({ id: 'X', route: [{ segmentIds: ['ab'] }] }),
        makeTransitLine({ id: 'Y', route: [{ segmentIds: ['cd'] }] }),
      ],
    });
    const network = deriveTransitNetwork(city);
    const layout = octilinearSchematicLayout(network);
    expect(measureGridModel(network, layout).sharedCenterlinePairs).toBe(0);
    expect(schematicLayoutDiagnostics(layout)?.sharedGridSteps).toBe(0);
  });

  it('steps round a short used run that crossing alone would not avoid', () => {
    // Two steps east, both already used. Priced as a crossing only, running
    // over them (2 + 2.5) is cheaper than the detour (2√2 plus a right-angle
    // elbow); priced as a shared step, the detour wins.
    const grid = createOctilinearGrid([
      { x: 0, y: 0 },
      { x: 1000, y: 1000 },
    ]);
    const from = grid.snap({ x: 500, y: 500 });
    const middle = grid.neighbors(from).find((s) => s.dir === 0)!.cell;
    const to = grid.neighbors(middle).find((s) => s.dir === 0)!.cell;
    const route = routeBetween(grid, {
      source: { cells: new Map([[from, 0]]) },
      target: { cells: new Map([[to, 0]]) },
      blocked: new Set(),
      occupied: new Set([from, middle, to]),
      usedSteps: new Set([
        gridStepKey(grid, from, middle),
        gridStepKey(grid, middle, to),
      ]),
    });
    expect(route).not.toBeNull();
    expect(route).not.toContain(middle);
  });

  it('still routes when the only way is a used step, and pays for it', () => {
    const grid = createOctilinearGrid([
      { x: 0, y: 0 },
      { x: 1000, y: 1000 },
    ]);
    const row = grid.snap({ x: 0, y: 500 });
    const from = row;
    const to = grid.snap({ x: 1000, y: 500 });
    // Wall off every cell off that row: the row is the only corridor.
    const rowY = grid.point(row).y;
    const blocked = new Set<number>();
    for (let c = 0; c < grid.cellCount; c++) {
      if (Math.abs(grid.point(c).y - rowY) > 1e-6) blocked.add(c);
    }
    const next = grid
      .neighbors(from)
      .find((s) => Math.abs(grid.point(s.cell).y - rowY) < 1e-6)!.cell;
    const usedSteps = new Set([gridStepKey(grid, from, next)]);
    const route = routeBetween(grid, {
      source: { cells: new Map([[from, 0]]) },
      target: { cells: new Map([[to, 0]]) },
      blocked,
      occupied: new Set(),
      usedSteps,
    });
    expect(route).not.toBeNull();
    expect(route?.[1]).toBe(next);
  });

  it('counts a stretch two corridors share, so a forced case is never silent', () => {
    const corridor = (
      edgeId: string,
      points: [number, number][],
    ): SchematicLayout['corridors'][number] => ({
      edgeId,
      points: points.map(([x, y]) => ({ x, y })),
      slots: [],
    });
    const shared: SchematicLayout = {
      bounds: { width: 100, height: 100 },
      corridors: [
        corridor('e1', [
          [0, 0],
          [40, 0],
        ]),
        // Overlaps e1 from x = 20 to 40, then turns away.
        corridor('e2', [
          [20, 0],
          [60, 0],
          [60, 30],
        ]),
        // Parallel to e1 but a row away: not shared.
        corridor('e3', [
          [0, 10],
          [40, 10],
        ]),
      ],
      segments: [],
      connectors: [],
      stations: [],
    };
    expect(sharedCenterlineRuns(shared)).toEqual({ pairs: 1, length: 20 });
  });

  it('does not cross a used diagonal in an X when two steps go round it', () => {
    const grid = createOctilinearGrid([
      { x: 0, y: 0 },
      { x: 1000, y: 1000 },
    ]);
    const a = grid.snap({ x: 500, y: 500 });
    const right = grid.neighbors(a).find((s) => s.dir === 0)!.cell;
    const down = grid.neighbors(a).find((s) => s.dir === 2)!.cell;
    const diagonal = grid.neighbors(a).find((s) => s.dir === 1)!.cell;
    // (a → diagonal) is used; (right → down) is the other diagonal of the square.
    const usedSteps = new Set([gridStepKey(grid, a, diagonal)]);
    expect(grid.crossing?.(right, down)).toBeTruthy();
    const route = routeBetween(grid, {
      source: { cells: new Map([[right, 0]]) },
      target: { cells: new Map([[down, 0]]) },
      blocked: new Set(),
      occupied: new Set(),
      usedSteps,
    });
    expect(route?.length).toBeGreaterThan(2);
  });
});

describe('turns at nodes (Story 4.10)', () => {
  it('prices a turn at a node like a bend inside a corridor', () => {
    const arrive = [0];
    const cost = (degrees: number): number =>
      nodeTurnCost(arrive, (degrees * Math.PI) / 180, 1);
    expect(cost(0)).toBe(bendCost(0));
    expect(cost(0)).toBeLessThan(cost(45));
    expect(cost(45)).toBeLessThan(cost(90));
    expect(cost(90)).toBeLessThan(cost(135));
    expect(cost(135)).toBeLessThan(cost(180));
    // No arriving line, no cost.
    expect(nodeTurnCost([], Math.PI / 2, 1)).toBe(0);
  });

  it('keeps a line straight through a junction', () => {
    // Line L runs a → b → c, bending 45° at b; M branches off at b. Without
    // the turn L pays at b, the second corridor leaves b diagonally and L
    // zigzags; with it, it leaves straight on and bends further along.
    const city = makeCityData({
      roadNodes: [
        node('a', 0, 0),
        node('b', 1000, 0),
        node('c', 1500, 500),
        node('d', 1000, 1000),
      ],
      roadSegments: [
        makeRoadSegment({ id: 'ab', startNodeId: 'a', endNodeId: 'b' }),
        makeRoadSegment({ id: 'bc', startNodeId: 'b', endNodeId: 'c' }),
        makeRoadSegment({ id: 'bd', startNodeId: 'b', endNodeId: 'd' }),
      ],
      transitLines: [
        makeTransitLine({ id: 'L', route: [{ segmentIds: ['ab', 'bc'] }] }),
        makeTransitLine({ id: 'M', route: [{ segmentIds: ['bd'] }] }),
      ],
    });
    const network = deriveTransitNetwork(city);
    const layout = octilinearSchematicLayout(network);
    const turns = countNodeTurns(routedOf(network, layout), layout);
    expect(turns.straight).toBe(1);
    expect(turns.bend135 + turns.reverse).toBe(0);
  });

  it('charges nothing between corridors no line passes between', () => {
    // Same geometry, but L ends at b and N starts there: no transition.
    const city = makeCityData({
      roadNodes: [
        node('a', 0, 0),
        node('b', 1000, 0),
        node('c', 2000, 300),
        node('d', 1000, 1000),
      ],
      roadSegments: [
        makeRoadSegment({ id: 'ab', startNodeId: 'a', endNodeId: 'b' }),
        makeRoadSegment({ id: 'bc', startNodeId: 'b', endNodeId: 'c' }),
        makeRoadSegment({ id: 'bd', startNodeId: 'b', endNodeId: 'd' }),
      ],
      transitLines: [
        makeTransitLine({ id: 'L', route: [{ segmentIds: ['ab'] }] }),
        makeTransitLine({ id: 'N', route: [{ segmentIds: ['bc'] }] }),
        makeTransitLine({ id: 'M', route: [{ segmentIds: ['bd'] }] }),
      ],
    });
    const network = deriveTransitNetwork(city);
    expect(network.transitions).toEqual([]);
    const layout = octilinearSchematicLayout(network);
    const turns = countNodeTurns(network, layout);
    expect(Object.values(turns).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('circular order at a node (octi §4.3)', () => {
  it('leaves a node in the same circular order as the geography', () => {
    // Skewed arms of unequal length: without the port reservation of §4.3,
    // the orthoradial grid swaps two of them.
    const network = deriveTransitNetwork(
      starCity(
        [80, 136, 130, 224, 258],
        [
          [0, 2],
          [1, 3],
        ],
        0.3,
      ),
    );
    for (const strategy of [
      octilinearSchematicLayout,
      orthoradialSchematicLayout,
    ]) {
      const layout = strategy(network);
      const routed = routedOf(network, layout);
      expect(countCircularOrderViolations(routed, layout)).toBe(0);
      expect(schematicLayoutDiagnostics(layout)?.orderViolations).toBe(0);
    }
  });
});

describe('node splitting (SSTD §2)', () => {
  const sixArms = [0, 60, 120, 180, 240, 300];

  it('splits a node of degree 6 into 3 corridors plus a synthetic one, and the rest', () => {
    const network = deriveTransitNetwork(
      starCity(sixArms, [
        [0, 3],
        [1, 4],
      ]),
    );
    const split = splitHighDegreeNodes(network, 4);
    expect(split).not.toBe(network);
    const synthetic = [...split.edges.keys()].filter(isSplitCorridorId);
    expect(synthetic).toHaveLength(1);
    const hub = split.nodes.get('hub');
    const newNode = split.nodes.get(synthetic[0]);
    expect(hub?.edgeIds).toHaveLength(4);
    expect(newNode?.edgeIds).toHaveLength(4);
    // Every transition still names a node where both its corridors end.
    for (const t of split.transitions) {
      for (const edgeId of [t.fromEdge, t.toEdge]) {
        const edge = split.edges.get(edgeId);
        expect([edge?.nodeA, edge?.nodeB]).toContain(t.nodeId);
      }
    }
    // A network within the limit comes back as the same reference.
    expect(splitHighDegreeNodes(network, 8)).toBe(network);
  });

  it('draws a degree-6 hub orthoradially with no line on top of another', () => {
    const network = deriveTransitNetwork(
      starCity(sixArms, [
        [0, 3],
        [1, 4],
      ]),
    );
    const layout = orthoradialSchematicLayout(network);
    const { metrics } = measureSchematicLayout(network, layout);
    expect(metrics.topologyPreserved).toBe(true);
    expect(metrics.brokenJunctions).toEqual([]);
    expect(metrics.sharedCenterlinePairs).toBe(0);
  });
});

describe('evenly spaced stops (octi degree-2 heuristic)', () => {
  it('spreads a corridor’s stops evenly, in order, even next to a node', () => {
    const city = makeCityData({
      roadNodes: [node('a', 0, 0), node('b', 1000, 0)],
      roadSegments: [
        makeRoadSegment({ id: 'ab', startNodeId: 'a', endNodeId: 'b' }),
      ],
      transitLines: [
        makeTransitLine({
          id: 'L',
          stops: [
            stop('near', 20, 0),
            stop('mid', 300, 0),
            stop('far', 600, 0),
          ],
          route: [{ segmentIds: ['ab'] }],
        }),
      ],
    });
    const network = deriveTransitNetwork(city);
    const layout = gridSchematicLayout(network, createOctilinearGrid);
    const corridor = layout.corridors[0];
    const reversed = corridor.points[0].x > corridor.points[1].x;
    const fractions = [...(layout.presentationInput?.stops ?? [])]
      .sort((x, y) => (x.id < y.id ? -1 : 1))
      .map((s) => [s.id, reversed ? 1 - s.fraction : s.fraction]);
    expect(Object.fromEntries(fractions)).toEqual({
      near: 0.25,
      mid: 0.5,
      far: 0.75,
    });
  });
});

describe('determinism', () => {
  it('lays the same network out the same way twice', () => {
    const network = deriveTransitNetwork(starCity([0, 60, 120, 180, 240, 300]));
    expect(octilinearSchematicLayout(network)).toEqual(
      octilinearSchematicLayout(network),
    );
    expect(orthoradialSchematicLayout(network)).toEqual(
      orthoradialSchematicLayout(network),
    );
  });
});

describe('review follow-ups', () => {
  const sixArms = [0, 60, 120, 180, 240, 300];

  it('draws every line through a split hub, crossing and ending lines alike', () => {
    const network = deriveTransitNetwork(
      starCity(sixArms, [
        [0, 3],
        [1, 4],
      ]),
    );
    const layout = orthoradialSchematicLayout(network);
    const routed = routedOf(network, layout);
    const splitId = [...routed.edges.keys()].find(isSplitCorridorId)!;
    const slotsOf = (edgeId: string): string[] =>
      layout.corridors
        .find((c) => c.edgeId === edgeId)!
        .slots.map((slot) => slot.lineId);
    // Every rewritten transition has its line on both corridors, so the
    // renderer draws its inner connection instead of skipping it.
    for (const t of routed.transitions) {
      expect(slotsOf(t.fromEdge)).toContain(t.lineId);
      expect(slotsOf(t.toEdge)).toContain(t.lineId);
    }
    // A window line that ends at the hub rides the synthetic corridor and is
    // joined to it at the new node.
    const window = routed.nodes
      .get(splitId)!
      .edgeIds.filter((id) => id !== splitId);
    for (const edgeId of window) {
      for (const lineId of slotsOf(edgeId)) {
        if (!lineId.startsWith('L')) continue;
        expect(slotsOf(splitId)).toContain(lineId);
        expect(
          routed.transitions.some(
            (t) =>
              t.lineId === lineId &&
              t.nodeId === splitId &&
              t.fromEdge === edgeId &&
              t.toEdge === splitId,
          ),
        ).toBe(true);
      }
    }
    expect(layout.segments.some((segment) => segment.edgeId === splitId)).toBe(
      true,
    );
    // Split nodes are not counted as relocated.
    expect(
      schematicLayoutDiagnostics(layout)?.relocatedNodes,
    ).toBeLessThanOrEqual(routed.nodes.size - 1);
  });

  it('counts the steps it is forced to share', () => {
    // Ten arms on an eight-port grid, without splitting: two of them have to
    // leave the hub over a step another arm already uses.
    const network = deriveTransitNetwork(
      starCity(Array.from({ length: 10 }, (_, i) => i * 36)),
    );
    const layout = gridSchematicLayout(network, createOctilinearGrid);
    expect(schematicLayoutDiagnostics(layout)?.sharedGridSteps).toBeGreaterThan(
      0,
    );
    // With splitting, nothing is forced.
    const split = octilinearSchematicLayout(network);
    expect(schematicLayoutDiagnostics(split)?.sharedGridSteps).toBe(0);
  });

  it('reaches a walled-in target through a blocked cell only when it must', () => {
    const grid = createOctilinearGrid([
      { x: 0, y: 0 },
      { x: 1000, y: 1000 },
    ]);
    const from = grid.snap({ x: 200, y: 500 });
    const to = grid.snap({ x: 800, y: 500 });
    const ring = new Set(grid.neighbors(to).map((step) => step.cell));
    const walled = (penalty?: number) =>
      routeBetween(grid, {
        source: { cells: new Map([[from, 0]]) },
        target: { cells: new Map([[to, 0]]) },
        blocked: ring,
        occupied: new Set(),
        ...(penalty === undefined ? {} : { blockedPenalty: penalty }),
      });
    // Hard walls: unreachable. Relaxed: reached, through exactly one wall.
    expect(walled()).toBeNull();
    const through = walled(40);
    expect(through).not.toBeNull();
    expect(through!.filter((cell) => ring.has(cell))).toHaveLength(1);
    // With a free detour, the relaxed search still avoids a blocked cell.
    const one = grid.neighbors(from).find((step) => step.dir === 0)!.cell;
    const detour = routeBetween(grid, {
      source: { cells: new Map([[from, 0]]) },
      target: { cells: new Map([[to, 0]]) },
      blocked: new Set([one]),
      occupied: new Set(),
      blockedPenalty: 40,
    });
    expect(detour).not.toContain(one);
  });

  it('centres the orthoradial grid on the node of highest degree', () => {
    const seeds = [
      { x: 0, y: 0 },
      { x: 900, y: 100 },
      { x: 300, y: 800 },
    ];
    const grid = createOrthoradialGrid(seeds, { degrees: [1, 4, 2] });
    expect(grid.point(0)).toEqual(seeds[1]);
    // Same degree: the node with more lines wins.
    const tie = createOrthoradialGrid(seeds, {
      degrees: [3, 3, 1],
      lineCounts: [1, 5, 9],
    });
    expect(tie.point(0)).toEqual(seeds[1]);
  });

  it('refines the grid to the requested cell size, never coarser, up to the cap', () => {
    const seeds = [
      { x: 0, y: 0 },
      { x: 1000, y: 1000 },
    ];
    const side = (cellSize?: number): number =>
      Math.round(
        Math.sqrt(
          createOctilinearGrid(
            seeds,
            cellSize === undefined ? {} : { cellSize },
          ).cellCount,
        ),
      );
    const byCount = side();
    // 1180 of extent at 20 per cell: 60 per side.
    expect(side(20)).toBe(Math.ceil(1180 / 20) + 1);
    // A huge cell never coarsens the node-count rule.
    expect(side(10_000)).toBe(byCount);
    // A tiny one stops at the cap.
    expect(side(0.1)).toBe(224);
  });

  it('returns no crossing step for a straight step', () => {
    const grid = createOctilinearGrid([
      { x: 0, y: 0 },
      { x: 1000, y: 1000 },
    ]);
    const a = grid.snap({ x: 500, y: 500 });
    const east = grid.neighbors(a).find((step) => step.dir === 0)!.cell;
    expect(grid.crossing?.(a, east)).toBeNull();
  });

  it('reads departure angles in the plane, vertical flip included', () => {
    // World +z is plane −CS1_LAT_SIGN·y.
    const angle = departureAngle(
      [
        { x: 0, z: 0 },
        { x: 0, z: 100 },
      ],
      'start',
    );
    expect(angle).toBeCloseTo(Math.atan2(-CS1_LAT_SIGN * 100, 0));
    expect(
      departureAngle(
        [
          { x: 0, z: 0 },
          { x: 100, z: 0 },
        ],
        'end',
      ),
    ).toBeCloseTo(Math.PI);
    expect(departureAngle([{ x: 0, z: 0 }], 'start')).toBeNull();
  });

  it('compares circular orders up to rotation, not reflection', () => {
    expect(sameCircularOrder(['a', 'b', 'c', 'd'], ['c', 'd', 'a', 'b'])).toBe(
      true,
    );
    expect(sameCircularOrder(['a', 'b', 'c', 'd'], ['a', 'd', 'c', 'b'])).toBe(
      false,
    );
  });
});
