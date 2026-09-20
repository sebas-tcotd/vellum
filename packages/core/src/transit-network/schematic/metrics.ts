/**
 * Deterministic measurement of a schematic layout, plus the executable gates
 * Story 4.3 decides with.
 *
 * @remarks
 * The split between the two halves is deliberate.
 *
 * *Fidelity* is exact and binary, and it is stated against the **network**, not
 * against another layout's emission order: a stroke is identified by the
 * `(corridor, line)` pair it is supposed to draw, so a layout that paints the
 * right lines onto the wrong corridors fails instead of passing. Junction
 * coincidence is checked too — corridors that meet at a node must still meet
 * after the geometry moves — because that is what "topology preserved" means
 * once coordinates are allowed to change.
 *
 * *Legibility* is partly gated and partly comparative. Gated: station
 * separation and station-on-route, both of which have a defensible absolute
 * meaning (two symbols that overlap are unreadable; a symbol off its own line
 * is a lie). Comparative and deliberately **ungated**: {@link
 * SchematicLayoutMetrics.crossings}, {@link
 * SchematicLayoutMetrics.totalLength}, {@link
 * SchematicLayoutMetrics.relativeDisplacement} and {@link
 * SchematicLayoutMetrics.relocatedNodes}. Those four describe trade-offs a
 * schematic layout is *supposed* to make — it exists in order to move things and
 * to trade length for regularity — so any threshold on them would be a number
 * nobody derived, and a gate nobody could defend. They are evidence for the
 * Story 4.4 decision, read side by side across strategies, not pass/fail.
 *
 * Wall-clock time is kept out of the compared object so two runs of the same
 * network stay deep-equal.
 *
 * Measure the **base** layout a strategy returned. `filterSchematicLayout`
 * yields a new object holding a subset of the strokes; measuring that reports
 * every hidden line as missing, and it carries no routing diagnostics.
 */

import type { TransitNetwork } from '../../types/transit-network';
import {
  byString,
  SCHEMATIC_VIEWBOX_SIZE,
  type SchematicLayout,
  type SchematicPoint,
} from './contract';
import { geographicSchematicLayout } from './geographic';
import { schematicLayoutDiagnostics } from './grid-layout';

/** Everything measurable about a layout, and nothing that varies per run. */
export interface SchematicLayoutMetrics {
  /** Strokes drawn: one per `(corridor, line)` pair. */
  readonly segmentCount: number;
  /** Station symbols drawn. */
  readonly stationCount: number;
  /** Corridors the strategy had to route. */
  readonly routedEdges: number;
  /** Vertices across every stroke — the diagram's drawing complexity. */
  readonly vertexCount: number;
  /**
   * `true` when the layout draws exactly the strokes the network calls for, on
   * the right corridors, with every junction still joined, and exactly the
   * baseline's stations with the same line membership.
   */
  readonly topologyPreserved: boolean;
  /**
   * Strokes the network calls for that the layout fails to draw, as
   * `edgeId|lineId`. Keyed by corridor, so a stroke drawn on the wrong corridor
   * is reported rather than silently accepted.
   */
  readonly missingSegments: readonly string[];
  /**
   * Pairs of corridors that share a node in the network but no longer share an
   * endpoint in the drawing, as `nodeId|edgeA|edgeB`. This is the invariant that
   * a permutation of geometry between corridors breaks.
   */
  readonly brokenJunctions: readonly string[];
  /** Baseline stations the layout fails to draw. */
  readonly missingStations: readonly string[];
  /** Stations whose `lineIds` differ from the baseline's. */
  readonly changedMembership: readonly string[];
  /**
   * Proper intersections between stroke pieces that share no endpoint.
   *
   * @remarks
   * Comparative, ungated (see the module remarks). Counts a line crossing
   * itself and two corridors of the same line crossing each other: those are
   * just as hard to read as a crossing between two different lines.
   */
  readonly crossings: number;
  /** Total drawn stroke length, in viewBox units. Comparative, ungated. */
  readonly totalLength: number;
  /**
   * Mean distance a station moved from its baseline position, as a fraction of
   * the viewBox side. Comparative, ungated: a schematic layout is *supposed* to
   * move things, so this is read next to the crossings it buys.
   */
  readonly relativeDisplacement: number;
  /** Closest distance between two distinct stations, in viewBox units. */
  readonly minStationDistance: number;
  /** Station pairs closer together than {@link SCHEMATIC_GATES.stationSeparation}. */
  readonly tightStationPairs: number;
  /**
   * Worst distance, in viewBox units, from a station to the nearest stroke of a
   * line it actually belongs to.
   *
   * @remarks
   * The counterpart of {@link minStationDistance}: separation says two symbols
   * are distinguishable, this says each symbol is *on* the line it claims. A
   * station re-placed at the wrong arc fraction, or assigned to a corridor none
   * of its lines ride, shows up here and nowhere else.
   */
  readonly maxStationOffRoute: number;
  /** Corridors routed by the straight-on-grid fallback instead of A*. */
  readonly fallbackRoutes: number;
  /**
   * Nodes moved off their snapped cell because it was taken. Comparative,
   * ungated: relocation is the grid doing its job, not a defect.
   */
  readonly relocatedNodes: number;
}

/** Thresholds every gate is stated in. Constants, so a gate is reproducible. */
export const SCHEMATIC_GATES = {
  /** Minimum distance between two station symbols, in viewBox units. */
  stationSeparation: 6,
  /**
   * How far a station symbol may sit from its own line's stroke, in viewBox
   * units. Not zero: normalisation is floating-point, and a symbol has a radius.
   */
  stationOnRoute: 0.5,
  /** Highest share of *corridors* allowed to fall back to a straight route. */
  maxFallbackShare: 0.05,
  /** Budget for one layout of a fixture, in milliseconds. */
  maxElapsedMs: 1500,
} as const;

/** One gate's verdict. */
export interface SchematicGate {
  readonly id: string;
  readonly passed: boolean;
  /** Human-readable value/threshold, for the report. */
  readonly detail: string;
}

/** The verdict for a layout: every gate, and whether all of them held. */
export interface SchematicGateReport {
  readonly passed: boolean;
  readonly gates: readonly SchematicGate[];
}

/**
 * The strokes the network calls for, in the canonical order every strategy
 * emits them in: corridor id, then line id.
 *
 * @remarks
 * Derived from the network rather than from a reference layout on purpose. An
 * emission-order key (`lineId#occurrence`) cannot tell "line L on corridor A
 * then B" from "line L on corridor B then A"; a key that names the corridor
 * can.
 */
function expectedStrokes(
  network: TransitNetwork,
): { edgeId: string; lineId: string }[] {
  const out: { edgeId: string; lineId: string }[] = [];
  const edges = [...network.edges.values()]
    .filter((e) => e.path.length >= 2)
    .sort((a, b) => byString(a.id, b.id));
  for (const edge of edges) {
    if (
      edge.path.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z))
        .length < 2
    ) {
      continue;
    }
    const lineIds = new Set<string>();
    for (const bundleId of edge.bundleIds) {
      for (const lineId of network.bundles.get(bundleId)?.lineIds ?? []) {
        if (network.lines.has(lineId)) lineIds.add(lineId);
      }
    }
    for (const lineId of [...lineIds].sort(byString)) {
      out.push({ edgeId: edge.id, lineId });
    }
  }
  return out;
}

function lengthOf(points: readonly SchematicPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  }
  return total;
}

const EPS = 1e-9;

/** Whether two open line pieces properly cross (shared endpoints excluded). */
function crosses(
  a1: SchematicPoint,
  a2: SchematicPoint,
  b1: SchematicPoint,
  b2: SchematicPoint,
): boolean {
  const same = (p: SchematicPoint, q: SchematicPoint): boolean =>
    Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS;
  if (same(a1, b1) || same(a1, b2) || same(a2, b1) || same(a2, b2))
    return false;
  const d = (p: SchematicPoint, q: SchematicPoint, r: SchematicPoint): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(a1, a2, b1);
  const d2 = d(a1, a2, b2);
  const d3 = d(b1, b2, a1);
  const d4 = d(b1, b2, a2);
  return (
    ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
  );
}

/** Distance from `p` to the closest point of a polyline. */
function distanceToPolyline(
  p: SchematicPoint,
  points: readonly SchematicPoint[],
): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
          );
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (d < best) best = d;
  }
  // A one-point stroke still has a position to be measured against.
  return best === Infinity && points.length > 0
    ? Math.hypot(p.x - points[0].x, p.y - points[0].y)
    : best;
}

/**
 * Measures a layout against the network it came from.
 *
 * @remarks
 * The baseline for *station* comparison is the geographic projection of the
 * same network, derived here rather than passed in: fidelity must be measured
 * against the strategy that invents nothing, and a caller cannot be allowed to
 * choose a friendlier yardstick. Stroke fidelity does not need it at all — it
 * is stated against the network's own corridors.
 *
 * @param layout - The **base** layout a strategy returned, not a filtered
 *   projection of it.
 * @returns The frozen metrics, and the wall-clock time *this measurement*
 *   took. Timing lives outside the metrics object on purpose: two runs of the
 *   same network must be deep-equal, and a clock never is. The time a strategy
 *   itself takes is the caller's to measure and to hand
 *   {@link evaluateSchematicGates}.
 */
export function measureSchematicLayout(
  network: TransitNetwork,
  layout: SchematicLayout,
): { metrics: SchematicLayoutMetrics; elapsedMs: number } {
  const startedAt = performance.now();
  const base = geographicSchematicLayout(network);

  // ── Stroke fidelity, keyed by corridor. Strategies emit in the canonical
  // order, so index i of the layout is expected[i]; a mismatch at any index
  // names the `(corridor, line)` pair that is not where it should be.
  const expected = expectedStrokes(network);
  const missingSegments = expected
    .filter(
      (want, i) =>
        layout.segments[i] === undefined ||
        layout.segments[i].lineId !== want.lineId,
    )
    .map((want) => `${want.edgeId}|${want.lineId}`);

  // ── Junction coincidence: two corridors meeting at a node must still meet.
  // This is what a permutation of geometry between corridors breaks, and no
  // per-stroke check can see it.
  const pointsOfEdge = new Map<string, readonly SchematicPoint[]>();
  expected.forEach((want, i) => {
    const segment = layout.segments[i];
    if (segment !== undefined && !pointsOfEdge.has(want.edgeId)) {
      pointsOfEdge.set(want.edgeId, segment.points);
    }
  });
  const brokenJunctions: string[] = [];
  const endpointsOf = (
    points: readonly SchematicPoint[],
  ): readonly SchematicPoint[] => [points[0], points[points.length - 1]];
  const meet = (
    a: readonly SchematicPoint[],
    b: readonly SchematicPoint[],
  ): boolean =>
    endpointsOf(a).some((p) =>
      endpointsOf(b).some(
        (q) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6,
      ),
    );
  for (const nodeId of [...network.nodes.keys()].sort(byString)) {
    const incident = (network.nodes.get(nodeId)?.edgeIds ?? [])
      .filter((edgeId) => pointsOfEdge.has(edgeId))
      .sort(byString);
    for (let i = 0; i < incident.length; i++) {
      for (let j = i + 1; j < incident.length; j++) {
        const a = pointsOfEdge.get(incident[i]) as readonly SchematicPoint[];
        const b = pointsOfEdge.get(incident[j]) as readonly SchematicPoint[];
        if (!meet(a, b)) {
          brokenJunctions.push(`${nodeId}|${incident[i]}|${incident[j]}`);
        }
      }
    }
  }

  const baseStations = new Map(base.stations.map((s) => [s.id, s]));
  const ownStations = new Map(layout.stations.map((s) => [s.id, s]));
  const missingStations = [...baseStations.keys()].filter(
    (id) => !ownStations.has(id),
  );
  const changedMembership = [...baseStations.entries()]
    .filter(([id, station]) => {
      const own = ownStations.get(id);
      return (
        own !== undefined &&
        own.lineIds.join('\0') !== station.lineIds.join('\0')
      );
    })
    .map(([id]) => id);

  let vertexCount = 0;
  let totalLength = 0;
  for (const s of layout.segments) {
    vertexCount += s.points.length;
    totalLength += lengthOf(s.points);
  }

  // Crossings over every pair of stroke pieces. Fixtures are small by design,
  // so the quadratic sweep is exact and needs no spatial index to stay honest.
  // Only *adjacent* pieces of the same stroke are skipped: they share a vertex
  // by construction, so they cannot properly cross. A line crossing itself, or
  // two corridors of one line crossing, is a real crossing and is counted.
  const pieces: {
    stroke: number;
    index: number;
    a: SchematicPoint;
    b: SchematicPoint;
  }[] = [];
  layout.segments.forEach((s, stroke) => {
    for (let i = 1; i < s.points.length; i++) {
      pieces.push({ stroke, index: i, a: s.points[i - 1], b: s.points[i] });
    }
  });
  let crossings = 0;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      if (
        pieces[i].stroke === pieces[j].stroke &&
        Math.abs(pieces[i].index - pieces[j].index) === 1
      ) {
        continue;
      }
      if (crosses(pieces[i].a, pieces[i].b, pieces[j].a, pieces[j].b)) {
        crossings++;
      }
    }
  }

  let displacementSum = 0;
  let displacementCount = 0;
  for (const station of layout.stations) {
    const twin = baseStations.get(station.id);
    if (!twin) continue;
    displacementSum += Math.hypot(station.x - twin.x, station.y - twin.y);
    displacementCount++;
  }

  let minStationDistance = Infinity;
  let tightStationPairs = 0;
  for (let i = 0; i < layout.stations.length; i++) {
    for (let j = i + 1; j < layout.stations.length; j++) {
      const d = Math.hypot(
        layout.stations[i].x - layout.stations[j].x,
        layout.stations[i].y - layout.stations[j].y,
      );
      if (d < minStationDistance) minStationDistance = d;
      if (d < SCHEMATIC_GATES.stationSeparation) tightStationPairs++;
    }
  }

  // Every station must sit on a stroke of one of its own lines.
  let maxStationOffRoute = 0;
  for (const station of layout.stations) {
    const own = layout.segments.filter((s) =>
      station.lineIds.includes(s.lineId),
    );
    // A station whose lines draw nothing has no stroke to be on; that is a
    // membership defect, already reported as such, not an off-route distance.
    if (own.length === 0) continue;
    const best = Math.min(
      ...own.map((s) => distanceToPolyline(station, s.points)),
    );
    if (best > maxStationOffRoute) maxStationOffRoute = best;
  }

  const diag = schematicLayoutDiagnostics(layout);
  const elapsedMs = performance.now() - startedAt;
  const metrics: SchematicLayoutMetrics = Object.freeze({
    segmentCount: layout.segments.length,
    stationCount: layout.stations.length,
    routedEdges: diag?.routedEdges ?? pointsOfEdge.size,
    vertexCount,
    topologyPreserved:
      missingSegments.length === 0 &&
      brokenJunctions.length === 0 &&
      missingStations.length === 0 &&
      changedMembership.length === 0 &&
      layout.segments.length === expected.length &&
      layout.stations.length === base.stations.length,
    missingSegments: Object.freeze(missingSegments),
    brokenJunctions: Object.freeze(brokenJunctions),
    missingStations: Object.freeze(missingStations),
    changedMembership: Object.freeze(changedMembership),
    crossings,
    totalLength,
    relativeDisplacement:
      displacementCount === 0
        ? 0
        : displacementSum / displacementCount / SCHEMATIC_VIEWBOX_SIZE,
    minStationDistance:
      minStationDistance === Infinity ? 0 : minStationDistance,
    tightStationPairs,
    maxStationOffRoute,
    fallbackRoutes: diag?.fallbackRoutes ?? 0,
    relocatedNodes: diag?.relocatedNodes ?? 0,
  });
  return { metrics, elapsedMs };
}

/**
 * Applies the hard gates to a measured layout.
 *
 * @remarks
 * A layout that fails any gate is not published: it stays an experimental
 * spike and the geographic strategy remains the default. Nothing here falls
 * back to a softer rule — that decision belongs to the report, in words. The
 * four comparative metrics named in the module remarks are deliberately absent:
 * a gate on them would be a threshold nobody derived.
 *
 * @param metrics - Output of {@link measureSchematicLayout}.
 * @param elapsedMs - Wall-clock time of the *strategy*, gated separately
 *   because it is the one figure that is not a property of the geometry.
 *   Required, not defaulted: a caller that forgets to time its strategy must
 *   not be handed a silent pass on the performance gate.
 */
export function evaluateSchematicGates(
  metrics: SchematicLayoutMetrics,
  elapsedMs: number,
): SchematicGateReport {
  // Per *corridor*, not per stroke: `fallbackRoutes` counts routes, and a
  // corridor carrying three lines emits three strokes. Dividing by strokes
  // would under-report a fallback by its line count — understating exactly the
  // dense networks the gate exists for.
  const fallbackShare =
    metrics.routedEdges === 0
      ? 0
      : metrics.fallbackRoutes / metrics.routedEdges;
  const gates: SchematicGate[] = [
    {
      id: 'fidelity/segments',
      passed: metrics.missingSegments.length === 0,
      detail: `missing ${metrics.missingSegments.length}`,
    },
    {
      id: 'fidelity/junctions',
      passed: metrics.brokenJunctions.length === 0,
      detail: `broken ${metrics.brokenJunctions.length}`,
    },
    {
      id: 'fidelity/stations',
      passed: metrics.missingStations.length === 0,
      detail: `missing ${metrics.missingStations.length}`,
    },
    {
      id: 'fidelity/membership',
      passed: metrics.changedMembership.length === 0,
      detail: `changed ${metrics.changedMembership.length}`,
    },
    {
      id: 'legibility/stationSeparation',
      passed:
        metrics.stationCount < 2 ||
        metrics.minStationDistance >= SCHEMATIC_GATES.stationSeparation,
      detail: `min ${metrics.minStationDistance.toFixed(2)} >= ${
        SCHEMATIC_GATES.stationSeparation
      }`,
    },
    {
      id: 'legibility/stationOnRoute',
      passed: metrics.maxStationOffRoute <= SCHEMATIC_GATES.stationOnRoute,
      detail: `max ${metrics.maxStationOffRoute.toFixed(3)} <= ${
        SCHEMATIC_GATES.stationOnRoute
      }`,
    },
    {
      id: 'routing/fallbackShare',
      passed: fallbackShare <= SCHEMATIC_GATES.maxFallbackShare,
      detail: `${(fallbackShare * 100).toFixed(1)}% of ${
        metrics.routedEdges
      } corridors <= ${SCHEMATIC_GATES.maxFallbackShare * 100}%`,
    },
    {
      id: 'performance/elapsed',
      passed: elapsedMs <= SCHEMATIC_GATES.maxElapsedMs,
      detail: `${elapsedMs.toFixed(1)}ms <= ${SCHEMATIC_GATES.maxElapsedMs}ms`,
    },
  ];
  return Object.freeze({
    passed: gates.every((g) => g.passed),
    gates: Object.freeze(gates),
  });
}
