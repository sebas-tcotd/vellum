/**
 * Transit line graph construction — stage 1 of the LOOM methodology.
 *
 * @remarks
 * Implements the line graph of *Bast, Brosi, Storandt — "Efficient Generation of
 * Geographically Accurate Transit Maps", SIGSPATIAL 2018*, §2, adapted to CSLMap
 * data: where the paper reconstructs shared segments geometrically from noisy
 * GTFS traces (sweep with threshold d̂, Eq. 2), `.cslmap` files reference the
 * road segments each transit leg traverses **by exact ID**, so the line graph
 * is built by ID grouping instead of geometric matching. The outcome is the
 * same structure: an undirected graph whose edges are maximal corridors
 * labelled with the set of lines following the same course.
 *
 * Each pipeline stage lives in its own `builders/` module:
 * - {@link buildBaseGraph} — transit-carrying road segments with their line sets.
 * - {@link collapseBundles} — pruning rule 2 (Lemma 4.1): lines that always
 *   occur together collapse into a single bundle of weight k.
 * - {@link contractCorridors} — pruning rule 1 (Lemma 4.2): degree-2 nodes
 *   whose two incident edges carry the same line set are contracted away.
 * - {@link buildNodes} — junction nodes with CCW angular edge adjacency.
 * - {@link findConnectedComponents} — cutting rule 1: components formed over
 *   multi-bundle edges only, since single-bundle edges impose no ordering
 *   constraints.
 * - {@link computeTransitions} — paper §5 line continuations, derived from
 *   route order rather than corridor line-set membership.
 *
 * Pruning rule 3 / cutting rule 2 (terminus edges) are intentionally not
 * implemented: CS1 transit lines are closed loops and never terminate, so both
 * rules are vacuous for this input (documented deviation).
 *
 * All geometry stays in CS1 world space (`{x, z}`); WGS-84 conversion happens
 * only at GeoJSON emission time.
 */

import type { CityData } from '@vellum/core';
import type { TransitLineGraph } from './types';
import { extractLines, buildBaseGraph } from './builders/base-graph-builder';
import { collapseBundles } from './builders/bundle-builder';
import { contractCorridors } from './builders/corridor-builder';
import { buildNodes } from './builders/node-builder';
import { findConnectedComponents } from './builders/component-builder';
import { computeTransitions } from './builders/transition-builder';

export {
  BaseSegment,
  CorridorTransition,
  LineBundle,
  LineGraphEdge,
  LineGraphNode,
  LineInfo,
  TransitLineGraph,
} from './types';
export { continuationKey } from './utils/keys';

/**
 * Builds the transit line graph from parsed `CityData`.
 *
 * @remarks
 * Deterministic: all iteration happens in sorted order, so the same input
 * always produces the same graph regardless of object-key ordering.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns The corridor-contracted, bundle-collapsed line graph.
 */
export function buildTransitLineGraph(cityData: CityData): TransitLineGraph {
  // 1. Base graph: transit-carrying road segments with their line sets
  const lines = extractLines(cityData);
  const baseGraph = buildBaseGraph(cityData);

  // 2. Bundles (Lemma 4.1): lines with identical segment membership
  const { bundles, bundleOfLine } = collapseBundles(baseGraph);

  // 3. Corridor contraction (pruning rule 1)
  const { edges, segmentToCorridor } = contractCorridors(
    baseGraph,
    bundleOfLine,
  );

  // 4. Nodes with CCW angular adjacency
  const nodes = buildNodes(cityData, edges);

  // 5. Components over multi-bundle edges (cutting rule 1)
  const components = findConnectedComponents(edges, nodes);

  // 6. Route-based corridor transitions (paper §5 continuations)
  const { transitions, continuationIndex } = computeTransitions(
    cityData,
    edges,
    segmentToCorridor,
    bundleOfLine,
  );

  return {
    edges,
    nodes,
    lines,
    bundles,
    bundleOfLine,
    components,
    segmentToCorridor,
    transitions,
    continuationIndex,
  };
}
