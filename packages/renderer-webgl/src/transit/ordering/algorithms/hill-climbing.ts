import type { TransitLineGraph } from '../../line-graph';
import { MAX_HILL_CLIMB_PASSES } from '../constants';
import { scoreEdgeSet } from '../scoring';
import type { BundleOrderConfig } from '../types';
import { candidateOrders } from '../utils/combinatorics';

/** Local search: per-edge best-candidate moves until a local optimum. */
export function solveHillClimbing(
  graph: TransitLineGraph,
  component: string[],
  cfg: BundleOrderConfig,
): void {
  for (let pass = 0; pass < MAX_HILL_CLIMB_PASSES; pass++) {
    let improved = false;
    for (const eid of component) {
      const current = cfg.get(eid) ?? [];
      let bestOrder = current;
      let bestScore = scoreEdgeSet(graph, [eid], cfg, () => true);

      for (const cand of candidateOrders(current)) {
        cfg.set(eid, cand);
        const score = scoreEdgeSet(graph, [eid], cfg, () => true);
        if (score < bestScore) {
          bestScore = score;
          bestOrder = cand;
          improved = true;
        }
      }
      cfg.set(eid, bestOrder);
    }
    if (!improved) return;
  }
}
