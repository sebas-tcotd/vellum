/**
 * Canonical derivation of the transit network for Vellum.
 *
 * @remarks
 * ADR-0001 D6 designates this module as the single home for transit-network
 * semantics. {@link deriveTransitNetwork} chains the three pure stages that
 * used to be reachable only through the MapLibre adapter:
 *
 * 1. {@link buildTransitLineGraph} — corridors, bundles (Lemma 4.1), junction
 *    nodes and route-derived continuations (SIGSPATIAL 2018 §2).
 * 2. {@link computeLineOrder} — MLNCM-S line ordering (§3).
 * 3. {@link extractUniqueStops} / {@link groupStopsByProximity} — stop and
 *    transfer semantics.
 *
 * Render geometry (corridor trims, Bézier inner connections, station capsules)
 * is deliberately **not** here: that stays in `@vellum/renderer-webgl`, which
 * consumes this projection.
 *
 * Pure and deterministic: no MapLibre, no React, no Tauri, no `@vellum/*`
 * imports, and no caching — the same `CityData` always derives the same
 * network. `CityData` remains the canonical city model; `TransitNetwork` is a
 * projection of it, never a second persisted model.
 *
 * The solver's tuning knobs (crossing/separation weights, search limits) stay
 * internal to `./ordering`: they are implementation detail of stage 2, not API.
 */

import type { CityData } from '../types/city-data';
import type {
  LineInfo,
  TransitNetwork,
  TransitNetworkExtensions,
} from '../types/transit-network';
import { buildTransitLineGraph } from './line-graph';
import { computeLineOrder } from './ordering';
import { extractUniqueStops, groupStopsByProximity } from './stops';

export { buildTransitLineGraph, continuationKey } from './line-graph';
export { computeLineOrder, scoreConfiguration } from './ordering';
export { MODE_PRIORITY } from './ordering/constants';
export {
  extractUniqueStops,
  groupStopsByProximity,
  STATION_MERGE_THRESHOLD_M,
} from './stops';

/**
 * Derives the complete transit network projection from parsed `CityData`.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @param extensions - Optional typed extension payload (Epic 5 contract); line
 *   ids it does not know are ignored, and lines it does not mention keep
 *   `attributes === undefined`. Wiring this parameter through the renderer
 *   adapter is deliberately deferred to Epic 5 (Vellum Bridge): today the
 *   contract exists so the source can land without touching renderers.
 * @returns A frozen {@link TransitNetwork}. A city without transit derives an
 *   empty network rather than throwing.
 */
export function deriveTransitNetwork(
  cityData: CityData,
  extensions?: TransitNetworkExtensions,
): TransitNetwork {
  const graph = buildTransitLineGraph(cityData);
  const { bundleOrder, lineOrder, stats } = computeLineOrder(graph);

  const stops = extractUniqueStops(cityData);
  const transferCandidates = groupStopsByProximity(stops);

  return Object.freeze({
    lines: withLineAttributes(graph.lines, extensions),
    edges: graph.edges,
    nodes: graph.nodes,
    bundles: graph.bundles,
    bundleOfLine: graph.bundleOfLine,
    components: graph.components,
    segmentToCorridor: graph.segmentToCorridor,
    transitions: graph.transitions,
    continuationIndex: graph.continuationIndex,
    lineOrder,
    bundleOrder,
    stats,
    stops,
    transferCandidates,
  });
}

/**
 * Rebuilds the line map with `extensions.lineAttributes` attached.
 *
 * @remarks
 * Builds new `LineInfo` values instead of patching the graph's own objects,
 * and copies each attribute payload, so a caller mutating the extensions
 * object afterwards cannot reach inside the derived network.
 */
function withLineAttributes(
  lines: ReadonlyMap<string, LineInfo>,
  extensions: TransitNetworkExtensions | undefined,
): ReadonlyMap<string, LineInfo> {
  const attributes = extensions?.lineAttributes;
  if (!attributes) return lines;

  const withAttrs = new Map<string, LineInfo>();
  for (const [lineId, line] of lines) {
    const attrs = Object.hasOwn(attributes, lineId)
      ? attributes[lineId]
      : undefined;
    withAttrs.set(
      lineId,
      attrs ? { ...line, attributes: Object.freeze({ ...attrs }) } : line,
    );
  }
  return withAttrs;
}
