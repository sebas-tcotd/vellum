/**
 * The derivation of {@link TransitNetwork} from `CityData`.
 *
 * @remarks
 * Split out of `./index` (Story 4.6) so a module inside this folder — the
 * schematic's station contraction — can call it without importing the barrel
 * that re-exports that very module. `./index` re-exports it unchanged.
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
import { buildRenderGeometry } from './render-geometry';

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
  const transferCandidates = groupStopsByProximity(stops, graph.lines);

  const network = {
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
  };

  return Object.freeze({
    ...network,
    renderGeometry: buildRenderGeometry(network),
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
