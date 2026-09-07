/**
 * Canonical vocabulary of the derived transit network.
 *
 * @remarks
 * ADR-0001 D6 names this module — plus its derivation in
 * `src/transit-network/` — as the single home for transit-network semantics:
 * the line graph (corridors, bundles, junction nodes, continuations), the
 * MLNCM-S ordering, and the stop/transfer semantics. Before Story 1.5 this
 * vocabulary was split between `renderer-webgl/src/transit/line-graph/types.ts`
 * and `.../ordering/types.ts`, reachable only through the MapLibre adapter.
 *
 * `TransitNetwork` is a *projection*: `CityData` stays the canonical city
 * model and this is derived from it on demand, never persisted as a second
 * model. Render geometry (trims, capsules, Béziers) is deliberately **not**
 * here — that stays in the adapter.
 */

import type { CsPoint } from '../coordinate-transform';
import type { TransitMode } from './city-data';

// ─── Line graph ──────────────────────────────────────────────────────────────

/** Metadata for one transit line participating in the line graph. */
export interface LineInfo {
  /** CS1 line id. */
  id: string;

  /** Display name as defined in-game. */
  name: string;

  /** Hex color defined in-game. */
  color: string;

  /** Transportation mode. */
  mode: TransitMode;

  /**
   * Opaque per-line attributes contributed by
   * {@link TransitNetworkExtensions.lineAttributes}. `undefined` when the
   * derivation ran without extensions (the default).
   */
  attributes?: Readonly<Record<string, unknown>>;
}

/**
 * A bundle of lines that always occur together (paper Lemma 4.1).
 * The ordering problem operates on bundles; member lines are laid out
 * side by side in a fixed internal order when expanding the solution.
 */
export interface LineBundle {
  /** Deterministic bundle id (id of the first member line). */
  id: string;

  /** Member line ids, sorted for determinism. */
  lineIds: string[];

  /** Number of member lines (the weight k of Lemma 4.1). */
  weight: number;
}

/**
 * An edge of the line graph: a maximal corridor of road segments that carry
 * exactly the same set of transit lines (paper §2).
 */
export interface LineGraphEdge {
  /** Deterministic corridor id (`c:` + smallest member segment id). */
  id: string;
  /** Endpoint node id — the corridor polyline starts here. */
  nodeA: string;
  /** Endpoint node id — the corridor polyline ends here. `nodeA === nodeB` for rings. */
  nodeB: string;
  /** Bundle ids traversing this corridor, sorted for determinism. */
  bundleIds: string[];
  /** World-space polyline oriented nodeA → nodeB. */
  path: CsPoint[];
  /** Road segment ids composing the corridor, in path order. */
  segmentIds: string[];
}

/**
 * One transition of a line between two corridors at a shared node — the
 * paper's notion of a line "continuing" through a node (§5), derived from the
 * line's actual route sequence rather than from corridor line-set membership.
 * This is what disambiguates lines that touch 3+ corridors at a node (loops,
 * roundabouts, revisited hubs), which set-membership cannot.
 */
export interface CorridorTransition {
  /** The line making the transition. */
  lineId: string;

  /** Shared road node where the transition happens. */
  nodeId: string;

  /** Corridor the line arrives on. */
  fromEdge: string;

  /** Which end (`nodeA`=start / `nodeB`=end) of `fromEdge` touches the node. */
  fromEnd: 'start' | 'end';

  /** Corridor the line departs on. */
  toEdge: string;

  /** Which end of `toEdge` touches the node. */
  toEnd: 'start' | 'end';
}

/** A node of the line graph (a road junction where corridors meet or split). */
export interface LineGraphNode {
  /** Road node id. */
  id: string;

  /** World-space position. */
  position: CsPoint;

  /**
   * Incident corridor edge ids sorted counter-clockwise by the azimuth of the
   * corridor's departing tangent (needed for different-segment crossing
   * detection, paper Fig. 4 right). A ring corridor appears once.
   */
  edgeIds: string[];
}

/** The complete transit line graph over bundles. */
export interface TransitLineGraph {
  /** Corridor edges keyed by edge id. */
  edges: Map<string, LineGraphEdge>;

  /** Junction nodes keyed by node id. */
  nodes: Map<string, LineGraphNode>;

  /** Per-line metadata keyed by line id. */
  lines: Map<string, LineInfo>;

  /** Bundles keyed by bundle id (Lemma 4.1 collapse). */
  bundles: Map<string, LineBundle>;

  /** Bundle id for each line id. */
  bundleOfLine: Map<string, string>;

  /**
   * Ordering-relevant connected components: sets of edge ids connected through
   * shared nodes, considering only edges with ≥ 2 bundles (cutting rule 1).
   */
  components: string[][];

  /** Road segment id → the corridor edge id that contains it. */
  segmentToCorridor: Map<string, string>;

  /**
   * All line-continuation transitions across nodes, derived from route order.
   * Consumed by the renderer (inner connections) and, via
   * {@link TransitLineGraph.continuationIndex}, by the scorer.
   */
  transitions: CorridorTransition[];

  /**
   * Index for O(1) continuation lookup: key `${nodeId}\0${edgeId}\0${bundleId}`
   * → the set of corridor edge ids the bundle continues to from `edgeId` across
   * `nodeId`. A singleton in the common case; larger only when a bundle passes
   * the node through `edgeId` more than once (genuinely ambiguous for pairwise
   * scoring, so such pairs are skipped).
   */
  continuationIndex: Map<string, Set<string>>;
}

/**
 * A base-graph segment before corridor contraction.
 *
 * @internal Stage vocabulary of {@link TransitLineGraph}; consumers read
 * {@link TransitNetwork}, never this.
 */
export interface BaseSegment {
  segId: string;
  startNodeId: string;
  endNodeId: string;
  /** World polyline startNode → endNode (node positions + curve points). */
  path: CsPoint[];
  lineIds: string[];
}

// ─── Ordering ────────────────────────────────────────────────────────────────

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

// ─── Stops & transfers ───────────────────────────────────────────────────────

/**
 * One stop of one line, deduplicated: a circular route that repeats its
 * terminal stop contributes the stop once.
 */
export interface TransitStopEntry {
  /** CS1 stop id. */
  stopId: string;
  /** World-space stop position. */
  position: CsPoint;
  /** Line this entry was recorded for. */
  lineId: string;
}

/**
 * A group of stop entries within {@link STATION_MERGE_THRESHOLD_M} of each
 * other — the domain notion of "one station". A candidate spanning entries of
 * more than one line is a transfer point; a single-line candidate is a plain
 * stop.
 */
export type TransitTransferCandidate = readonly TransitStopEntry[];

// ─── The projection ──────────────────────────────────────────────────────────

/**
 * Optional, typed extension hook for the derivation.
 *
 * @remarks
 * Story 1.5 only fixes the *contract*; the real source (the Vellum Bridge of
 * Epic 5) does not exist yet. Deliberately minimal: one map of opaque
 * per-line attributes, keyed by `TransitLine.id`. Unknown ids are ignored.
 */
export interface TransitNetworkExtensions {
  /** Per-line attributes, keyed by CS1 line id. */
  readonly lineAttributes?: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
}

/**
 * The derived transit network: everything downstream needs to know about the
 * shape of the transit system, without touching render geometry.
 *
 * @remarks
 * Produced by `deriveTransitNetwork(cityData, extensions?)`. The root object is
 * frozen; the `Map`s it holds are not cloned into persistent structures and not
 * deep-frozen — that would be cost without benefit for a value nobody mutates.
 */
export interface TransitNetwork {
  /** Per-line metadata keyed by line id (routes + modes, plus `attributes`). */
  readonly lines: ReadonlyMap<string, LineInfo>;

  /** Corridors: maximal runs of segments carrying the same line set. */
  readonly edges: ReadonlyMap<string, LineGraphEdge>;

  /** Junction nodes with CCW angular adjacency. */
  readonly nodes: ReadonlyMap<string, LineGraphNode>;

  /** Bundles of always-together lines (Lemma 4.1). */
  readonly bundles: ReadonlyMap<string, LineBundle>;

  /** Bundle id for each line id. */
  readonly bundleOfLine: ReadonlyMap<string, string>;

  /** Ordering-relevant connected components over multi-bundle edges. */
  readonly components: readonly (readonly string[])[];

  /** Road segment id → the corridor edge id that contains it. */
  readonly segmentToCorridor: ReadonlyMap<string, string>;

  /** Line continuations across nodes, derived from route order. */
  readonly transitions: readonly CorridorTransition[];

  /** O(1) continuation lookup index (see {@link TransitLineGraph.continuationIndex}). */
  readonly continuationIndex: ReadonlyMap<string, ReadonlySet<string>>;

  /** Per-edge left-to-right line order (drives render offsets). */
  readonly lineOrder: ReadonlyMap<string, readonly string[]>;

  /** Per-edge bundle order the line order was expanded from. */
  readonly bundleOrder: ReadonlyMap<string, readonly string[]>;

  /** Objective metrics of the chosen ordering. */
  readonly stats: OrderingStats;

  /** Every deduplicated stop entry, in deterministic order. */
  readonly stops: readonly TransitStopEntry[];

  /** Proximity-grouped stops: the transfer candidates. */
  readonly transferCandidates: readonly TransitTransferCandidate[];
}
