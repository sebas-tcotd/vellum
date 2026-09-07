import { continuationKey } from '../../line-graph';
import type { LineGraphEdge, TransitLineGraph } from '../../line-graph';

/** Stored order of `edge` as seen looking outward from `nodeId`. */
export function seenFrom(
  order: string[],
  edge: LineGraphEdge,
  nodeId: string,
): string[] {
  return edge.nodeA === nodeId ? order : [...order].reverse();
}

/**
 * The corridor `bundleId` continues to from `edgeId` across `nodeId`, taken
 * from the route-derived continuation index (paper §5). Returns null when the
 * bundle does not continue there, or when it continues to more than one edge
 * from `edgeId` (the line passes the node through `edgeId` more than once —
 * genuinely ambiguous for pairwise scoring, so the pair is skipped).
 */
export function continuationAt(
  graph: TransitLineGraph,
  nodeId: string,
  edgeId: string,
  bundleId: string,
): string | null {
  const set = graph.continuationIndex.get(
    continuationKey(nodeId, edgeId, bundleId),
  );
  if (set === undefined || set.size !== 1) return null;
  return [...set][0];
}
