/**
 * Corridor trimming — paper §5 step 2 ("free node area") of
 * {@link buildRenderGeometry}: instead of the paper's iterative node-front
 * expansion, each corridor is trimmed back from its junction nodes by a
 * static distance derived from the widest incident bundle.
 */

import type { TransitLineGraph } from '../../line-graph';
import type { LineOrderConfig } from '../../ordering';
import { MAX_TRIM_FRACTION, NODE_PAD_M, SLOT_M } from '../config';
import type { CorridorGeometry } from '../types';
import { cutEnd, cutStart, pathLength } from '../utils/path';

/** Trims every corridor edge's centerline back from its junction nodes. */
export function buildCorridors(
  graph: TransitLineGraph,
  lineOrder: LineOrderConfig,
): Map<string, CorridorGeometry> {
  const corridors = new Map<string, CorridorGeometry>();

  for (const eid of [...graph.edges.keys()].sort()) {
    const edge = graph.edges.get(eid);
    if (!edge) continue;

    const lineIds = lineOrder.get(eid) ?? [];
    if (lineIds.length === 0) continue;

    const total = pathLength(edge.path);
    const maxTrim = total * MAX_TRIM_FRACTION;

    let trimA =
      edge.nodeA === edge.nodeB
        ? 0
        : trimDistanceAt(graph, lineOrder, edge.nodeA);
    let trimB =
      edge.nodeA === edge.nodeB
        ? 0
        : trimDistanceAt(graph, lineOrder, edge.nodeB);

    trimA = Math.min(trimA, maxTrim);
    trimB = Math.min(trimB, maxTrim);

    let path = cutStart(edge.path, trimA);
    path = cutEnd(path, trimB);

    if (path.length < 2) continue;
    corridors.set(eid, { edgeId: eid, path, lineIds });
  }

  return corridors;
}

/** Half of the widest incident bundle at the node, plus padding. */
function trimDistanceAt(
  graph: TransitLineGraph,
  lineOrder: LineOrderConfig,
  nodeId: string,
): number {
  const node = graph.nodes.get(nodeId);
  if (node === undefined || node.edgeIds.length < 2) return 0;

  let maxWidth = 0;
  for (const eid of node.edgeIds) {
    const count = lineOrder.get(eid)?.length ?? 0;
    maxWidth = Math.max(maxWidth, count * SLOT_M);
  }

  return NODE_PAD_M + maxWidth / 2;
}
