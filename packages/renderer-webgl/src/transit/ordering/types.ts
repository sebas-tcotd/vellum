/**
 * Type definitions for the line-ordering optimization — the shared vocabulary
 * between {@link computeLineOrder} and its `algorithms/`/`scoring` modules.
 * See that function's module doc for the objective this ordering minimizes.
 */

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
