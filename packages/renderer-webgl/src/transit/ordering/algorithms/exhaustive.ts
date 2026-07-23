import type { TransitLineGraph } from '../../line-graph';
import { scoreEdgeSet } from '../scoring';
import type { BundleOrderConfig } from '../types';
import { permutations } from '../utils/combinatorics';

/** Exhaustive optimum for a small component (paper-optimal for its subspace). */
export function solveExhaustively(
  graph: TransitLineGraph,
  component: string[],
  cfg: BundleOrderConfig,
): void {
  let best = Number.POSITIVE_INFINITY;
  let bestOrders: string[][] = component.map((eid) => cfg.get(eid) ?? []);

  const recurse = (i: number): void => {
    if (i === component.length) {
      const score = scoreEdgeSet(graph, component, cfg, () => true);
      if (score < best) {
        best = score;
        bestOrders = component.map((eid) => [...(cfg.get(eid) ?? [])]);
      }
      return;
    }
    const eid = component[i];
    const current = cfg.get(eid) ?? [];

    for (const perm of permutations(current)) {
      cfg.set(eid, perm);
      recurse(i + 1);
    }
    cfg.set(eid, current);
  };

  recurse(0);
  component.forEach((eid, i) => cfg.set(eid, bestOrders[i]));
}
