/**
 * Measurements of the `octi` grid model (Stories 4.9 and 4.10), read off the
 * finished geometry rather than off the router.
 *
 * @remarks
 * Reading the drawing, not the router's bookkeeping, is deliberate: it lets the
 * same numbers be taken from a layout produced *before* these stories, which is
 * the only honest before/after. Everything here depends on the layout contract
 * and the network alone.
 */

import type { TransitNetwork } from '../../types/transit-network';
import {
  byString,
  type SchematicLayout,
  type SchematicPoint,
} from './contract';
import {
  departureAngle,
  drawnDepartureAngle,
  normalizeAngle,
  sameCircularOrder,
} from './corridor-angles';

/** Turns of a line at a node, bucketed like the router's bend costs. */
export interface NodeTurnCounts {
  readonly straight: number;
  readonly bend45: number;
  readonly bend90: number;
  readonly bend135: number;
  readonly reverse: number;
}

export interface GridModelMetrics {
  /**
   * Pairs of distinct corridors whose centerlines run over the same stretch:
   * one line drawn on top of another (Story 4.9). Zero is the goal.
   */
  readonly sharedCenterlinePairs: number;
  /** Total length of those shared stretches, in viewBox units. */
  readonly sharedCenterlineLength: number;
  /**
   * Corridor pairs a line passes between at a node, by the angle it turns
   * there (Story 4.10). Counted once per node, corridor end and corridor end.
   */
  readonly nodeTurns: NodeTurnCounts;
  /**
   * Nodes whose corridors leave in a different circular order than in the
   * geography (`octi` §4.3).
   */
  readonly circularOrderViolations: number;
}

const EPSILON = 1e-6;

/** The bucket of a turn by its deviation from straight ahead, as `bendCost` does. */
function turnBucket(deviation: number): keyof NodeTurnCounts {
  const degrees = (Math.abs(deviation) * 180) / Math.PI;
  if (degrees <= 22.5) return 'straight';
  if (degrees <= 67.5) return 'bend45';
  if (degrees <= 112.5) return 'bend90';
  if (degrees <= 157.5) return 'bend135';
  return 'reverse';
}

/** Shared stretches between distinct corridors' centerlines. */
export function sharedCenterlineRuns(layout: SchematicLayout): {
  pairs: number;
  length: number;
} {
  interface Piece {
    readonly edgeId: string;
    readonly from: number;
    readonly to: number;
  }
  // Collinear pieces share a key: canonical direction and offset of their line.
  const groups = new Map<string, Piece[]>();
  for (const corridor of layout.corridors) {
    const points = corridor.points;
    for (let i = 1; i < points.length; i++) {
      let a: SchematicPoint = points[i - 1];
      let b: SchematicPoint = points[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length <= EPSILON) continue;
      if (
        b.x < a.x - EPSILON ||
        (Math.abs(b.x - a.x) <= EPSILON && b.y < a.y)
      ) {
        [a, b] = [b, a];
      }
      const ux = (b.x - a.x) / length;
      const uy = (b.y - a.y) / length;
      const offset = -uy * a.x + ux * a.y;
      const key = `${Math.round(Math.atan2(uy, ux) * 1e4)}|${Math.round(offset * 1e3)}`;
      const along = (p: SchematicPoint): number => ux * p.x + uy * p.y;
      const piece = { edgeId: corridor.edgeId, from: along(a), to: along(b) };
      const group = groups.get(key);
      if (group) group.push(piece);
      else groups.set(key, [piece]);
    }
  }
  const pairs = new Set<string>();
  let length = 0;
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const p = group[i];
        const q = group[j];
        if (p.edgeId === q.edgeId) continue;
        const overlap = Math.min(p.to, q.to) - Math.max(p.from, q.from);
        if (overlap <= EPSILON) continue;
        length += overlap;
        pairs.add(
          p.edgeId < q.edgeId
            ? `${p.edgeId}|${q.edgeId}`
            : `${q.edgeId}|${p.edgeId}`,
        );
      }
    }
  }
  return { pairs: pairs.size, length };
}

/** {@link GridModelMetrics.nodeTurns}. */
export function countNodeTurns(
  network: TransitNetwork,
  layout: SchematicLayout,
): NodeTurnCounts {
  const pointsOf = new Map(
    layout.corridors.map((corridor) => [corridor.edgeId, corridor.points]),
  );
  const counts = { straight: 0, bend45: 0, bend90: 0, bend135: 0, reverse: 0 };
  const seen = new Set<string>();
  for (const t of network.transitions) {
    if (t.fromEdge === t.toEdge) continue;
    const key =
      t.fromEdge < t.toEdge
        ? `${t.nodeId}|${t.fromEdge}|${t.fromEnd}|${t.toEdge}|${t.toEnd}`
        : `${t.nodeId}|${t.toEdge}|${t.toEnd}|${t.fromEdge}|${t.fromEnd}`;
    if (seen.has(key)) continue;
    const from = pointsOf.get(t.fromEdge);
    const to = pointsOf.get(t.toEdge);
    if (from === undefined || to === undefined) continue;
    // Arrival: the reverse of the direction the corridor leaves the node in.
    const leaveFrom = drawnDepartureAngle(from, t.fromEnd);
    const leaveTo = drawnDepartureAngle(to, t.toEnd);
    if (leaveFrom === null || leaveTo === null) continue;
    seen.add(key);
    const arrive = leaveFrom + Math.PI;
    const deviation = Math.atan2(
      Math.sin(leaveTo - arrive),
      Math.cos(leaveTo - arrive),
    );
    counts[turnBucket(deviation)]++;
  }
  return Object.freeze(counts);
}

/** {@link GridModelMetrics.circularOrderViolations}. */
export function countCircularOrderViolations(
  network: TransitNetwork,
  layout: SchematicLayout,
): number {
  const pointsOf = new Map(
    layout.corridors.map((corridor) => [corridor.edgeId, corridor.points]),
  );
  let violations = 0;
  for (const nodeId of [...network.nodes.keys()].sort(byString)) {
    const geographic: { id: string; angle: number }[] = [];
    const drawn: { id: string; angle: number }[] = [];
    let ring = false;
    for (const edgeId of network.nodes.get(nodeId)?.edgeIds ?? []) {
      const edge = network.edges.get(edgeId);
      const points = pointsOf.get(edgeId);
      if (edge === undefined || points === undefined) continue;
      if (edge.nodeA === edge.nodeB) {
        ring = true;
        break;
      }
      const end = edge.nodeA === nodeId ? 'start' : 'end';
      const g = departureAngle(edge.path, end);
      const d = drawnDepartureAngle(points, end);
      if (g === null || d === null) continue;
      geographic.push({ id: edgeId, angle: normalizeAngle(g) });
      drawn.push({ id: edgeId, angle: normalizeAngle(d) });
    }
    if (ring || geographic.length < 3) continue;
    const order = (items: { id: string; angle: number }[]): string[] =>
      [...items]
        .sort((a, b) => a.angle - b.angle || byString(a.id, b.id))
        .map((item) => item.id);
    if (!sameCircularOrder(order(geographic), order(drawn))) violations++;
  }
  return violations;
}

/** All of {@link GridModelMetrics} in one call. */
export function measureGridModel(
  network: TransitNetwork,
  layout: SchematicLayout,
): GridModelMetrics {
  const shared = sharedCenterlineRuns(layout);
  return Object.freeze({
    sharedCenterlinePairs: shared.pairs,
    sharedCenterlineLength: shared.length,
    nodeTurns: countNodeTurns(network, layout),
    circularOrderViolations: countCircularOrderViolations(network, layout),
  });
}
