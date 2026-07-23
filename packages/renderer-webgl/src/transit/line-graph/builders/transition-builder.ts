/**
 * Route-based corridor transitions — paper §5 continuations — for
 * {@link buildTransitLineGraph}: derived from each line's actual route
 * sequence rather than corridor line-set membership, which disambiguates
 * lines that touch 3+ corridors at a node (loops, roundabouts, revisited
 * hubs).
 */

import type { CityData } from '@vellum/core';
import type { LineGraphEdge, CorridorTransition } from '../types';
import { continuationKey } from '../utils/keys';
import { getOrCreate } from '../utils/collections';

/** Result of {@link computeTransitions}. */
export interface TransitionResult {
  /** Every line-continuation transition across nodes, in route order. */
  transitions: CorridorTransition[];
  /**
   * Index for O(1) continuation lookup: key `${nodeId}\0${edgeId}\0${bundleId}`
   * → the set of corridor edge ids the bundle continues to from `edgeId`
   * across `nodeId`.
   */
  continuationIndex: Map<string, Set<string>>;
}

/**
 * Computes every line's corridor-to-corridor transitions from its route
 * order, plus the bundle-level continuation index used by the scorer. A
 * route is treated as a closed loop (CS1 lines always are) when its first
 * and last segments share a node, adding the wrap-around transition so the
 * loop-closure junction is not left with a gap.
 */
export function computeTransitions(
  cityData: CityData,
  edges: Map<string, LineGraphEdge>,
  segmentToCorridor: Map<string, string>,
  bundleOfLine: Map<string, string>,
): TransitionResult {
  const segById = new Map(
    cityData.roadSegments.map((s) => [
      s.id,
      { startNodeId: s.startNodeId, endNodeId: s.endNodeId },
    ]),
  );
  const transitions: CorridorTransition[] = [];
  const continuationIndex = new Map<string, Set<string>>();

  const addContinuation = (
    nodeId: string,
    fromEdge: string,
    toEdge: string,
    bundleId: string,
  ) => {
    const key = continuationKey(nodeId, fromEdge, bundleId);
    getOrCreate(continuationIndex, key, () => new Set()).add(toEdge);
  };

  const sortedLines = [...cityData.transitLines].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  for (const line of sortedLines) {
    const segs = line.route
      .flatMap((r) => r.segmentIds)
      .filter((s) => segById.has(s) && segmentToCorridor.has(s));

    const n = segs.length;
    if (n < 2) continue;

    const endpoints = routeEndpoints(segs, segById);
    const closed = endpoints !== null && endpoints.start === endpoints.end;
    const bundleId = bundleOfLine.get(line.id) ?? line.id;
    const boundaryCount = closed ? n : n - 1;

    for (let i = 0; i < boundaryCount; i++) {
      const segA = segs[i];
      const segB = segs[(i + 1) % n];
      const cFrom = segmentToCorridor.get(segA);
      const cTo = segmentToCorridor.get(segB);

      if (!cFrom || !cTo || cFrom === cTo) continue;

      const eFrom = edges.get(cFrom);
      const eTo = edges.get(cTo);
      if (!eFrom || !eTo) continue;

      const nodeId = sharedRoadNode(segById.get(segA)!, segById.get(segB)!);
      if (nodeId === null) continue;

      const fromEnd = terminalEnd(eFrom, segA, nodeId);
      const toEnd = terminalEnd(eTo, segB, nodeId);
      if (fromEnd === null || toEnd === null) continue;

      transitions.push({
        lineId: line.id,
        nodeId,
        fromEdge: cFrom,
        fromEnd,
        toEdge: cTo,
        toEnd,
      });
      addContinuation(nodeId, cFrom, cTo, bundleId);
      addContinuation(nodeId, cTo, cFrom, bundleId);
    }
  }

  return { transitions, continuationIndex };
}

/**
 * Which end of a corridor a road segment sits at. Returns null when the
 * segment is not a terminal of the corridor (should not happen at a
 * corridor boundary).
 */
function terminalEnd(
  edge: LineGraphEdge,
  segId: string,
  nodeId: string,
): 'start' | 'end' | null {
  const sids = edge.segmentIds;
  const atStart = segId === sids[0];
  const atEnd = segId === sids[sids.length - 1];

  if (atStart && atEnd) return nodeId === edge.nodeA ? 'start' : 'end';
  if (atStart) return 'start';
  if (atEnd) return 'end';
  return null;
}

/** The road node shared by two road segments, or null if they are not adjacent. */
function sharedRoadNode(
  a: { startNodeId: string; endNodeId: string },
  b: { startNodeId: string; endNodeId: string },
): string | null {
  if (a.startNodeId === b.startNodeId || a.startNodeId === b.endNodeId)
    return a.startNodeId;
  if (a.endNodeId === b.startNodeId || a.endNodeId === b.endNodeId)
    return a.endNodeId;
  return null;
}

/**
 * The true start and end road nodes of a segment route: the endpoint of the
 * first segment not shared with the second, and of the last segment not
 * shared with the previous. Returns null if adjacency cannot be resolved.
 */
function routeEndpoints(
  segs: string[],
  segById: Map<string, { startNodeId: string; endNodeId: string }>,
): { start: string; end: string } | null {
  const n = segs.length;
  const s0 = segById.get(segs[0]);
  const s1 = segById.get(segs[1]);
  const sLast = segById.get(segs[n - 1]);
  const sPrev = segById.get(segs[n - 2]);

  if (!s0 || !s1 || !sLast || !sPrev) return null;

  const shared01 = sharedRoadNode(s0, s1);
  const sharedLast = sharedRoadNode(sLast, sPrev);
  if (shared01 === null || sharedLast === null) return null;

  const start = s0.startNodeId === shared01 ? s0.endNodeId : s0.startNodeId;
  const end =
    sLast.startNodeId === sharedLast ? sLast.endNodeId : sLast.startNodeId;
  return { start, end };
}
