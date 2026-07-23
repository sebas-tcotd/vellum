/**
 * Connected-component grouping — cutting rule 1 of
 * {@link buildTransitLineGraph}: edges carrying a single bundle impose no
 * ordering constraints, so components are formed over multi-bundle edges
 * only.
 */

import type { LineGraphEdge, LineGraphNode } from '../types';

/**
 * Finds connected components (via shared nodes) among edges with two or
 * more bundles.
 */
export function findConnectedComponents(
  edges: Map<string, LineGraphEdge>,
  nodes: Map<string, LineGraphNode>,
): string[][] {
  const components: string[][] = [];
  const seen = new Set<string>();

  const multi = [...edges.values()]
    .filter((e) => e.bundleIds.length >= 2)
    .map((e) => e.id)
    .sort();

  for (const start of multi) {
    if (seen.has(start)) continue;

    const comp: string[] = [];
    const queue = [start];
    seen.add(start);

    while (queue.length > 0) {
      const eid = queue.pop()!;
      comp.push(eid);

      const e = edges.get(eid);
      if (!e) continue;

      for (const nid of [e.nodeA, e.nodeB]) {
        for (const adj of nodes.get(nid)?.edgeIds ?? []) {
          const ae = edges.get(adj);
          if (ae && ae.bundleIds.length >= 2 && !seen.has(adj)) {
            seen.add(adj);
            queue.push(adj);
          }
        }
      }
    }
    comp.sort();
    components.push(comp);
  }

  return components;
}
