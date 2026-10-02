/**
 * Canonical derivation of the transit network for Vellum.
 *
 * @remarks
 * ADR-0001 D6 designates this module as the single home for transit-network
 * semantics. {@link deriveTransitNetwork} chains the four pure stages that
 * used to be reachable only through the MapLibre adapter:
 *
 * 1. {@link buildTransitLineGraph} — corridors, bundles (Lemma 4.1), junction
 *    nodes and route-derived continuations (SIGSPATIAL 2018 §2).
 * 2. {@link computeLineOrder} — MLNCM-S line ordering (§3).
 * 3. {@link extractUniqueStops} / {@link groupStopsByProximity} — stop and
 *    transfer semantics.
 * 4. {@link buildRenderGeometry} — trimmed corridors, resolved slots, inner
 *    connectors and station capsules.
 *
 * Pure and deterministic: no MapLibre, no React, no Tauri, no `@vellum/*`
 * imports, and no caching — the same `CityData` always derives the same
 * network. `CityData` remains the canonical city model; `TransitNetwork` is a
 * projection of it, never a second persisted model.
 *
 * The solver's tuning knobs (crossing/separation weights, search limits) stay
 * internal to `./ordering`: they are implementation detail of stage 2, not API.
 */

export { deriveTransitNetwork } from './derive';
export { buildTransitLineGraph, continuationKey } from './line-graph';
export { computeLineOrder, scoreConfiguration } from './ordering';
export { MODE_PRIORITY } from './ordering/constants';
export * from './render-geometry';
export * from './schematic';
export {
  extractUniqueStops,
  groupStopsByProximity,
  STATION_MERGE_THRESHOLD_M,
} from './stops';
