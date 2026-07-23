/**
 * MLNCM-S objective scoring.
 *
 * @remarks
 * Crossing model (derived from the paper's node-area geometry, Fig. 4): with
 * `seen(e, v)` = the edge's stored order as seen looking outward from node v
 * (stored if v is `nodeA`, reversed otherwise):
 * - Same-segment pair (A, B continue e → e'):
 *   crossing ⟺ relative seen order of A,B is equal on both edges.
 * - Different-segment pair (A → e', B → e″, Fig. 4 right): depends only on
 *   the ordering of e and the circular order of edges around v:
 *   crossing ⟺ (seenIdx(A) > seenIdx(B)) == (ccwRank(e') < ccwRank(e″)).
 * - Separation (§3.3): A,B adjacent in exactly one of e, e' while continuing
 *   together e → e'.
 *
 * Weights follow §3.4/§6: same-segment crossing 4·deg(v), different-segment
 * crossing deg(v), separation 3·deg(v). Crossings between bundles of weight
 * k₁, k₂ count k₁·k₂ physical crossings (Lemma 4.1); separations count once
 * (only the boundary pair of two adjacent bundles is separated).
 */

import type { TransitLineGraph } from '../../line-graph';
import { W_CROSS_DIFF_SEG, W_CROSS_SAME_SEG, W_SEPARATION } from '../constants';
import type { BundleOrderConfig, OrderingStats } from '../types';
import { continuationAt, seenFrom } from '../utils/graph';

/**
 * Scores all crossing/separation events at one node, considering only edges
 * accepted by `include` (used by the greedy to ignore not-yet-settled edges).
 */
export function scoreNodeAt(
  graph: TransitLineGraph,
  nodeId: string,
  cfg: BundleOrderConfig,
  include: (edgeId: string) => boolean,
  stats?: OrderingStats,
): number {
  const node = graph.nodes.get(nodeId);
  if (node === undefined) return 0;

  const deg = node.edgeIds.length;
  if (deg < 2) return 0;

  const rank = new Map(node.edgeIds.map((id, i) => [id, i]));
  const relRank = (from: string, to: string): number => {
    const a = rank.get(from) ?? 0;
    const b = rank.get(to) ?? 0;
    return (b - a + deg) % deg;
  };

  let score = 0;
  const weightOf = (bundleId: string): number =>
    graph.bundles.get(bundleId)?.weight ?? 1;

  for (const eid of node.edgeIds) {
    if (!include(eid)) continue;
    const e = graph.edges.get(eid);
    const order = cfg.get(eid);

    if (e === undefined || order === undefined) continue;
    if (e.nodeA === e.nodeB) continue;

    const seen = seenFrom(order, e, nodeId);
    const idx = new Map(seen.map((b, i) => [b, i]));

    for (let i = 0; i < e.bundleIds.length; i++) {
      for (let j = i + 1; j < e.bundleIds.length; j++) {
        const A = e.bundleIds[i];
        const B = e.bundleIds[j];
        const contA = continuationAt(graph, nodeId, eid, A);
        const contB = continuationAt(graph, nodeId, eid, B);

        if (contA === null || contB === null) continue;

        const sA = idx.get(A) ?? 0;
        const sB = idx.get(B) ?? 0;
        const kk = weightOf(A) * weightOf(B);

        if (contA === contB) {
          if (eid > contA) continue;
          if (!include(contA)) continue;

          const eCont = graph.edges.get(contA);
          const contOrder = cfg.get(contA);
          if (eCont === undefined || contOrder === undefined) continue;

          const seenCont = seenFrom(contOrder, eCont, nodeId);
          const tA = seenCont.indexOf(A);
          const tB = seenCont.indexOf(B);
          if (tA === -1 || tB === -1) continue;

          if (sA > sB === tA > tB) {
            score += W_CROSS_SAME_SEG * deg * kk;
            if (stats) stats.sameSegCrossings += kk;
          }
          const adjHere = Math.abs(sA - sB) === 1;
          const adjThere = Math.abs(tA - tB) === 1;
          if (adjHere !== adjThere) {
            score += W_SEPARATION * deg;
            if (stats) stats.separations += 1;
          }
        } else {
          if (sA > sB === relRank(eid, contA) < relRank(eid, contB)) {
            score += W_CROSS_DIFF_SEG * deg * kk;
            if (stats) stats.diffSegCrossings += kk;
          }
        }
      }
    }
  }

  return score;
}

/** Scores a full configuration over the whole graph. */
export function scoreConfiguration(
  graph: TransitLineGraph,
  cfg: BundleOrderConfig,
): OrderingStats {
  const stats: OrderingStats = {
    score: 0,
    sameSegCrossings: 0,
    diffSegCrossings: 0,
    separations: 0,
  };

  for (const nodeId of [...graph.nodes.keys()].sort()) {
    stats.score += scoreNodeAt(graph, nodeId, cfg, () => true, stats);
  }
  return stats;
}

/** Sum of node scores over the endpoint nodes of the given edges. */
export function scoreEdgeSet(
  graph: TransitLineGraph,
  edgeIds: Iterable<string>,
  cfg: BundleOrderConfig,
  include: (edgeId: string) => boolean,
): number {
  const nodeIds = new Set<string>();

  for (const eid of edgeIds) {
    const e = graph.edges.get(eid);
    if (e === undefined) continue;
    nodeIds.add(e.nodeA);
    nodeIds.add(e.nodeB);
  }

  let score = 0;
  for (const nid of nodeIds) {
    score += scoreNodeAt(graph, nid, cfg, include);
  }
  return score;
}
