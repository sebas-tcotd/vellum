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
}

/** Builds a grid that covers the given seed positions. */
export type GridFactory = (seeds: readonly SchematicPoint[]) => GridBase;

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
  /** Paid for reusing a cell another corridor already occupies. */
  occupancyPenalty: 2.5,
  /** Hard cap on A* expansions per edge before the fallback takes over. */
  searchBudget: 60000,
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

/**
 * Shortest conformant cell path from `from` to `to`, or `null` when the search
 * budget is exhausted.
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
  const target = grid.point(to);
  // State is (cell, incoming direction): the turn penalty is not Markovian in
  // the cell alone. `dir = -1` is the start, which pays no turn.
  const dirSlots = 16;
  const stateOf = (cell: number, dir: number): number => cell * dirSlots + dir;
  const best = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  // The cell each state was *entered from* when its best-known cost was recorded.
  //
  // The bend cost is an angle, so it has to be read off real positions rather than
  // off the direction *index*, which only ever supports "same or different" — the
  // flat penalty this replaces. Reading the predecessor back out of `cameFrom` at
  // pop time was wrong: `cameFrom` is overwritten every time a cheaper `g` turns
  // up, so a state could be priced against a predecessor that no longer belongs to
  // its best path. Storing the entry cell alongside the cost keeps the two in step
  // by construction. A closed set then guarantees each state is expanded once,
  // which is what makes the pairing final rather than merely current.
  const enteredFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new Heap();
  const startState = stateOf(from, 0);
  best.set(startState, 0);
  open.push(dist(grid.point(from), target), startState);

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
    const previousPoint =
      entryCell === undefined ? null : grid.point(entryCell);
    if (cell === to) {
      const path: number[] = [];
      let cursor: number | undefined = state;
      while (cursor !== undefined) {
        path.push(Math.floor(cursor / dirSlots));
        cursor = cameFrom.get(cursor);
      }
      path.reverse();
      return path;
    }
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
      if (step.cell !== to && blocked.has(step.cell)) continue;
      let cost = step.cost;
      if (previousPoint !== null) {
        cost +=
          bendCost(
            turnAngle(previousPoint, grid.point(cell), grid.point(step.cell)),
          ) * step.cost;
      }
      if (occupied.has(step.cell)) {
        cost += GRID_ROUTER.occupancyPenalty * step.cost;
      }
      const next = stateOf(step.cell, step.dir + 1);
      if (closed.has(next)) continue;
      const tentative = g + cost;
      const known = best.get(next);
      if (known !== undefined && known <= tentative) continue;
      best.set(next, tentative);
      cameFrom.set(next, state);
      enteredFrom.set(next, cell);
      open.push(tentative + dist(grid.point(step.cell), target), next);
    }
  }
  return null;
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
  /** Nodes moved off their snapped cell because it was already taken. */
  readonly relocatedNodes: number;
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
}

/**
 * Canonical stop groups shared by every schematic strategy.
 *
 * The map and diagram both start with `transferCandidates`; this deliberately
 * does not re-run proximity grouping or introduce a second threshold.
 */
export function canonicalSchematicStops(
  network: TransitNetwork,
  drawnLines: ReadonlySet<string>,
): readonly {
  readonly id: string;
  readonly position: CsPoint;
  readonly lineIds: readonly string[];
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
  const drawn = renderSchematic({ ...input, presentationScale });
  const visibleLines = isFilteredSchematicLayout(layout)
    ? new Set(layout.segments.map((segment) => segment.lineId))
    : null;
  const rematerialized = Object.freeze({
    bounds: layout.bounds,
    corridors: layout.corridors,
    segments: Object.freeze(
      drawn.segments
        .filter(
          (segment) =>
            visibleLines === null || visibleLines.has(segment.lineId),
        )
        .map(freezeSegment),
    ),
    connectors: Object.freeze(
      drawn.connectors
        .filter(
          (segment) =>
            visibleLines === null || visibleLines.has(segment.lineId),
        )
        .map(freezeSegment),
    ),
    stations: Object.freeze(
      drawn.stations
        .filter(
          (station) =>
            visibleLines === null ||
            station.lineIds.some((lineId) => visibleLines.has(lineId)),
        )
        .map(freezeStation),
    ),
    presentationInput: input,
  });
  renderInputs.set(rematerialized, input);
  return rematerialized;
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
  });

// ─── The shared planner ──────────────────────────────────────────────────────

interface DrawableEdge {
  readonly edge: LineGraphEdge;
  /** The edge's world path with non-finite points removed. */
  readonly worldPath: readonly CsPoint[];
  /** Lines that draw a stroke over this corridor, sorted. */
  readonly lineIds: readonly string[];
  /** Total member-line weight; the routing order's primary key. */
  readonly weight: number;
}

/** Collects the exact `(edge, line)` strokes the geographic strategy draws. */
function drawableEdges(network: TransitNetwork): DrawableEdge[] {
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
    result.push({
      edge,
      worldPath,
      lineIds: [...lineIds].sort(byString),
      weight: lineIds.size,
    });
  }
  return result;
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

/**
 * Lays a network out by routing every corridor over a base grid.
 *
 * @remarks
 * The one place a schematic geometry is decided. The steps are, in order:
 *
 * 1. Keep exactly the `(edge, line)` strokes the geographic strategy draws —
 *    fidelity is a property of this list, not of the routing.
 * 2. Seed the grid with the projected positions of the line graph's nodes.
 * 3. Give every node its own free cell (deterministic relocation on collision).
 * 4. Route corridors heaviest-first (then by edge id), so the busiest bundle
 *    gets the straightest run and later ones pay the occupancy penalty.
 * 5. Move every stop onto the same arc fraction of its corridor's new route,
 *    which preserves stop order along a line by construction.
 * 6. Normalise and freeze.
 *
 * @param network - The canonical topology. Its geographic geometry is read
 *   only to seed positions and to place stops along a corridor.
 * @param createGrid - The strategy's base grid.
 */
export function gridSchematicLayout(
  network: TransitNetwork,
  createGrid: GridFactory,
): SchematicLayout {
  const drawable = drawableEdges(network);
  if (drawable.length === 0) return emptySchematicLayout();

  // ── Node seeds. A node the graph places badly still gets a position: the
  // corridor endpoint that touches it is the same point by construction.
  const seedById = new Map<string, SchematicPoint>();
  const seedFromEdge = (id: string, edge: DrawableEdge): void => {
    if (seedById.has(id)) return;
    const node = network.nodes.get(id);
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
  const grid = createGrid(
    nodeIds.map((id) => seedById.get(id) as SchematicPoint),
  );

  // ── One free cell per node. Ties break on cell index, so the choice is a
  // function of the input and nothing else.
  const cellOfNode = new Map<string, number>();
  const nodeCells = new Set<number>();
  let relocatedNodes = 0;
  for (const id of nodeIds) {
    const seed = seedById.get(id) as SchematicPoint;
    let cell = grid.snap(seed);
    if (nodeCells.has(cell)) {
      relocatedNodes++;
      let bestCell = -1;
      let bestDist = Infinity;
      for (let c = 0; c < grid.cellCount; c++) {
        if (nodeCells.has(c)) continue;
        const d = dist(grid.point(c), seed);
        if (d < bestDist) {
          bestDist = d;
          bestCell = c;
        }
      }
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
      cell = bestCell;
    }
    nodeCells.add(cell);
    cellOfNode.set(id, cell);
  }

  // ── Routing order: heaviest bundle first, then edge id.
  const routingOrder = [...drawable].sort(
    (a, b) => b.weight - a.weight || byString(a.edge.id, b.edge.id),
  );
  const occupied = new Set<number>();
  const routeByEdgeId = new Map<string, SchematicPoint[]>();
  let fallbackRoutes = 0;

  for (const d of routingOrder) {
    const from = cellOfNode.get(d.edge.nodeA) as number;
    const to = cellOfNode.get(d.edge.nodeB) as number;
    let cells: readonly number[];
    if (from === to) {
      // A ring corridor starts and ends at the same node: it needs a loop, not
      // a path. Two steps out and a conformant walk back is the smallest one
      // the grid can express.
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
      const blocked = new Set(nodeCells);
      blocked.delete(from);
      blocked.delete(to);
      const routed = routeOnGrid(grid, from, to, blocked, occupied);
      if (routed === null) {
        fallbackRoutes++;
        cells = grid.lineTo(from, to);
      } else {
        cells = routed;
      }
    }
    for (const c of cells) occupied.add(c);
    const simplified = simplifyCellPath(grid, cells);
    const points = simplified.map((c) => grid.point(c));
    // A stroke needs two points even when the grammar collapsed the route.
    routeByEdgeId.set(
      d.edge.id,
      points.length >= 2 ? points : [points[0], points[0]],
    );
  }

  // ── Corridors with slots, in the canonical order: edge id. The slots come
  // from the network's own `lineOrder`, so the diagram lays a bundle out
  // left-to-right exactly as the map does.
  const corridors: RawSchematicCorridor[] = drawable.map((d) => ({
    edgeId: d.edge.id,
    nodeA: d.edge.nodeA,
    nodeB: d.edge.nodeB,
    points: routeByEdgeId.get(d.edge.id) as SchematicPoint[],
    slots: corridorSlots(network.lineOrder.get(d.edge.id), d.lineIds),
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
  const stops: RawSchematicStop[] = [
    ...canonicalSchematicStops(network, drawnLines),
  ]
    .sort((a, b) => byString(a.id, b.id))
    .map((stop) => {
      // Assign the stop to the corridor it really sits on, then re-place it at
      // the same fraction of that corridor's new route.
      //
      // Only corridors of the stop's *own* lines are candidates. Nearest-overall
      // would be wrong in exactly the case that matters: once the geometry has
      // moved, the closest corridor in world space may carry none of the lines
      // that call here, and the symbol would land on a stroke it does not
      // belong to — a station claiming a service the data never recorded.
      const ownEdges = drawable.filter((d) =>
        d.lineIds.some((lineId) => stop.lineIds.includes(lineId)),
      );
      // A stop whose lines draw nothing routable is not reachable from here:
      // `drawnLines` already excluded that, so this is belt and braces.
      const candidates = ownEdges.length > 0 ? ownEdges : drawable;
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
        id: stop.id,
        edgeId: edge.edge.id,
        fraction:
          bestEdge === null ? 0 : arcFractionOf(edge.worldPath, stop.position),
        lineIds: [...stop.lineIds].sort(byString),
      };
    });

  const { layout, project } = finalizeSchematicLayout(corridors, stops, {
    transitions: network.transitions,
    lines: network.lines,
  });
  diagnostics.set(layout, {
    fallbackRoutes,
    relocatedNodes,
    routedEdges: drawable.length,
    stationsClampedToNodeArea:
      schematicLayoutDiagnostics(layout)?.stationsClampedToNodeArea ?? 0,
    project,
  });
  return layout;
}
