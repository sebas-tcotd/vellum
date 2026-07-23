/**
 * Type definitions for the transit line graph — the shared vocabulary between
 * {@link buildTransitLineGraph} and its `builders/` pipeline stages. See that
 * function's module doc for the algorithm this graph implements.
 */

import type { TransitMode } from '@vellum/core';
import type { CsPoint } from '../../coordinate-transform';

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

/** Internal: a base-graph segment before corridor contraction. */
export interface BaseSegment {
  segId: string;
  startNodeId: string;
  endNodeId: string;
  /** World polyline startNode → endNode (node positions + curve points). */
  path: CsPoint[];
  lineIds: string[];
}
