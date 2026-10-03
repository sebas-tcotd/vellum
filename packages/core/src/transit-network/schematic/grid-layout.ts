/**
 * The shared machinery behind every *schematic* (non-geographic) layout of
 * Story 4.3: one grid abstraction, one A* router, one node placement pass, one
 * stop transfer pass and one finaliser.
 *
 * @remarks
 * This is the LOOM/`octi` lesson (Bast, Brosi & Storandt): an octilinear
 * layout is a routing problem on a grid graph with turn and occupancy
 * penalties, and an orthoradial layout is *the same* problem on a different
 * base grid. So A*, occupancy, turn cost, node relocation and stop transfer
 * live here exactly once, and each strategy contributes only its
 * {@link GridBase}.
 *
 * Everything is pure and deterministic: no ILP, no solver, no external
 * dependency, and the same network always yields a deep-equal frozen layout.
 */

import { CS1_LAT_SIGN, type CsPoint } from '../../coordinate-transform';
import type {
  CorridorTransition,
  LineGraphEdge,
  LineInfo,
  TransitNetwork,
} from '../../types/transit-network';
import { slotOffsetIndex } from '../geometry-kit';
import { projectOnPath } from '../render-geometry/utils/vector';
import {
  byString,
  isFilteredSchematicLayout,
  SCHEMATIC_MARGIN,
  schematicDrawingReach,
  SCHEMATIC_VIEWBOX_SIZE,
  type SchematicCorridor,
  type SchematicLayout,
  type SchematicPoint,
  type SchematicSegment,
  type SchematicSlot,
  type SchematicStation,
} from './contract';
import { departureAngle, normalizeAngle } from './corridor-angles';
import { routingRank, tramRoutesFirst } from './importance';
import { isSplitCorridorId, splitHighDegreeNodes } from './node-splitting';
import { turnAngle } from './offset';
import {
  renderSchematic,
  type NodeExtent,
  type PlacedCorridor,
  type PlacedStop,
  type SchematicRenderInput,
} from './render';

// ─── Plane space ─────────────────────────────────────────────────────────────

/**
 * World → drawing plane, before normalisation into the viewBox. Identical to
 * the geographic strategy's own vertical flip (`CS1_LAT_SIGN`: +1 means CS1
 * south appears at the top), so both families of layouts share one frame.
 */
export function toPlane(p: CsPoint): SchematicPoint {
  return { x: p.x, y: -CS1_LAT_SIGN * p.z };
}

const isFinitePoint = (p: CsPoint): boolean =>
  Number.isFinite(p.x) && Number.isFinite(p.z);

const dist = (a: SchematicPoint, b: SchematicPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

// ─── The grid abstraction ────────────────────────────────────────────────────

/** One step from a cell to a neighbouring cell. */
export interface GridStep {
  /** The neighbouring cell. */
  readonly cell: number;
  /**
   * Direction index of the step. Only ever compared for equality (turn
   * penalty), so a grid may number its directions however it likes.
   */
  readonly dir: number;
  /** Euclidean length of the step in plane units — also the A* step cost. */
  readonly cost: number;
}

/**
 * A base grid: the only thing a schematic strategy has to supply.
 *
 * @remarks
 * Cells are plain integers in `[0, cellCount)`. Every path this module
 * produces is a walk over {@link neighbors} or {@link lineTo}, so a grid whose
 * steps obey a geometric grammar (multiples of 45°, arcs and radials, …) makes
 * every route obey it too — conformance is structural, never checked after
 * the fact.
 */
export interface GridBase {
  readonly cellCount: number;
  /**
   * Nominal length of one step (the cell size `D` of `octi`). Optional for
   * hand-built test grids; the planner falls back to the first step it finds.
   */
  readonly spacing?: number;
  /** Plane position of a cell. */
  point(cell: number): SchematicPoint;
  /** Legal steps out of a cell, in a deterministic order. */
  neighbors(cell: number): readonly GridStep[];
  /** The cell closest to a plane position. */
  snap(p: SchematicPoint): number;
  /**
   * A conformant cell path from `from` to `to` that ignores occupancy — the
   * fallback used when A* runs out of budget, so an edge is never dropped.
   */
  lineTo(from: number, to: number): readonly number[];
  /** Cells within `radius` of `p`, ascending. Optional; a full scan otherwise. */
  cellsNear?(p: SchematicPoint, radius: number): readonly number[];
  /**
   * The step that crosses the step `from → to` without sharing a cell — the
   * other diagonal of an octilinear square — or `null` when there is none.
   */
  crossing?(from: number, to: number): readonly [number, number] | null;
}

/**
 * What the planner knows about the seeds beyond their positions, in seed
 * order. A grid may use any of it or none.
 */
export interface GridHints {
  /**
   * Wanted cell size in plane units: {@link GRID_ROUTER.cellSizeFactor} `·`
   * the median distance between adjacent nodes (`octi` §6, Story 4.9). `null`
   * when no corridor has length.
   */
  readonly cellSize?: number | null;
  /** Ports each seed's node takes (a ring takes two). */
  readonly degrees?: readonly number[];
  /** Distinct lines at each seed's node. */
  readonly lineCounts?: readonly number[];
}

/** Builds a grid that covers the given seed positions. */
export type GridFactory = (
  seeds: readonly SchematicPoint[],
  hints?: GridHints,
) => GridBase;

// ─── Router tuning ───────────────────────────────────────────────────────────

/**
 * Cost knobs, in multiples of one step's own length. Frozen constants rather
 * than parameters: a layout has to be reproducible from the network alone.
 */
export const GRID_ROUTER = {
  /**
   * Bend cost by the *included* angle of the two steps, named the way `octi`
   * §2.1–2.2 names it: 180° is a straight continuation, 90° a right-angle
   * elbow, 0° a full reversal.
   *
   * @remarks
   * `octi` requires `c180 ≤ c135 ≤ c90 ≤ c45`, and requires it for a concrete
   * reason: with a *flat* penalty — one price for any change of direction — two
   * cheap 45° bends can cost less than the single straight step they replace, so
   * the router prefers a staircase to a straight run. That is exactly what the
   * diagonals of the previous grid produced. Ordered costs make a straight step
   * free and every detour strictly dearer, so a straight corridor can never be
   * undercut. `./grid-layout.test.ts` asserts the ordering rather than trusting
   * these literals.
   */
  turnCost: {
    /** Included 180°: dead straight. Free, and it has to be. */
    straight: 0,
    /** Included 135°: a 45° bend, the octilinear diagram's own idiom. */
    bend45: 0.6,
    /** Included 90°: a right-angle elbow. */
    bend90: 1.6,
    /** Included 45°: a hairpin-ish 135° bend. */
    bend135: 4,
    /** Included 0°: doubling back on itself. Never what a reader wants. */
    reverse: 12,
  },
  /**
   * Paid for passing through a cell another corridor already occupies: a
   * crossing, which the data may genuinely have.
   */
  occupancyPenalty: 2.5,
  /**
   * Paid for running over a grid step another corridor already uses, or over
   * the diagonal that crosses it — one line drawn on top of another (Story
   * 4.9) — and for leaving a node through a port that breaks the circular
   * order (`octi` §4.3).
   *
   * @remarks
   * `octi` closes these with ∞; SSTD §3 replaces ∞ with a weight "high enough
   * that any compliant path is cheaper", so the router always finds a route and
   * the violations can be counted. With an expansion budget it cannot be
   * astronomically high: when every route has to pay it, A* first expands
   * everything cheaper. Twenty steps is a detour no corridor should prefer to
   * sharing, and still fits the budget on San Rico.
   */
  sharedStepPenalty: 20,
  /**
   * Cost of settling a node `d` away from its seed, per plane unit: `octi`
   * §3's `(d / D) · (c_h + c_m)` with `c_h = 1` and `c_m = 0.5`, in a world
   * where one step costs `D`.
   */
  displacementCost: 1.5,
  /** Radius, in cells, of the candidate cells of a node (`octi` §6: `3·D`). */
  candidateRadius: 3,
  /**
   * Cell size as a fraction of the median distance between adjacent nodes.
   * `octi` §6 uses 0.75 of the *mean*, on networks whose degree-2 stations are
   * already contracted; ours are street junctions, far denser, and at 0.75 the
   * centre of San Rico walled its nodes in (221 shared steps, 3.5 s). At 0.5:
   * 13 shared steps, 0.68 s (ADR-0008).
   */
  cellSizeFactor: 0.5,
  /** Hard cap on A* expansions per edge before the fallback takes over. */
  searchBudget: 60000,
  /** Heuristic weight of the retry after the optimal search runs out of budget. */
  retryWeight: 4,
} as const;

/**
 * The graded bend cost of turning by `deviation` radians away from straight
 * ahead, as a multiple of the step's own length.
 *
 * @remarks
 * Snapped to the nearest 45° bucket rather than interpolated: both grids step in
 * multiples of 45° (the orthoradial one approximately, since its arc steps
 * subtend a ring-dependent angle), and a continuous cost would make the
 * ordering the papers specify depend on floating-point noise.
 */
export function bendCost(deviation: number): number {
  const degrees = (Math.abs(deviation) * 180) / Math.PI;
  const { turnCost } = GRID_ROUTER;
  if (degrees <= 22.5) return turnCost.straight;
  if (degrees <= 67.5) return turnCost.bend45;
  if (degrees <= 112.5) return turnCost.bend90;
  if (degrees <= 157.5) return turnCost.bend135;
  return turnCost.reverse;
}

// ─── A* over a grid ──────────────────────────────────────────────────────────

/** Minimal binary heap; the router is the only consumer. */
class Heap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    this.keys.push(key);
    this.values.push(value);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  pop(): number {
    const top = this.values[0];
    const lastKey = this.keys.pop() as number;
    const lastValue = this.values.pop() as number;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.values[0] = lastValue;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < this.keys.length && this.keys[l] < this.keys[best]) best = l;
        if (r < this.keys.length && this.keys[r] < this.keys[best]) best = r;
        if (best === i) break;
        this.swap(best, i);
        i = best;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const k = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = k;
    const v = this.values[a];
    this.values[a] = this.values[b];
    this.values[b] = v;
  }
}

/** One end of a route: where it may start or end, and what each choice costs. */
export interface RouteEnd {
  /**
   * Candidate cells, each with the cost of settling the node there (its
   * displacement). A settled node has exactly one, at cost 0.
   */
  readonly cells: ReadonlyMap<number, number>;
  /**
   * Extra cost of leaving (source) or entering (target) this end's cell through
   * the step to or from `neighbor`: the node's ports (`octi` §4.4 sink edges).
   */
  readonly portCost?: (cell: number, neighbor: number) => number;
}

/** Everything one corridor's search needs. */
export interface RouteRequest {
  readonly source: RouteEnd;
  readonly target: RouteEnd;
  /** Cells the route may not enter (other nodes' cells), targets excepted. */
  readonly blocked: ReadonlySet<number>;
  /** Cells another corridor passes through: allowed, priced as a crossing. */
  readonly occupied: ReadonlySet<number>;
  /** Steps ({@link gridStepKey}) another corridor already runs over. */
  readonly usedSteps?: ReadonlySet<number>;
  /**
   * When set, a blocked cell may be entered at this many step lengths extra
   * instead of never: SSTD §3's relaxation, so a node walled in by other nodes
   * is still reachable. Without it, blocked cells are hard walls.
   */
  readonly blockedPenalty?: number;
  /**
   * Multiplies the heuristic. Above 1 the search is no longer optimal but
   * expands far fewer states: the retry when the optimal search runs out of
   * budget, so a crowded corridor still gets a route that respects every other
   * one instead of the straight fallback that ignores them all.
   */
  readonly heuristicWeight?: number;
}

/** An unordered key for the step between two cells. */
export function gridStepKey(grid: GridBase, a: number, b: number): number {
  return a < b ? a * grid.cellCount + b : b * grid.cellCount + a;
}

/**
 * Cheapest conformant cell path from any source candidate to any target
 * candidate — the set-to-set search of `octi` §4.2 — or `null` when the search
 * budget is exhausted.
 *
 * @remarks
 * The cost of a path is its length, its bends, the crossings and shared steps
 * it pays for, the displacement of the cells it settles its ends on, and the
 * port costs at its ends. A path never runs *through* a target candidate: the
 * first target popped is the answer, so a target state is never expanded.
 */
export function routeBetween(
  grid: GridBase,
  request: RouteRequest,
): number[] | null {
  const { source, target, blocked, occupied } = request;
  const usedSteps = request.usedSteps;
  for (const [cell] of source.cells) {
    if (target.cells.has(cell)) return [cell];
  }
  // Heuristic: the distance to the disc around the target candidates. A step
  // costs at least its length and every penalty is non-negative, so it is
  // admissible.
  let tx = 0;
  let ty = 0;
  for (const [cell] of target.cells) {
    const p = grid.point(cell);
    tx += p.x;
    ty += p.y;
  }
  tx /= Math.max(1, target.cells.size);
  ty /= Math.max(1, target.cells.size);
  let targetRadius = 0;
  for (const [cell] of target.cells) {
    const p = grid.point(cell);
    targetRadius = Math.max(targetRadius, Math.hypot(p.x - tx, p.y - ty));
  }
  const weight = request.heuristicWeight ?? 1;
  const heuristic = (cell: number): number => {
    const p = grid.point(cell);
    return weight * Math.max(0, Math.hypot(p.x - tx, p.y - ty) - targetRadius);
  };

  // State is (cell, incoming direction): the turn penalty is not Markovian in
  // the cell alone. Direction slot 0 is a start, which pays no turn.
  const dirSlots = 16;
  const stateOf = (cell: number, dir: number): number => cell * dirSlots + dir;
  const best = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  // The cell each state was *entered from* when its best-known cost was recorded.
  //
  // The bend cost is an angle, so it has to be read off real positions rather than
  // off the direction *index*. Reading the predecessor back out of `cameFrom` at
  // pop time was wrong: `cameFrom` is overwritten every time a cheaper `g` turns
  // up, so a state could be priced against a predecessor that no longer belongs to
  // its best path. Storing the entry cell alongside the cost keeps the two in step
  // by construction, and the closed set makes the pairing final.
  const enteredFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new Heap();
  for (const [cell, cost] of [...source.cells].sort((a, b) => a[0] - b[0])) {
    const start = stateOf(cell, 0);
    best.set(start, cost);
    open.push(cost + heuristic(cell), start);
  }

  let expansions = 0;
  while (open.size > 0) {
    if (++expansions > GRID_ROUTER.searchBudget) return null;
    const state = open.pop();
    if (closed.has(state)) continue;
    closed.add(state);
    const cell = Math.floor(state / dirSlots);
    const g = best.get(state);
    if (g === undefined) continue;
    const entryCell = enteredFrom.get(state);
    if (entryCell !== undefined && target.cells.has(cell)) {
      const path: number[] = [];
      let cursor: number | undefined = state;
      while (cursor !== undefined) {
        path.push(Math.floor(cursor / dirSlots));
        cursor = cameFrom.get(cursor);
      }
      path.reverse();
      return path;
    }
    const previousPoint =
      entryCell === undefined ? null : grid.point(entryCell);
    for (const step of grid.neighbors(cell)) {
      // The state id packs `dir + 1` into `dirSlots`. A direction outside that
      // window would alias onto another cell's state, silently splicing two
      // unrelated routes together — a corrupt path is worse than no path.
      if (
        !Number.isInteger(step.dir) ||
        step.dir < 0 ||
        step.dir >= dirSlots - 1
      ) {
        throw new Error(
          `SCHEMATIC_GRID_BAD_DIRECTION: ${String(step.dir)} is outside [0, ${dirSlots - 2}]`,
        );
      }
      const arrival = target.cells.get(step.cell);
      const walled = arrival === undefined && blocked.has(step.cell);
      if (walled && request.blockedPenalty === undefined) continue;
      let cost = step.cost;
      if (walled) cost += (request.blockedPenalty as number) * step.cost;
      if (previousPoint !== null) {
        cost +=
          bendCost(
            turnAngle(previousPoint, grid.point(cell), grid.point(step.cell)),
          ) * step.cost;
      } else if (source.portCost !== undefined) {
        cost += source.portCost(cell, step.cell);
      }
      if (arrival === undefined && occupied.has(step.cell)) {
        cost += GRID_ROUTER.occupancyPenalty * step.cost;
      }
      if (usedSteps !== undefined) {
        if (usedSteps.has(gridStepKey(grid, cell, step.cell))) {
          cost += GRID_ROUTER.sharedStepPenalty * step.cost;
        }
        const crossing = grid.crossing?.(cell, step.cell) ?? null;
        if (
          crossing !== null &&
          usedSteps.has(gridStepKey(grid, crossing[0], crossing[1]))
        ) {
          cost += GRID_ROUTER.sharedStepPenalty * step.cost;
        }
      }
      if (arrival !== undefined) {
        cost += arrival + (target.portCost?.(step.cell, cell) ?? 0);
      }
      const next = stateOf(step.cell, step.dir + 1);
      if (closed.has(next)) continue;
      const tentative = g + cost;
      const known = best.get(next);
      if (known !== undefined && known <= tentative) continue;
      best.set(next, tentative);
      cameFrom.set(next, state);
      enteredFrom.set(next, cell);
      open.push(tentative + heuristic(step.cell), next);
    }
  }
  return null;
}

/**
 * Shortest conformant cell path from `from` to `to`, or `null` when the search
 * budget is exhausted: {@link routeBetween} between two fixed cells.
 *
 * @param blocked - Cells the route may not enter (other stations' cells).
 * @param occupied - Cells another corridor already uses; allowed, but priced.
 */
export function routeOnGrid(
  grid: GridBase,
  from: number,
  to: number,
  blocked: ReadonlySet<number>,
  occupied: ReadonlySet<number>,
): number[] | null {
  if (from === to) return [from];
  return routeBetween(grid, {
    source: { cells: new Map([[from, 0]]) },
    target: { cells: new Map([[to, 0]]) },
    blocked,
    occupied,
  });
}

/** Drops cells that only continue a straight run, keeping the drawn grammar. */
function simplifyCellPath(grid: GridBase, cells: readonly number[]): number[] {
  if (cells.length <= 2) return [...cells];
  const kept: number[] = [cells[0]];
  for (let i = 1; i < cells.length - 1; i++) {
    const a = grid.point(cells[i - 1]);
    const b = grid.point(cells[i]);
    const c = grid.point(cells[i + 1]);
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const scale = Math.max(1e-9, dist(a, b) * dist(b, c));
    // Collinear *and* going the same way: a reversal has to stay a vertex.
    const forward = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0;
    if (Math.abs(cross) / scale > 1e-9 || !forward) kept.push(cells[i]);
  }
  kept.push(cells[cells.length - 1]);
  return kept;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/**
 * Facts about how a layout was produced that do not belong in the drawn
 * geometry: the metrics module reads them, the renderer never sees them.
 *
 * @remarks
 * They are held in a `WeakMap` keyed by the layout *object*, so they attach to
 * exactly the value a strategy returned and are collected with it. Two
 * consequences matter to callers:
 *
 * - `filterSchematicLayout` builds a **new** object when it hides anything, and
 *   that object carries no diagnostics. Metrics are only meaningful on the
 *   unfiltered base layout anyway — a filtered view is a projection of it, not
 *   a different layout — so measure the base and filter for display.
 * - A layout that was serialised and revived loses them, and
 *   {@link schematicLayoutDiagnostics} answers `null`. Callers treat that as
 *   "not a grid layout", never as zero fallbacks.
 */
export interface SchematicLayoutDiagnostics {
  /** Edges routed by the straight-on-grid fallback instead of A*. */
  readonly fallbackRoutes: number;
  /**
   * Nodes settled on a cell other than the one their seed snaps to: displaced
   * by the set-to-set search (`octi` §4.2) or because that cell was taken.
   */
  readonly relocatedNodes: number;
  /**
   * Grid steps a route ran over although another corridor already used them
   * (or the diagonal crossing them): Story 4.9's forced cases. Zero is the goal.
   */
  readonly sharedGridSteps?: number;
  /**
   * Corridor ends that left their node through a port breaking the
   * geographic circular order (`octi` §4.3), because no compliant port was
   * cheaper.
   */
  readonly orderViolations?: number;
  /**
   * Interior route cells that are another node's cell: a line drawn across a
   * station it does not serve, the relaxed wall of SSTD §3.
   */
  readonly nodePassThroughs?: number;
  /**
   * The network the grid strategy actually laid out: the input itself, or a
   * copy with split nodes (SSTD §2). Metrics read junctions and transitions
   * off it.
   */
  readonly network?: TransitNetwork;
  /** Edges that produced at least one stroke. */
  readonly routedEdges: number;
  /**
   * Stops pulled out of a node's free area onto the drawn stroke — see
   * {@link SchematicRenderOutput.stationsClampedToNodeArea}. Recorded for every
   * layout the finaliser produced, the geographic one included: it is a fact about
   * the drawing, not about the routing.
   */
  readonly stationsClampedToNodeArea: number;
  /** Maps a pre-normalisation plane point into the layout's final viewBox. */
  readonly project: (p: SchematicPoint) => SchematicPoint;
}

const diagnostics = new WeakMap<SchematicLayout, SchematicLayoutDiagnostics>();
const renderInputs = new WeakMap<SchematicLayout, SchematicRenderInput>();

/** Diagnostics recorded for a grid layout, or `null` for any other layout. */
export function schematicLayoutDiagnostics(
  layout: SchematicLayout,
): SchematicLayoutDiagnostics | null {
  return diagnostics.get(layout) ?? null;
}

// ─── Finalisation ────────────────────────────────────────────────────────────

/**
 * A corridor a strategy placed, in plane coordinates, before normalisation.
 *
 * @remarks
 * This — not a list of strokes — is what a strategy now hands over. A stroke per
 * `(corridor, line)` sharing one polyline cannot be offset afterwards, because
 * the offset needs the corridor's slot count and order; see `./contract.ts`.
 */
export interface RawSchematicCorridor {
  readonly edgeId: string;
  readonly nodeA: string;
  readonly nodeB: string;
  /** Centerline in plane coordinates, oriented nodeA → nodeB. */
  readonly points: readonly SchematicPoint[];
  readonly slots: readonly SchematicSlot[];
}

/** A stop a strategy placed on a corridor, before normalisation. */
export interface RawSchematicStop {
  readonly id: string;
  readonly edgeId: string;
  /** Arc fraction along that corridor's centerline. */
  readonly fraction: number;
  readonly lineIds: readonly string[];
  /** The station building this stop belongs to; see {@link PlacedStop.stationKey}. */
  readonly stationKey?: string;
}

/**
 * Canonical stop groups shared by every schematic strategy.
 *
 * The map and diagram both start with `transferCandidates`; this deliberately
 * does not re-run proximity grouping or introduce a second threshold.
 *
 * `stationKey` is the one `stationId` the candidate's drawn, finite entries carry, when
 * there is exactly one: it is how the rendering stage knows that two symbols
 * are parts of the same station (Story 4.6). Absent when no entry has one, or
 * when the entries disagree.
 */
export function canonicalSchematicStops(
  network: TransitNetwork,
  drawnLines: ReadonlySet<string>,
): readonly {
  readonly id: string;
  readonly position: CsPoint;
  readonly lineIds: readonly string[];
  readonly stationKey?: string;
}[] {
  return network.transferCandidates.flatMap((candidate) => {
    const entries = candidate.stops.filter(
      (stop) => drawnLines.has(stop.lineId) && isFinitePoint(stop.position),
    );
    // Grouping may retain an invalid-position stop, while its line membership
    // is still semantically real. Read only the candidate's entries: global
    // stopId lookup can merge an unrelated platform with a repeated id.
    const lineIds = [
      ...new Set(
        [
          ...candidate.lineIds,
          ...candidate.stops.map((stop) => stop.lineId),
        ].filter((lineId) => drawnLines.has(lineId)),
      ),
    ];
    if (entries.length === 0 || lineIds.length === 0) return [];
    const stationIds = new Set(
      entries.flatMap((stop) =>
        stop.stationId === undefined ? [] : [stop.stationId],
      ),
    );
    const stationKey = stationIds.size === 1 ? [...stationIds][0] : undefined;
    const position = entries.reduce(
      (sum, stop) => ({
        x: sum.x + stop.position.x,
        y: 0,
        z: sum.z + stop.position.z,
      }),
      { x: 0, y: 0, z: 0 },
    );
    return [
      {
        id: [...entries.map((stop) => stop.stopId)].sort(byString)[0],
        position: {
          x: position.x / entries.length,
          y: 0,
          z: position.z / entries.length,
        },
        lineIds: [...lineIds].sort(byString),
        ...(stationKey === undefined ? {} : { stationKey }),
      },
    ];
  });
}

/** The network facts the rendering stage needs, gathered once per layout. */
export interface SchematicRenderContext {
  readonly transitions: readonly CorridorTransition[];
  readonly lines: ReadonlyMap<string, LineInfo>;
}

/** The empty layout: what every strategy returns when there is nothing to draw. */
export function emptySchematicLayout(): SchematicLayout {
  return Object.freeze({
    bounds: Object.freeze({
      width: SCHEMATIC_VIEWBOX_SIZE,
      height: SCHEMATIC_VIEWBOX_SIZE,
    }),
    corridors: Object.freeze([]),
    segments: Object.freeze([]),
    connectors: Object.freeze([]),
    stations: Object.freeze([]),
  });
}

/**
 * The slots of one corridor: the MLNCM-S line order, expressed as the canonical
 * signed offset indices of ADR-0004.
 *
 * @remarks
 * The order comes from `network.lineOrder`, which is what Story 3.2 already
 * optimised for the map — the diagram must not invent a second one, or the same
 * bundle would read left-to-right differently in the two views. Lines the
 * ordering does not mention (it is keyed by corridor, and a corridor can carry a
 * line the ordering never scored) are appended in id order so every drawn line
 * still gets a slot instead of silently collapsing onto index 0.
 */
export function corridorSlots(
  lineOrder: readonly string[] | undefined,
  drawableLineIds: readonly string[],
): SchematicSlot[] {
  const drawable = new Set(drawableLineIds);
  const ordered = (lineOrder ?? []).filter((lineId) => drawable.has(lineId));
  const seen = new Set(ordered);
  for (const lineId of [...drawableLineIds].sort(byString)) {
    if (!seen.has(lineId)) ordered.push(lineId);
  }
  return ordered.map((lineId, position) => ({
    lineId,
    offsetIndex: slotOffsetIndex(position, ordered.length),
  }));
}

/** Degree and widest incident bundle per node, over the corridors actually drawn. */
function nodeExtents(
  corridors: readonly RawSchematicCorridor[],
): Map<string, NodeExtent> {
  const extents = new Map<string, { degree: number; maxSlotCount: number }>();
  const touch = (nodeId: string, slotCount: number): void => {
    const current = extents.get(nodeId);
    if (current === undefined) {
      extents.set(nodeId, { degree: 1, maxSlotCount: slotCount });
      return;
    }
    current.degree++;
    current.maxSlotCount = Math.max(current.maxSlotCount, slotCount);
  };
  for (const corridor of corridors) {
    touch(corridor.nodeA, corridor.slots.length);
    // A ring touches its node once, exactly as `LineGraphNode.edgeIds` records it.
    if (corridor.nodeB !== corridor.nodeA) {
      touch(corridor.nodeB, corridor.slots.length);
    }
  }
  return extents;
}

/**
 * Normalises placed corridors into the fixed square viewBox, runs the shared
 * rendering stage over them, and deep-freezes the result.
 *
 * @remarks
 * Normalisation comes **first** and drawing second, and the order is the whole
 * point. The scale is a single uniform factor, so every angle a strategy drew
 * survives it — which is what lets an octilinear grammar be asserted on the
 * final coordinates. The offsets, trims and capsules are then applied in viewBox
 * units, so they are the same size in every city instead of shrinking with the
 * network.
 *
 * @returns The frozen layout, plus the projection it used (for diagnostics).
 */
export function finalizeSchematicLayout(
  corridors: readonly RawSchematicCorridor[],
  stops: readonly RawSchematicStop[],
  context: SchematicRenderContext,
): {
  layout: SchematicLayout;
  project: (p: SchematicPoint) => SchematicPoint;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const extend = (p: SchematicPoint): void => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  };
  for (const corridor of corridors) corridor.points.forEach(extend);
  // Nothing to bound: `minX` is still Infinity, and every projected coordinate
  // would come out NaN. An exported function has to survive being called with
  // nothing, and the empty layout is what "nothing to draw" already means.
  if (!Number.isFinite(minX)) {
    const layout = emptySchematicLayout();
    return { layout, project: (p) => Object.freeze({ x: p.x, y: p.y }) };
  }

  // The margin has to cover what the *drawing* stage will add outside the
  // centerlines, not just look tidy: the outermost slot of the widest bundle and
  // the reach of a station symbol are applied after this projection, in viewBox
  // units, so a fixed margin lets a loaded corridor on the edge of the network
  // draw its outer lines past the viewBox — where the SVG clips them without any
  // number in the layout ever leaving `bounds`.
  const maxSlotCount = corridors.reduce(
    (widest, corridor) => Math.max(widest, corridor.slots.length),
    0,
  );
  const margin = SCHEMATIC_MARGIN + schematicDrawingReach(maxSlotCount);
  const inner = Math.max(1, SCHEMATIC_VIEWBOX_SIZE - 2 * margin);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const span = Math.max(spanX, spanY);
  const scale = span > 0 ? inner / span : 1;
  // Centre the network inside the square viewBox.
  const offX = margin + (inner - spanX * scale) / 2;
  const offY = margin + (inner - spanY * scale) / 2;
  const project = (p: SchematicPoint): SchematicPoint =>
    Object.freeze({
      x: offX + (p.x - minX) * scale,
      y: offY + (p.y - minY) * scale,
    });

  const placed: PlacedCorridor[] = corridors.map((corridor) => ({
    edgeId: corridor.edgeId,
    nodeA: corridor.nodeA,
    nodeB: corridor.nodeB,
    points: corridor.points.map(project),
    slots: corridor.slots,
  }));
  const placedStops: PlacedStop[] = stops.map((stop) => ({
    id: stop.id,
    edgeId: stop.edgeId,
    fraction: stop.fraction,
    lineIds: stop.lineIds,
    ...(stop.stationKey === undefined ? {} : { stationKey: stop.stationKey }),
  }));

  const renderInput: SchematicRenderInput = {
    corridors: placed,
    stops: placedStops,
    transitions: context.transitions,
    lines: context.lines,
    nodes: nodeExtents(corridors),
  };
  const drawn = renderSchematic(renderInput);

  const layout = Object.freeze({
    bounds: Object.freeze({
      width: SCHEMATIC_VIEWBOX_SIZE,
      height: SCHEMATIC_VIEWBOX_SIZE,
    }),
    corridors: Object.freeze(drawn.corridors.map(freezeCorridor)),
    segments: Object.freeze(drawn.segments.map(freezeSegment)),
    connectors: Object.freeze(drawn.connectors.map(freezeSegment)),
    stations: Object.freeze(drawn.stations.map(freezeStation)),
    presentationInput: renderInput,
  });
  // Facts about the drawing, recorded for every layout the finaliser produced —
  // the geographic one too. A grid strategy overwrites this with its own routing
  // facts on the way out.
  diagnostics.set(layout, {
    fallbackRoutes: 0,
    relocatedNodes: 0,
    routedEdges: corridors.length,
    stationsClampedToNodeArea: drawn.stationsClampedToNodeArea,
    project,
  });
  renderInputs.set(layout, renderInput);
  return { layout, project };
}

/**
 * Rebuilds only SVG presentation geometry for a quantized camera scale.
 *
 * Strategic corridors, routes and bounds are reused verbatim; only slots,
 * node clearance and station capsules are materialized again.
 */
export function rematerializeSchematicLayout(
  layout: SchematicLayout,
  presentationScale: number,
): SchematicLayout {
  const input = layout.presentationInput ?? renderInputs.get(layout);
  if (input === undefined || presentationScale === 1) return layout;
  const visibleLineIds = visibilityOf(layout);
  return redrawFrom(layout, input, { presentationScale, visibleLineIds });
}

/**
 * The visible-line set of a layout that is a visibility projection, or
 * `undefined` for a base layout that draws everything.
 */
function visibilityOf(
  layout: SchematicLayout,
): ReadonlySet<string> | undefined {
  return isFilteredSchematicLayout(layout)
    ? new Set(layout.segments.map((segment) => segment.lineId))
    : undefined;
}

/**
 * Redraws a layout from the render input it was produced with, keeping its
 * bounds and its routed corridors. The single seam both the camera's
 * presentation scale and the visibility projection go through, so a station
 * capsule is rebuilt by the code that built it rather than filtered afterwards.
 */
function redrawFrom(
  layout: SchematicLayout,
  input: SchematicRenderInput,
  options: {
    presentationScale?: number;
    visibleLineIds?: ReadonlySet<string> | undefined;
  },
): SchematicLayout {
  const drawn = renderSchematic({
    ...input,
    ...(options.presentationScale === undefined
      ? {}
      : { presentationScale: options.presentationScale }),
    ...(options.visibleLineIds === undefined
      ? {}
      : { visibleLineIds: options.visibleLineIds }),
  });
  const redrawn = Object.freeze({
    bounds: layout.bounds,
    corridors: layout.corridors,
    segments: Object.freeze(drawn.segments.map(freezeSegment)),
    connectors: Object.freeze(drawn.connectors.map(freezeSegment)),
    stations: Object.freeze(drawn.stations.map(freezeStation)),
    presentationInput: input,
  });
  renderInputs.set(redrawn, input);
  return redrawn;
}

/**
 * Redraws `layout` with only `visibleLineIds` drawn, or `null` when the layout
 * carries no render provenance (a hand-built one) and the caller has to fall
 * back to filtering the arrays.
 */
export function projectSchematicVisibility(
  layout: SchematicLayout,
  visibleLineIds: ReadonlySet<string>,
): SchematicLayout | null {
  const input = layout.presentationInput ?? renderInputs.get(layout);
  if (input === undefined) return null;
  return redrawFrom(layout, input, { visibleLineIds });
}

/** @internal Carries render provenance through a visibility-only projection. */
export function inheritSchematicRenderInput(
  source: SchematicLayout,
  projection: SchematicLayout,
): SchematicLayout {
  const input = renderInputs.get(source);
  if (input !== undefined) renderInputs.set(projection, input);
  return projection;
}

const freezePoints = (
  points: readonly SchematicPoint[],
): readonly SchematicPoint[] =>
  Object.freeze(points.map((p) => Object.freeze({ x: p.x, y: p.y })));

const freezeSegment = (segment: SchematicSegment): SchematicSegment =>
  Object.freeze({
    lineId: segment.lineId,
    color: segment.color,
    edgeId: segment.edgeId,
    points: freezePoints(segment.points),
    ...(segment.tier === undefined ? {} : { tier: segment.tier }),
    ...(segment.dashed === true ? { dashed: true } : {}),
  });

const freezeCorridor = (corridor: SchematicCorridor): SchematicCorridor =>
  Object.freeze({
    edgeId: corridor.edgeId,
    points: freezePoints(corridor.points),
    slots: Object.freeze(
      corridor.slots.map((slot) =>
        Object.freeze({ lineId: slot.lineId, offsetIndex: slot.offsetIndex }),
      ),
    ),
  });

const freezeStation = (station: SchematicStation): SchematicStation =>
  Object.freeze({
    id: station.id,
    x: station.x,
    y: station.y,
    edgeId: station.edgeId,
    lineIds: Object.freeze([...station.lineIds]),
    shape: freezePoints(station.shape),
    confirmedTransfer: station.confirmedTransfer,
    ...(station.tier === undefined ? {} : { tier: station.tier }),
  });

// ─── The shared planner ──────────────────────────────────────────────────────

interface DrawableEdge {
  readonly edge: LineGraphEdge;
  /** The edge's world path with non-finite points removed. */
  readonly worldPath: readonly CsPoint[];
  /** Lines that draw a stroke over this corridor, sorted. */
  readonly lineIds: readonly string[];
  /**
   * Highest routing rank among the member lines (`./importance.ts`): the
   * routing order's primary key since Story 4.7.
   */
  readonly rank: number;
  /** Total member-line weight (line count); the routing order's second key. */
  readonly weight: number;
}

/** Collects the exact `(edge, line)` strokes the geographic strategy draws. */
function drawableEdges(network: TransitNetwork): DrawableEdge[] {
  // The tram rule is decided once, over the lines of the network being laid
  // out (the city or a relayout selection), so every corridor ranks a tram
  // the same way.
  const tramFirst = tramRoutesFirst(network.lines.values());
  const result: DrawableEdge[] = [];
  const edges = [...network.edges.values()]
    .filter((e) => e.path.length >= 2)
    .sort((a, b) => byString(a.id, b.id));
  for (const edge of edges) {
    const worldPath = edge.path.filter(isFinitePoint);
    if (worldPath.length < 2) continue;
    const lineIds = new Set<string>();
    for (const bundleId of edge.bundleIds) {
      for (const lineId of network.bundles.get(bundleId)?.lineIds ?? []) {
        if (network.lines.has(lineId)) lineIds.add(lineId);
      }
    }
    if (lineIds.size === 0) continue;
    let rank = 0;
    for (const lineId of lineIds) {
      const mode = network.lines.get(lineId)?.mode;
      if (mode !== undefined)
        rank = Math.max(rank, routingRank(mode, tramFirst));
    }
    result.push({
      edge,
      worldPath,
      lineIds: [...lineIds].sort(byString),
      rank,
      weight: lineIds.size,
    });
  }
  return result;
}

/**
 * The routing order: highest rank first, then heaviest corridor, then edge
 * id. With `'weight'`, the order from before Story 4.7 (rank ignored).
 */
function sortForRouting(
  drawable: readonly DrawableEdge[],
  order: 'importance' | 'weight' = 'importance',
): DrawableEdge[] {
  const byRank = order !== 'weight';
  return [...drawable].sort(
    (a, b) =>
      (byRank ? b.rank - a.rank : 0) ||
      b.weight - a.weight ||
      byString(a.edge.id, b.edge.id),
  );
}

/**
 * @internal The corridor ids of `network` in the order the grid router takes
 * them. For tests: the order is what Story 4.7 changes, and asserting it
 * directly is sturdier than inferring it from where a route happened to bend.
 */
export function schematicRoutingOrder(
  network: TransitNetwork,
  order: 'importance' | 'weight' = 'importance',
): readonly string[] {
  return sortForRouting(drawableEdges(network), order).map((d) => d.edge.id);
}

/** Cumulative arc lengths of a polyline, and its total. */
function arcTable(points: readonly SchematicPoint[]): {
  cum: number[];
  total: number;
} {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  }
  return { cum, total: cum[cum.length - 1] };
}

/**
 * Arc fraction of the point of `path` closest to `point`, measured in plane
 * space (world space in, fraction out). Shared with the geographic strategy so
 * both place a stop by the same rule.
 */
export function arcFractionOf(
  path: readonly CsPoint[],
  point: CsPoint,
): number {
  const plane = path.map(toPlane);
  const { cum, total } = arcTable(plane);
  if (total <= 0) return 0;
  const p = toPlane(point);
  let bestD = Infinity;
  let bestAt = 0;
  for (let i = 1; i < plane.length; i++) {
    const a = plane[i - 1];
    const b = plane[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
    );
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (d < bestD) {
      bestD = d;
      bestAt = cum[i - 1] + Math.sqrt(len2) * t;
    }
  }
  return bestAt / total;
}

/** Plane angle of the step from cell `a` to cell `b`. */
function stepAngle(grid: GridBase, a: number, b: number): number {
  const p = grid.point(a);
  const q = grid.point(b);
  return Math.atan2(q.y - p.y, q.x - p.x);
}

/** Signed difference `to − from`, folded into `(−π, π]`. */
function angleBetween(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * What leaving a node at plane angle `leave` costs the lines that arrive
 * there at the angles in `arrivals` (each the direction of travel *into* the
 * node): the same graded bend cost a turn inside a corridor pays, per
 * arriving corridor, as `octi` §4.4 prices its sink edges (Story 4.10).
 */
export function nodeTurnCost(
  arrivals: readonly number[],
  leave: number,
  spacing: number,
): number {
  let cost = 0;
  for (const arrive of arrivals) {
    cost += bendCost(angleBetween(arrive, leave)) * spacing;
  }
  return cost;
}

/** Median of a non-empty sorted list. */
function median(sorted: readonly number[]): number {
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Lays a network out by routing every corridor over a base grid — the
 * approximation algorithm of `octi` (Bast, Brosi & Storandt, EuroVis 2020) with
 * the relaxation of SSTD 2021.
 *
 * @remarks
 * The one place a schematic geometry is decided. The steps are, in order:
 *
 * 1. Split every node with more corridors than a cell has ports (SSTD §2).
 * 2. Keep exactly the `(edge, line)` strokes the geographic strategy draws —
 *    fidelity is a property of this list, not of the routing.
 * 3. Build the grid from the nodes' projected positions, with the cell size
 *    of `octi` §6 ({@link GRID_ROUTER.cellSizeFactor} `·` the median distance
 *    between adjacent nodes).
 * 4. Route corridors most important first (Story 4.7: the highest routing
 *    rank among their lines, then the heaviest, then edge id). A node takes its
 *    cell in the route of its first corridor, among the free cells near its
 *    seed, paying for the displacement (`octi` §4.2). Every route pays for its
 *    length, its bends, the cells it crosses, the steps it shares with an
 *    earlier route (Story 4.9), the turn its lines make at a node already used
 *    by an earlier corridor (Story 4.10, `octi` §4.4) and any port that breaks
 *    the node's geographic circular order (`octi` §4.3).
 * 5. Spread every corridor's stops evenly along its new route, in their
 *    geographic order (`octi`'s degree-2 heuristic).
 * 6. Normalise and freeze.
 *
 * @param network - The canonical topology. Its geographic geometry is read
 *   only to seed positions, order the corridors around a node and order stops.
 * @param createGrid - The strategy's base grid.
 * @param options - `maxNodeDegree`: the grid's ports per cell, above which a
 *   node is split. Internal: `routingOrder: 'weight'` restores the order from
 *   before Story 4.7 (heaviest first, then id), for the corpus evidence.
 */
export function gridSchematicLayout(
  network: TransitNetwork,
  createGrid: GridFactory,
  options: {
    readonly routingOrder?: 'importance' | 'weight';
    readonly maxNodeDegree?: number;
  } = {},
): SchematicLayout {
  const routed = splitHighDegreeNodes(
    network,
    options.maxNodeDegree ?? Infinity,
  );
  const drawable = drawableEdges(routed);
  if (drawable.length === 0) return emptySchematicLayout();

  // ── Node seeds. A node the graph places badly still gets a position: the
  // corridor endpoint that touches it is the same point by construction.
  const seedById = new Map<string, SchematicPoint>();
  const seedFromEdge = (id: string, edge: DrawableEdge): void => {
    if (seedById.has(id)) return;
    const node = routed.nodes.get(id);
    if (node && isFinitePoint(node.position)) {
      seedById.set(id, toPlane(node.position));
      return;
    }
    const world =
      edge.edge.nodeA === id
        ? edge.worldPath[0]
        : edge.worldPath[edge.worldPath.length - 1];
    seedById.set(id, toPlane(world));
  };
  for (const d of drawable) {
    seedFromEdge(d.edge.nodeA, d);
    seedFromEdge(d.edge.nodeB, d);
  }
  const nodeIds = [...seedById.keys()].sort(byString);
  const seedOf = (id: string): SchematicPoint =>
    seedById.get(id) as SchematicPoint;

  // ── Grid hints: ports and lines per node, and the cell size of `octi` §6.
  const portsByNode = new Map<string, number>();
  const linesByNode = new Map<string, Set<string>>();
  const adjacent: number[] = [];
  for (const d of drawable) {
    const ring = d.edge.nodeA === d.edge.nodeB;
    for (const id of ring ? [d.edge.nodeA] : [d.edge.nodeA, d.edge.nodeB]) {
      portsByNode.set(id, (portsByNode.get(id) ?? 0) + (ring ? 2 : 1));
      let lines = linesByNode.get(id);
      if (lines === undefined) {
        lines = new Set();
        linesByNode.set(id, lines);
      }
      for (const lineId of d.lineIds) lines.add(lineId);
    }
    if (ring || isSplitCorridorId(d.edge.id)) continue;
    const length = dist(seedOf(d.edge.nodeA), seedOf(d.edge.nodeB));
    if (length > 0) adjacent.push(length);
  }
  adjacent.sort((a, b) => a - b);
  const grid = createGrid(nodeIds.map(seedOf), {
    cellSize:
      adjacent.length > 0
        ? GRID_ROUTER.cellSizeFactor * median(adjacent)
        : null,
    degrees: nodeIds.map((id) => portsByNode.get(id) ?? 0),
    lineCounts: nodeIds.map((id) => linesByNode.get(id)?.size ?? 0),
  });
  // A hand-built grid without `spacing`: its shortest step out of cell 0, or
  // 1 when it has none, so every price below stays finite.
  const firstStep = grid
    .neighbors(0)
    .reduce((min, step) => Math.min(min, step.cost), Infinity);
  const spacing = grid.spacing ?? (Number.isFinite(firstStep) ? firstStep : 1);

  // ── The geographic circular order of the corridor ends at every node, in
  // plane angles, rings left out (`octi` §4.3).
  const geoEnds = new Map<string, { edgeId: string; angle: number }[]>();
  for (const d of drawable) {
    if (d.edge.nodeA === d.edge.nodeB) continue;
    for (const end of ['start', 'end'] as const) {
      const nodeId = end === 'start' ? d.edge.nodeA : d.edge.nodeB;
      const angle = departureAngle(d.worldPath, end);
      if (angle === null) continue;
      let list = geoEnds.get(nodeId);
      if (list === undefined) {
        list = [];
        geoEnds.set(nodeId, list);
      }
      list.push({ edgeId: d.edge.id, angle: normalizeAngle(angle) });
    }
  }
  for (const list of geoEnds.values()) {
    list.sort((a, b) => a.angle - b.angle || byString(a.edgeId, b.edgeId));
  }

  // ── Which corridor pairs a line passes between at a node (Story 4.10).
  const pairKey = (nodeId: string, a: string, b: string): string =>
    a < b ? `${nodeId}\0${a}\0${b}` : `${nodeId}\0${b}\0${a}`;
  const turningPairs = new Set<string>();
  for (const t of routed.transitions) {
    if (t.fromEdge !== t.toEdge) {
      turningPairs.add(pairKey(t.nodeId, t.fromEdge, t.toEdge));
    }
  }

  const cellOfNode = new Map<string, number>();
  const nodeOfCell = new Map<number, string>();
  const nodeCells = new Set<number>();
  const occupied = new Set<number>();
  const usedSteps = new Set<number>();
  /** Plane angle at which each routed corridor leaves each settled node. */
  const routedEnds = new Map<string, Map<string, number>>();
  let fallbackRoutes = 0;
  let sharedGridSteps = 0;
  let orderViolations = 0;
  let nodePassThroughs = 0;

  const candidateRadius = GRID_ROUTER.candidateRadius * spacing;
  /**
   * Free cells a node may settle on, with their displacement cost: not another
   * node's, not on a route (a stop there would sit on a line it does not
   * serve). With `rival`, the other end of the corridor when it is unsettled
   * too, a cell nearer the rival is left to it (the local Voronoi of §4.2).
   * With no such cell nearby, the nearest free cell anywhere, as before.
   */
  const candidatesOf = (
    id: string,
    rival: SchematicPoint | null,
    exclude: ReadonlySet<number> = new Set(),
  ): Map<number, number> => {
    const seed = seedOf(id);
    const near =
      grid.cellsNear?.(seed, candidateRadius) ??
      Array.from({ length: grid.cellCount }, (_, c) => c).filter(
        (c) => dist(grid.point(c), seed) <= candidateRadius,
      );
    const result = new Map<number, number>();
    for (const c of near) {
      if (nodeCells.has(c) || occupied.has(c) || exclude.has(c)) continue;
      const p = grid.point(c);
      const d = dist(p, seed);
      if (rival !== null && dist(p, rival) < d) continue;
      result.set(c, GRID_ROUTER.displacementCost * d + crowdingCost(id, c));
    }
    if (result.size > 0) return result;
    let bestCell = -1;
    let bestDist = Infinity;
    let anyCell = -1;
    let anyDist = Infinity;
    for (let c = 0; c < grid.cellCount; c++) {
      if (nodeCells.has(c) || exclude.has(c)) continue;
      const d = dist(grid.point(c), seed);
      if (d < anyDist) {
        anyDist = d;
        anyCell = c;
      }
      if (occupied.has(c)) continue;
      if (d < bestDist) {
        bestDist = d;
        bestCell = c;
      }
    }
    if (bestCell < 0) bestCell = anyCell;
    // No free cell at all. Two nodes sharing one would draw a single symbol
    // where the network has two stations, which is a lie about the data — so
    // this fails loudly instead of degrading quietly. A grid this module
    // builds always has more cells than seeds; reaching here means a
    // `GridFactory` under-sized itself, and the factory is what must change.
    if (bestCell < 0) {
      throw new Error(
        `SCHEMATIC_GRID_EXHAUSTED: ${grid.cellCount} cells cannot hold ${nodeIds.length} nodes`,
      );
    }
    return new Map([
      [
        bestCell,
        GRID_ROUTER.displacementCost * dist(grid.point(bestCell), seed),
      ],
    ]);
  };
  /** Ports of `cell` still free: not into another node, not on a used step. */
  const freePorts = (cell: number): number =>
    grid
      .neighbors(cell)
      .filter(
        (step) =>
          !nodeCells.has(step.cell) &&
          !usedSteps.has(gridStepKey(grid, cell, step.cell)),
      ).length;
  /**
   * What settling node `id` on `cell` costs in ports, at the relaxed price: a
   * cell with fewer free ports than the node has corridors forces a shared
   * step later, and so does taking the last free port of a settled
   * neighbour that still has corridors to route. Without this, the dense
   * centre of a city walls its nodes in (San Rico: 25 routes found no way in
   * and fell back to a straight line over everything).
   */
  const crowdingCost = (id: string, cell: number): number => {
    const price = GRID_ROUTER.sharedStepPenalty * spacing;
    let cost =
      Math.max(0, (portsByNode.get(id) ?? 0) - freePorts(cell)) * price;
    for (const step of grid.neighbors(cell)) {
      const neighbour = nodeOfCell.get(step.cell);
      if (neighbour === undefined) continue;
      const pending =
        (portsByNode.get(neighbour) ?? 0) -
        (routedEnds.get(neighbour)?.size ?? 0);
      if (pending > 0 && freePorts(step.cell) - 1 < pending) cost += price;
    }
    return cost;
  };
  const cheapest = (cells: ReadonlyMap<number, number>): number =>
    [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0][0];
  const settle = (id: string, cell: number): void => {
    cellOfNode.set(id, cell);
    nodeOfCell.set(cell, id);
    nodeCells.add(cell);
  };

  /**
   * The neighbour cells through which corridor `edgeId` may leave settled node
   * `nodeId` and keep its geographic circular order (`octi` §4.3), or `null`
   * when nothing constrains it yet.
   *
   * @remarks
   * Between the nearest routed corridor before it and the nearest after it,
   * keeping a free port for every unrouted corridor in between on each side —
   * the reservation of `octi` Fig. 8.3a, so a later corridor is never left
   * without a compliant port.
   */
  const allowedPorts = (nodeId: string, edgeId: string): Set<number> | null => {
    const ends = geoEnds.get(nodeId);
    const routedHere = routedEnds.get(nodeId);
    if (
      ends === undefined ||
      routedHere === undefined ||
      routedHere.size === 0
    ) {
      return null;
    }
    const index = ends.findIndex((end) => end.edgeId === edgeId);
    if (index < 0) return null;
    const n = ends.length;
    let before = -1;
    let freeBefore = 0;
    for (let k = 1; k < n; k++) {
      const end = ends[(index - k + n) % n];
      if (end.edgeId !== edgeId && routedHere.has(end.edgeId)) {
        before = (index - k + n) % n;
        break;
      }
      freeBefore++;
    }
    let after = -1;
    let freeAfter = 0;
    for (let k = 1; k < n; k++) {
      const end = ends[(index + k) % n];
      if (end.edgeId !== edgeId && routedHere.has(end.edgeId)) {
        after = (index + k) % n;
        break;
      }
      freeAfter++;
    }
    if (before < 0 || after < 0) return null;
    const from = routedHere.get(ends[before].edgeId) as number;
    const to = routedHere.get(ends[after].edgeId) as number;
    const span = before === after ? 2 * Math.PI : normalizeAngle(to - from);
    const cell = cellOfNode.get(nodeId) as number;
    const arc = grid
      .neighbors(cell)
      .map((step) => ({
        cell: step.cell,
        delta: normalizeAngle(stepAngle(grid, cell, step.cell) - from),
      }))
      .filter((port) => port.delta > 1e-6 && port.delta < span - 1e-6)
      .sort((a, b) => a.delta - b.delta);
    const allowed = new Set<number>();
    arc.forEach((port, i) => {
      if (i >= freeBefore && arc.length - 1 - i >= freeAfter) {
        allowed.add(port.cell);
      }
    });
    // No compliant port exists (a cell on the grid's border, or more corridors
    // than ports): there is nothing to prefer, and nothing to count.
    return allowed.size > 0 ? allowed : null;
  };

  /**
   * Port cost of corridor `edgeId` at settled node `nodeId`: the turn every
   * line makes there from an earlier corridor (Story 4.10, `octi` §4.4), and
   * the relaxed price of breaking the circular order.
   */
  const portCostAt = (
    nodeId: string,
    edgeId: string,
    allowed: ReadonlySet<number> | null,
  ): ((cell: number, neighbor: number) => number) => {
    const turning: number[] = [];
    for (const [otherId, angle] of routedEnds.get(nodeId) ?? []) {
      if (
        otherId !== edgeId &&
        turningPairs.has(pairKey(nodeId, edgeId, otherId))
      ) {
        // A line arrives along the other corridor: the reverse of its departure.
        turning.push(angle + Math.PI);
      }
    }
    return (cell, neighbor) => {
      let cost = nodeTurnCost(
        turning,
        stepAngle(grid, cell, neighbor),
        spacing,
      );
      if (allowed !== null && !allowed.has(neighbor)) {
        cost += GRID_ROUTER.sharedStepPenalty * spacing;
      }
      return cost;
    };
  };

  // ── Routing, most important first. A layer (Story 4.7) is now simply a
  // stretch of this order: its nodes settle as its corridors route, before any
  // corridor of a lower rank exists.
  const routingOrder = sortForRouting(drawable, options.routingOrder);
  const routeByEdgeId = new Map<string, SchematicPoint[]>();

  for (const d of routingOrder) {
    const a = d.edge.nodeA;
    const b = d.edge.nodeB;
    let cells: readonly number[];
    if (a === b) {
      // A ring corridor starts and ends at the same node: it needs a loop, not
      // a path. Two steps out and a conformant walk back is the smallest one
      // the grid can express.
      if (!cellOfNode.has(a)) settle(a, cheapest(candidatesOf(a, null)));
      const from = cellOfNode.get(a) as number;
      const first = grid.neighbors(from)[0];
      const second = first
        ? grid.neighbors(first.cell).find((s) => s.cell !== from)
        : undefined;
      cells =
        first && second
          ? [
              from,
              ...grid.lineTo(from, first.cell).slice(1),
              ...grid.lineTo(first.cell, second.cell).slice(1),
              ...grid.lineTo(second.cell, from).slice(1),
            ]
          : [from, from];
    } else {
      const aSettled = cellOfNode.has(a);
      const bSettled = cellOfNode.has(b);
      const sourceCells = aSettled
        ? new Map([[cellOfNode.get(a) as number, 0]])
        : candidatesOf(a, bSettled ? null : seedOf(b));
      // The rival rule leaves a tie to the source, and the source's cells are
      // never the target's: with none left, the target falls back to its own
      // nearest free cells.
      const sourceSet = new Set(sourceCells.keys());
      let targetCells = bSettled
        ? new Map([[cellOfNode.get(b) as number, 0]])
        : candidatesOf(b, aSettled ? null : seedOf(a), sourceSet);
      if (targetCells.size === 0)
        targetCells = candidatesOf(b, null, sourceSet);
      const allowedA = aSettled ? allowedPorts(a, d.edge.id) : null;
      const allowedB = bSettled ? allowedPorts(b, d.edge.id) : null;
      const blocked = new Set(nodeCells);
      for (const c of sourceCells.keys()) blocked.delete(c);
      for (const c of targetCells.keys()) blocked.delete(c);
      const request: RouteRequest = {
        source: {
          cells: sourceCells,
          ...(aSettled ? { portCost: portCostAt(a, d.edge.id, allowedA) } : {}),
        },
        target: {
          cells: targetCells,
          ...(bSettled ? { portCost: portCostAt(b, d.edge.id, allowedB) } : {}),
        },
        blocked,
        occupied,
        usedSteps,
        blockedPenalty: 2 * GRID_ROUTER.sharedStepPenalty,
      };
      const found =
        routeBetween(grid, request) ??
        routeBetween(grid, {
          ...request,
          heuristicWeight: GRID_ROUTER.retryWeight,
        });
      if (found === null) {
        fallbackRoutes++;
        cells = grid.lineTo(cheapest(sourceCells), cheapest(targetCells));
      } else {
        cells = found;
      }
      if (!aSettled) settle(a, cells[0]);
      if (!bSettled) settle(b, cells[cells.length - 1]);
      if (cells.length >= 2) {
        if (allowedA !== null && !allowedA.has(cells[1])) orderViolations++;
        if (allowedB !== null && !allowedB.has(cells[cells.length - 2])) {
          orderViolations++;
        }
      }
    }

    // Register the route: its cells, its steps, and its ports at both ends.
    for (let i = 1; i < cells.length; i++) {
      if (cells[i] === cells[i - 1]) continue;
      const key = gridStepKey(grid, cells[i - 1], cells[i]);
      const crossing = grid.crossing?.(cells[i - 1], cells[i]) ?? null;
      if (
        usedSteps.has(key) ||
        (crossing !== null &&
          usedSteps.has(gridStepKey(grid, crossing[0], crossing[1])))
      ) {
        sharedGridSteps++;
      }
    }
    for (let i = 1; i < cells.length; i++) {
      if (cells[i] !== cells[i - 1]) {
        usedSteps.add(gridStepKey(grid, cells[i - 1], cells[i]));
      }
    }
    // A route through another node's cell (the relaxed wall) draws a line
    // across a station it does not serve: never silent either.
    for (let i = 1; i < cells.length - 1; i++) {
      if (nodeCells.has(cells[i])) nodePassThroughs++;
    }
    for (const c of cells) occupied.add(c);
    if (a !== b && cells.length >= 2 && cells[0] !== cells[1]) {
      const last = cells.length - 1;
      const atA = routedEnds.get(a) ?? new Map<string, number>();
      atA.set(d.edge.id, stepAngle(grid, cells[0], cells[1]));
      routedEnds.set(a, atA);
      const atB = routedEnds.get(b) ?? new Map<string, number>();
      atB.set(d.edge.id, stepAngle(grid, cells[last], cells[last - 1]));
      routedEnds.set(b, atB);
    }
    const simplified = simplifyCellPath(grid, cells);
    const points = simplified.map((c) => grid.point(c));
    // A stroke needs two points even when the grammar collapsed the route.
    routeByEdgeId.set(
      d.edge.id,
      points.length >= 2 ? points : [points[0], points[0]],
    );
  }
  let relocatedNodes = 0;
  for (const id of nodeIds) {
    const cell = cellOfNode.get(id);
    // A split node sits a meter from its hub, so it can never take its own
    // snapped cell: counting it would only measure the splitting.
    if (isSplitCorridorId(id)) continue;
    if (cell !== undefined && cell !== grid.snap(seedOf(id))) relocatedNodes++;
  }

  // ── Corridors with slots, in the canonical order: edge id. The slots come
  // from the network's own `lineOrder`, so the diagram lays a bundle out
  // left-to-right exactly as the map does.
  const corridors: RawSchematicCorridor[] = drawable.map((d) => ({
    edgeId: d.edge.id,
    nodeA: d.edge.nodeA,
    nodeB: d.edge.nodeB,
    points: routeByEdgeId.get(d.edge.id) as SchematicPoint[],
    slots: corridorSlots(routed.lineOrder.get(d.edge.id), d.lineIds),
  }));
  if (corridors.every((c) => c.slots.length === 0)) {
    return emptySchematicLayout();
  }

  // ── Stops. Deduplicated by `stopId` exactly as the geographic strategy does:
  // the first usable position wins, but membership accumulates, so a station
  // shared by several lines survives any one of them being hidden.
  const drawnLines = new Set(
    corridors.flatMap((c) => c.slots.map((slot) => slot.lineId)),
  );
  // A split corridor is a piece of its node, not a street: no stop sits on it.
  const stopCorridors = drawable.filter((d) => !isSplitCorridorId(d.edge.id));
  const assigned = [...canonicalSchematicStops(network, drawnLines)]
    .sort((a, b) => byString(a.id, b.id))
    .map((stop) => {
      // Assign the stop to the corridor it really sits on.
      //
      // Only corridors of the stop's *own* lines are candidates. Nearest-overall
      // would be wrong in exactly the case that matters: once the geometry has
      // moved, the closest corridor in world space may carry none of the lines
      // that call here, and the symbol would land on a stroke it does not
      // belong to — a station claiming a service the data never recorded.
      const ownEdges = stopCorridors.filter((d) =>
        d.lineIds.some((lineId) => stop.lineIds.includes(lineId)),
      );
      // A stop whose lines draw nothing routable is not reachable from here:
      // `drawnLines` already excluded that, so this is belt and braces.
      const candidates =
        ownEdges.length > 0
          ? ownEdges
          : stopCorridors.length > 0
            ? stopCorridors
            : drawable;
      let bestEdge: DrawableEdge | null = null;
      let bestDist = Infinity;
      for (const d of candidates) {
        const hit = projectOnPath(stop.position, d.worldPath);
        if (hit !== null && hit.dist < bestDist) {
          bestDist = hit.dist;
          bestEdge = d;
        }
      }
      const edge = bestEdge ?? candidates[0];
      return {
        stop,
        edge,
        fraction:
          bestEdge === null ? 0 : arcFractionOf(edge.worldPath, stop.position),
      };
    });
  // Then spread them evenly along the corridor's new route, in their
  // geographic order — `octi`'s degree-2 heuristic: a schematic diagram spaces
  // its stations, it does not keep the street's spacing. Stops near an end are
  // spread too: pinning them to the node stacked distinct stations on one
  // junction (Villa Coronada: 47 symbols pulled into node areas against 8).
  const fractionOf = new Map<string, number>();
  const byEdge = new Map<string, typeof assigned>();
  for (const item of assigned) {
    const list = byEdge.get(item.edge.edge.id) ?? [];
    list.push(item);
    byEdge.set(item.edge.edge.id, list);
  }
  for (const list of byEdge.values()) {
    [...list]
      .sort((x, y) => x.fraction - y.fraction || byString(x.stop.id, y.stop.id))
      .forEach((item, i) => {
        fractionOf.set(item.stop.id, (i + 1) / (list.length + 1));
      });
  }
  const stops: RawSchematicStop[] = assigned.map(({ stop, edge }) => ({
    id: stop.id,
    edgeId: edge.edge.id,
    fraction: fractionOf.get(stop.id) ?? 0,
    lineIds: [...stop.lineIds].sort(byString),
    ...(stop.stationKey === undefined ? {} : { stationKey: stop.stationKey }),
  }));

  const { layout, project } = finalizeSchematicLayout(corridors, stops, {
    transitions: routed.transitions,
    lines: routed.lines,
  });
  diagnostics.set(layout, {
    fallbackRoutes,
    relocatedNodes,
    routedEdges: drawable.filter((d) => !isSplitCorridorId(d.edge.id)).length,
    stationsClampedToNodeArea:
      schematicLayoutDiagnostics(layout)?.stationsClampedToNodeArea ?? 0,
    sharedGridSteps,
    nodePassThroughs,
    orderViolations,
    network: routed,
    project,
  });
  return layout;
}
