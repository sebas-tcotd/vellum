import type { TransitLineGraph } from '../../line-graph';
import { scoreEdgeSet } from '../scoring';
import type { BundleOrderConfig } from '../types';
import { candidateOrders } from '../utils/combinatorics';

/**
 * Score-driven greedy settling: edges are settled outward from the highest
 * cardinality edge; each edge takes the candidate order minimizing the
 * objective restricted to already-settled neighbours.
 */
export function solveGreedy(
  graph: TransitLineGraph,
  component: string[],
  cfg: BundleOrderConfig,
): void {
  const inComponent = new Set(component);
  const settled = new Set<string>();
  const include = (eid: string): boolean =>
    !inComponent.has(eid) || settled.has(eid);

  const cardinality = (eid: string): number =>
    graph.edges.get(eid)?.bundleIds.length ?? 0;

  const remaining = new Set(component);

  const pickNext = (): string | null => {
    let bestId: string | null = null;
    let bestAdj = false;
    let bestCard = -1;

    for (const eid of [...remaining].sort()) {
      const e = graph.edges.get(eid);
      if (e === undefined) continue;

      const adj = [e.nodeA, e.nodeB].some((nid) =>
        (graph.nodes.get(nid)?.edgeIds ?? []).some((o) => settled.has(o)),
      );
      const card = cardinality(eid);

      if (
        bestId === null ||
        (adj && !bestAdj) ||
        (adj === bestAdj && card > bestCard)
      ) {
        bestId = eid;
        bestAdj = adj;
        bestCard = card;
      }
    }
    return bestId;
  };

  while (remaining.size > 0) {
    const eid = pickNext();
    if (eid === null) break;
    remaining.delete(eid);
    settled.add(eid);

    const current = cfg.get(eid) ?? [];
    let bestOrder = current;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const cand of candidateOrders(current)) {
      cfg.set(eid, cand);
      const score = scoreEdgeSet(graph, [eid], cfg, include);
      if (score < bestScore) {
        bestScore = score;
        bestOrder = cand;
      }
    }
    cfg.set(eid, bestOrder);
  }
}
