/**
 * Line-ordering optimization — stage 2 of the LOOM methodology (MLNCM-S).
 *
 * @remarks
 * Implements the *metro-line node crossing minimization problem with line
 * separation penalty* of §3 of the SIGSPATIAL 2018 paper: one ordering per
 * line-graph edge, so crossings can only occur at nodes. Instead of the
 * paper's ILP we solve the same objective with exhaustive enumeration for
 * small components and a score-driven greedy + hill-climbing search for large
 * ones (the paper's §7 names local search as the natural heuristic baseline;
 * an ILP can be slotted in later behind the same scorer). The scorer *is* the
 * objective function, so correctness of orderings does not depend on any
 * orientation bookkeeping in the search — the historic double-mirror bug class
 * is structurally excluded.
 *
 * Crossing model (derived from the paper's node-area geometry, Fig. 4):
 * with `seen(e, v)` = the edge's stored order as seen looking outward from
 * node v (stored if v is `nodeA`, reversed otherwise):
 * - Same-segment pair (A, B continue e → e'):
 *   crossing ⟺ relative seen order of A,B is equal on both edges.
 * - Different-segment pair (A → e', B → e″, Fig. 4 right): depends only on the
 *   ordering of e and the circular order of edges around v:
 *   crossing ⟺ (seenIdx(A) > seenIdx(B)) == (ccwRank(e') < ccwRank(e″)).
 * - Separation (§3.3): A,B adjacent in exactly one of e, e' while continuing
 *   together e → e'.
 *
 * Weights follow §3.4/§6: same-segment crossing 4·deg(v), different-segment
 * crossing deg(v), separation 3·deg(v). Crossings between bundles of weight
 * k₁, k₂ count k₁·k₂ physical crossings (Lemma 4.1); separations count once
 * (only the boundary pair of two adjacent bundles is separated). The paper's
 * in-station weights are intentionally not applied: CSLMap stops never
 * coincide with line-graph junction nodes (they sit mid-corridor), so station
 * nodes are always degree-2 same-set nodes, which Lemma 4.2 shows can be
 * ignored by the optimizer without loss of optimality.
 */

import type { TransitMode } from '@vellum/core';
import type { LineGraphEdge, TransitLineGraph } from './line-graph';

/** Bundle ordering per edge: edge id → bundle ids left-to-right along nodeA→nodeB. */
export type BundleOrderConfig = Map<string, string[]>;

/** Expanded per-line ordering per edge (bundles laid out side by side). */
export type LineOrderConfig = Map<string, string[]>;

/** Aggregate quality metrics of an ordering (the MLNCM-S objective terms). */
export interface OrderingStats {
  /** Weighted objective value (lower is better). */
  score: number;
  /** Unweighted count of same-segment line crossings. */
  sameSegCrossings: number;
  /** Unweighted count of different-segment line crossings. */
  diffSegCrossings: number;
  /** Unweighted count of line separations. */
  separations: number;
}

/** Result of the line-ordering optimization. */
export interface LineOrderResult {
  /** Optimized bundle order per edge. */
  bundleOrder: BundleOrderConfig;
  /** Per-line order per edge (bundles expanded, for rendering offsets). */
  lineOrder: LineOrderConfig;
  /** Objective metrics of the final configuration. */
  stats: OrderingStats;
}

// Objective weights, per §6 of the paper (all further scaled by deg(v)).
const W_CROSS_SAME_SEG = 4;
const W_CROSS_DIFF_SEG = 1;
const W_SEPARATION = 3;

// Search limits.
const EXHAUSTIVE_SPACE_LIMIT = 1000;
const MAX_PERMS_PER_EDGE = 720; // 6! — above this, only adjacent swaps are tried
const MAX_HILL_CLIMB_PASSES = 8;

// Mode priority used ONLY as a deterministic tie-break for otherwise
// unconstrained orderings and for laying out lines inside a bundle.
const MODE_PRIORITY: Record<TransitMode, number> = {
  Metro: 0,
  Train: 1,
  Monorail: 2,
  Tram: 3,
  Trolleybus: 4,
  CableCar: 5,
  Ferry: 6,
  Blimp: 7,
  Bus: 8,
  Unknown: 9,
};

/** Stored order of `edge` as seen looking outward from `nodeId`. */
function seenFrom(
  order: string[],
  edge: LineGraphEdge,
  nodeId: string,
): string[] {
  return edge.nodeA === nodeId ? order : [...order].reverse();
}

/**
 * The unique other edge at `nodeId` carrying `bundleId`, or null when there is
 * none or more than one (a line passing a node several times is ambiguous —
 * documented limitation, such pairs are skipped).
 */
function continuationAt(
  graph: TransitLineGraph,
  nodeId: string,
  edgeId: string,
  bundleId: string,
): string | null {
  const node = graph.nodes.get(nodeId);
  if (node === undefined) return null;
  let found: string | null = null;
  for (const other of node.edgeIds) {
    if (other === edgeId) continue;
    const e = graph.edges.get(other);
    if (e !== undefined && e.bundleIds.includes(bundleId)) {
      if (found !== null) return null;
      found = other;
    }
  }
  return found;
}

/**
 * Scores all crossing/separation events at one node, considering only edges
 * accepted by `include` (used by the greedy to ignore not-yet-settled edges).
 */
function scoreNodeAt(
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
    if (e.nodeA === e.nodeB) continue; // isolated ring — no interactions
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
          // Same-segment pair: score once per unordered edge pair — anchor on
          // the lexicographically smaller edge id to avoid double counting.
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
          // Different-segment pair: depends only on this edge's ordering and
          // the circular order of the continuation edges (paper Fig. 4 right).
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

/** Deterministic fallback comparator: mode priority, then id. */
function defaultBundleOrder(
  graph: TransitLineGraph,
  edge: LineGraphEdge,
): string[] {
  const prio = (bundleId: string): number => {
    const bundle = graph.bundles.get(bundleId);
    const rep = bundle?.lineIds[0];
    const mode = rep !== undefined ? graph.lines.get(rep)?.mode : undefined;
    return MODE_PRIORITY[mode ?? 'Unknown'];
  };
  return [...edge.bundleIds].sort((a, b) => {
    const pa = prio(a);
    const pb = prio(b);
    return pa !== pb ? pa - pb : a.localeCompare(b);
  });
}

/** Heap's algorithm — yields all permutations of `items` (small n only). */
function* permutations(items: string[]): Generator<string[]> {
  const arr = [...items];
  const c = new Array<number>(arr.length).fill(0);
  yield [...arr];
  let i = 0;
  while (i < arr.length) {
    if (c[i] < i) {
      const swap = i % 2 === 0 ? 0 : c[i];
      [arr[swap], arr[i]] = [arr[i], arr[swap]];
      yield [...arr];
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** Candidate orderings for one edge: all permutations, or adjacent swaps of the current order for large bundles. */
function candidateOrders(current: string[]): string[][] {
  if (factorial(current.length) <= MAX_PERMS_PER_EDGE) {
    return [...permutations(current)];
  }
  const cands: string[][] = [current];
  for (let i = 0; i + 1 < current.length; i++) {
    const swapped = [...current];
    [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
    cands.push(swapped);
  }
  return cands;
}

/** Sum of node scores over the endpoint nodes of the given edges. */
function scoreEdgeSet(
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

/** Exhaustive optimum for a small component (paper-optimal for its subspace). */
function exhaustiveComponent(
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

/**
 * Score-driven greedy settling: edges are settled outward from the highest
 * cardinality edge; each edge takes the candidate order minimizing the
 * objective restricted to already-settled neighbours.
 */
function greedyComponent(
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

/** Local search: per-edge best-candidate moves until a local optimum. */
function hillClimbComponent(
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

/**
 * Computes the line ordering for the whole graph: exhaustive for small
 * components, greedy + hill climbing for large ones, then expands bundles
 * back to per-line orderings (Lemma 4.1 expansion).
 */
export function computeLineOrder(graph: TransitLineGraph): LineOrderResult {
  const cfg: BundleOrderConfig = new Map();
  for (const eid of [...graph.edges.keys()].sort()) {
    const e = graph.edges.get(eid);
    if (e !== undefined) cfg.set(eid, defaultBundleOrder(graph, e));
  }

  for (const component of graph.components) {
    let space = 1;
    for (const eid of component) {
      space *= factorial(graph.edges.get(eid)?.bundleIds.length ?? 1);
      if (space > EXHAUSTIVE_SPACE_LIMIT) break;
    }
    if (space <= EXHAUSTIVE_SPACE_LIMIT) {
      exhaustiveComponent(graph, component, cfg);
    } else {
      greedyComponent(graph, component, cfg);
      hillClimbComponent(graph, component, cfg);
    }
  }

  // Expand bundles into per-line orderings.
  const lineOrder: LineOrderConfig = new Map();
  const linePrio = (lineId: string): number =>
    MODE_PRIORITY[graph.lines.get(lineId)?.mode ?? 'Unknown'];
  for (const [eid, bundleIds] of cfg) {
    const lines: string[] = [];
    for (const bid of bundleIds) {
      const members = [...(graph.bundles.get(bid)?.lineIds ?? [bid])].sort(
        (a, b) => {
          const pa = linePrio(a);
          const pb = linePrio(b);
          return pa !== pb ? pa - pb : a.localeCompare(b);
        },
      );
      lines.push(...members);
    }
    lineOrder.set(eid, lines);
  }

  return { bundleOrder: cfg, lineOrder, stats: scoreConfiguration(graph, cfg) };
}
