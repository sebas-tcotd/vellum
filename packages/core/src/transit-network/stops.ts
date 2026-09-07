/**
 * Stop and transfer semantics of the transit network.
 *
 * @remarks
 * This is the definition of what a *stop* and a *transfer candidate* are — not
 * how either is drawn. It moved out of the MapLibre adapter's station builder
 * in Story 1.5 (ADR-0001 D6) because the schematic diagram of Epic 4 and any
 * future view need the same answer, and reconstructing it per view is exactly
 * the anti-pattern the ADR forbids.
 *
 * Two rules, both deterministic:
 *
 * 1. **Deduplication.** CS1 circular routes repeat their terminal stop, so a
 *    stop is recorded once per line.
 * 2. **Proximity grouping.** Stops within {@link STATION_MERGE_THRESHOLD_M} of
 *    a group's seed belong to the same station; a group spanning more than one
 *    line is a transfer candidate.
 */

import type { CityData } from '../types/city-data';
import type {
  TransitStopEntry,
  TransitTransferCandidate,
} from '../types/transit-network';

/** Stops closer than this (world meters) are merged into one station (CSLMap convention). */
export const STATION_MERGE_THRESHOLD_M = 48;

/**
 * Collects every stop of every line once, in deterministic order (lines sorted
 * by id, stops in route order, duplicates of a circular route's terminal stop
 * dropped).
 */
export function extractUniqueStops(cityData: CityData): TransitStopEntry[] {
  const entries: TransitStopEntry[] = [];
  const sortedLines = [...cityData.transitLines].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  for (const line of sortedLines) {
    const seen = new Set<string>();
    for (const stop of line.stops) {
      if (seen.has(stop.id)) continue; // circular routes repeat the terminal stop
      seen.add(stop.id);
      entries.push({
        stopId: stop.id,
        position: { x: stop.position.x, z: stop.position.z },
        lineId: line.id,
      });
    }
  }
  return entries;
}

/** Greedy proximity grouping (deterministic: entries are in sorted order). */
export function groupStopsByProximity(
  entries: readonly TransitStopEntry[],
): TransitTransferCandidate[] {
  const groupedIndices = new Set<number>();
  const groups: TransitStopEntry[][] = [];

  for (let i = 0; i < entries.length; i++) {
    if (groupedIndices.has(i)) continue;

    const currentGroup = [entries[i]];
    groupedIndices.add(i);

    for (let j = i + 1; j < entries.length; j++) {
      if (groupedIndices.has(j)) continue;
      const dx = entries[j].position.x - entries[i].position.x;
      const dz = entries[j].position.z - entries[i].position.z;
      const distance = Math.hypot(dx, dz);

      if (distance <= STATION_MERGE_THRESHOLD_M) {
        currentGroup.push(entries[j]);
        groupedIndices.add(j);
      }
    }
    groups.push(currentGroup);
  }
  return groups;
}
