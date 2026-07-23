/**
 * Line-ordering optimization — stage 2 of the LOOM methodology (MLNCM-S).
 *
 * @remarks
 * Implements the *metro-line node crossing minimization problem with line
 * separation penalty* of §3 of the SIGSPATIAL 2018 paper: one ordering per
 * line-graph edge, so crossings can only occur at nodes. Instead of the
 * paper's ILP we solve the same objective with exhaustive enumeration for
 * small components ({@link solveExhaustively}) and a score-driven greedy
 * ({@link solveGreedy}) + hill-climbing ({@link solveHillClimbing}) search for
 * large ones (the paper's §7 names local search as the natural heuristic
 * baseline; an ILP can be slotted in later behind the same
 * {@link scoreConfiguration | scorer}). The scorer *is* the objective
 * function, so correctness of orderings does not depend on any orientation
 * bookkeeping in the search — the historic double-mirror bug class is
 * structurally excluded.
 *
 * See `scoring/index.ts` for the crossing/separation model (paper Fig. 4) and
 * objective weights (§3.4/§6). The paper's in-station weights are
 * intentionally not applied: CSLMap stops never coincide with line-graph
 * junction nodes (they sit mid-corridor), so station nodes are always
 * degree-2 same-set nodes, which Lemma 4.2 shows can be ignored by the
 * optimizer without loss of optimality.
 */
import type { LineGraphEdge, TransitLineGraph } from '../line-graph';
import { solveExhaustively } from './algorithms/exhaustive';
import { solveGreedy } from './algorithms/greedy';
import { solveHillClimbing } from './algorithms/hill-climbing';
import { EXHAUSTIVE_SPACE_LIMIT, MODE_PRIORITY } from './constants';
import { scoreConfiguration } from './scoring';
import type {
  BundleOrderConfig,
  LineOrderConfig,
  LineOrderResult,
} from './types';
import { factorial } from './utils/combinatorics';

export { scoreConfiguration } from './scoring';
export type {
  BundleOrderConfig,
  LineOrderConfig,
  LineOrderResult,
  OrderingStats,
} from './types';

/**
 * Computes the line ordering for the whole graph: exhaustive for small
 * components, greedy + hill climbing for large ones, then expands bundles
 * back to per-line orderings (Lemma 4.1 expansion).
 */
export function computeLineOrder(graph: TransitLineGraph): LineOrderResult {
  const configuration = initializeDefaultConfiguration(graph);

  for (const component of graph.components) {
    optimizeComponent(graph, component, configuration);
  }

  const lineOrder = expandBundlesToLines(graph, configuration);
  const stats = scoreConfiguration(graph, configuration);

  return { bundleOrder: configuration, lineOrder, stats };
}

/** Seeds every edge with its deterministic mode-priority fallback order. */
function initializeDefaultConfiguration(
  graph: TransitLineGraph,
): BundleOrderConfig {
  const cfg: BundleOrderConfig = new Map();
  for (const eid of [...graph.edges.keys()].sort()) {
    const edge = graph.edges.get(eid);
    if (edge) {
      cfg.set(eid, defaultBundleOrder(graph, edge));
    }
  }
  return cfg;
}

/** Dispatches a component to exhaustive search or greedy + hill climbing, by search-space size. */
function optimizeComponent(
  graph: TransitLineGraph,
  component: string[],
  cfg: BundleOrderConfig,
): void {
  const searchSpaceSize = calculateSearchSpace(graph, component);

  if (searchSpaceSize <= EXHAUSTIVE_SPACE_LIMIT) {
    solveExhaustively(graph, component, cfg);
  } else {
    solveGreedy(graph, component, cfg);
    solveHillClimbing(graph, component, cfg);
  }
}

/** Product of per-edge bundle permutation counts, short-circuited once past the exhaustive limit. */
function calculateSearchSpace(
  graph: TransitLineGraph,
  component: string[],
): number {
  let space = 1;
  for (const eid of component) {
    const bundleCount = graph.edges.get(eid)?.bundleIds.length ?? 1;
    space *= factorial(bundleCount);
    if (space > EXHAUSTIVE_SPACE_LIMIT) break;
  }
  return space;
}

/** Expands each edge's bundle order into a per-line order (bundles laid out side by side). */
function expandBundlesToLines(
  graph: TransitLineGraph,
  cfg: BundleOrderConfig,
): LineOrderConfig {
  const lineOrder: LineOrderConfig = new Map();

  const getLinePriority = (lineId: string): number => {
    const mode = graph.lines.get(lineId)?.mode ?? 'Unknown';
    return MODE_PRIORITY[mode];
  };

  for (const [eid, bundleIds] of cfg) {
    const lines: string[] = bundleIds.flatMap((bid) => {
      const members = [...(graph.bundles.get(bid)?.lineIds ?? [bid])];
      return members.sort((a, b) => {
        const diff = getLinePriority(a) - getLinePriority(b);
        return diff !== 0 ? diff : a.localeCompare(b);
      });
    });
    lineOrder.set(eid, lines);
  }

  return lineOrder;
}

/** Deterministic fallback comparator: mode priority, then id. */
function defaultBundleOrder(
  graph: TransitLineGraph,
  edge: LineGraphEdge,
): string[] {
  const getBundlePriority = (bundleId: string): number => {
    const bundle = graph.bundles.get(bundleId);
    const rep = bundle?.lineIds[0];
    const mode = rep !== undefined ? graph.lines.get(rep)?.mode : undefined;
    return MODE_PRIORITY[mode ?? 'Unknown'];
  };

  return [...edge.bundleIds].sort((a, b) => {
    const pa = getBundlePriority(a);
    const pb = getBundlePriority(b);
    return pa !== pb ? pa - pb : a.localeCompare(b);
  });
}
