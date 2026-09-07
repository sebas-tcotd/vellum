/**
 * Corridor trimming — paper §5 step 2 ("free node area") of
 * {@link buildRenderGeometry}: instead of the paper's iterative node-front
 * expansion, each corridor is trimmed back from its junction nodes by a
 * static distance derived from the widest incident bundle.
 */

import type { TransitNetwork } from '@vellum/core';
import { MAX_TRIM_FRACTION, NODE_PAD_M, SLOT_M } from '../config';
import type { CorridorGeometry } from '../types';
import { cutEnd, cutStart, pathLength } from '../utils/path';

/** Trims every corridor edge's centerline back from its junction nodes. */
export function buildCorridors(
  network: TransitNetwork,
): Map<string, CorridorGeometry> {
  const corridors = new Map<string, CorridorGeometry>();
  const { lineOrder } = network;

  for (const eid of [...network.edges.keys()].sort()) {
    const edge = network.edges.get(eid);
    if (!edge) continue;

    const lineIds = lineOrder.get(eid) ?? [];
    if (lineIds.length === 0) continue;

    const total = pathLength(edge.path);
    const maxTrim = total * MAX_TRIM_FRACTION;

    let trimA =
      edge.nodeA === edge.nodeB ? 0 : trimDistanceAt(network, edge.nodeA);
    let trimB =
      edge.nodeA === edge.nodeB ? 0 : trimDistanceAt(network, edge.nodeB);

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
function trimDistanceAt(network: TransitNetwork, nodeId: string): number {
  const node = network.nodes.get(nodeId);
  if (node === undefined || node.edgeIds.length < 2) return 0;

  let maxWidth = 0;
  for (const eid of node.edgeIds) {
    const count = network.lineOrder.get(eid)?.length ?? 0;
    maxWidth = Math.max(maxWidth, count * SLOT_M);
  }

  return NODE_PAD_M + maxWidth / 2;
}
