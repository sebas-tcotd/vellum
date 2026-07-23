/**
 * Stations — paper §5 step 4 of {@link buildRenderGeometry} (buffered/rounded
 * variant): the paper draws station polygons on line-graph nodes; CSLMap
 * stops sit mid-corridor instead, so each station becomes a rounded capsule
 * oriented perpendicular to the corridor (paper §5.4 / Fig. 10), centered on
 * the stop's projection and spanning only the lines that actually stop
 * there.
 */

import type { CityData } from '@vellum/core';
import type { CsPoint } from '../../../coordinate-transform';
import {
  SLOT_M,
  STATION_ACROSS_MARGIN_M,
  STATION_CORNER_STEPS,
  STATION_HALF_THICKNESS_M,
  STATION_MERGE_THRESHOLD_M,
} from '../config';
import type {
  Bucket,
  CorridorGeometry,
  StationGeometry,
  StationLineInfo,
  StopEntry,
} from '../types';
import { roundedRectRing } from '../utils/shape';
import {
  add,
  norm,
  projectOnPath,
  rightOf,
  scale,
  sub,
  unit,
} from '../utils/vector';

/** Builds station markers from proximity-grouped stops projected onto their corridor. */
export function buildStations(
  cityData: CityData,
  corridors: Map<string, CorridorGeometry>,
): StationGeometry[] {
  const stopEntries = extractUniqueStops(cityData);
  const stopGroups = groupStopsByProximity(stopEntries);
  const lineInfoMap = createLineInfoMap(cityData);

  return stopGroups.flatMap((group) =>
    createStationPolygonsForGroup(group, corridors, lineInfoMap),
  );
}

function extractUniqueStops(cityData: CityData): StopEntry[] {
  const entries: StopEntry[] = [];
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
function groupStopsByProximity(entries: StopEntry[]): StopEntry[][] {
  const groupedIndices = new Set<number>();
  const groups: StopEntry[][] = [];

  for (let i = 0; i < entries.length; i++) {
    if (groupedIndices.has(i)) continue;

    const currentGroup = [entries[i]];
    groupedIndices.add(i);

    for (let j = i + 1; j < entries.length; j++) {
      if (groupedIndices.has(j)) continue;
      const distance = norm(sub(entries[j].position, entries[i].position));

      if (distance <= STATION_MERGE_THRESHOLD_M) {
        currentGroup.push(entries[j]);
        groupedIndices.add(j);
      }
    }
    groups.push(currentGroup);
  }
  return groups;
}

function createLineInfoMap(cityData: CityData): Map<string, StationLineInfo> {
  return new Map(
    cityData.transitLines.map((l) => [
      l.id,
      { name: l.name, color: l.color, mode: l.mode },
    ]),
  );
}

function createStationPolygonsForGroup(
  group: StopEntry[],
  corridors: Map<string, CorridorGeometry>,
  lineInfoMap: Map<string, StationLineInfo>,
): StationGeometry[] {
  const centroid = calculateCentroid(group);
  const groupLineIds = [...new Set(group.map((e) => e.lineId))].sort();
  const buckets = partitionLinesToCorridors(groupLineIds, centroid, corridors);

  const stations: StationGeometry[] = [];

  for (const bucket of buckets.values()) {
    const offsets = calculateSlotOffsets(bucket);
    if (offsets.length === 0) continue;

    const polygon = buildCapsuleGeometry(bucket, offsets);
    const lines = resolveLineInfo(bucket.lineIds, lineInfoMap);

    stations.push({
      id: `${group[0].stopId}:${bucket.corridor.edgeId}`,
      polygon,
      lines,
    });
  }

  return stations;
}

function calculateCentroid(group: StopEntry[]): CsPoint {
  const sum = group.reduce((acc, e) => add(acc, e.position), { x: 0, z: 0 });
  return scale(sum, 1 / group.length);
}

/**
 * Partitions the *stopping* lines by the corridor each actually runs on near
 * the stop (a group can touch stops on more than one corridor). Each corridor
 * bucket becomes its own marker sized to only its stopping lines, so the
 * geometry, the stopping lines, and the tooltip always agree — the marker
 * never spans lines that merely pass through.
 */
function partitionLinesToCorridors(
  lineIds: string[],
  centroid: CsPoint,
  corridors: Map<string, CorridorGeometry>,
): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();

  for (const lineId of lineIds) {
    let best: Omit<Bucket, 'lineIds'> | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const eid of [...corridors.keys()].sort()) {
      const corridor = corridors.get(eid);
      if (!corridor || !corridor.lineIds.includes(lineId)) continue;

      const proj = projectOnPath(centroid, corridor.path);
      if (proj && proj.dist < bestDist) {
        bestDist = proj.dist;
        best = { corridor, point: proj.point, dir: proj.dir };
      }
    }

    if (!best) continue;

    let bucket = buckets.get(best.corridor.edgeId);
    if (!bucket) {
      bucket = { ...best, lineIds: [] };
      buckets.set(best.corridor.edgeId, bucket);
    }
    bucket.lineIds.push(lineId);
  }

  return buckets;
}

/**
 * Signed slot offsets of the stopping lines within the corridor ordering
 * (same convention as the rendered line-offset: p − (n−1)/2).
 */
function calculateSlotOffsets(bucket: Bucket): number[] {
  const total = bucket.corridor.lineIds.length;
  return bucket.lineIds
    .map((l) => bucket.corridor.lineIds.indexOf(l))
    .filter((i) => i >= 0)
    .map((i) => i - (total - 1) / 2);
}

/**
 * Long axis runs ACROSS the corridor (spans the stopping lines); short axis
 * is a fixed thickness ALONG it → the capsule sits perpendicular to the line.
 * `across` never falls below the thickness, so the capsule never flips back
 * to line-aligned (a lone stop becomes a small circle).
 */
function buildCapsuleGeometry(bucket: Bucket, offsets: number[]): CsPoint[] {
  const minOff = Math.min(...offsets);
  const maxOff = Math.max(...offsets);
  const centerOffset = ((minOff + maxOff) / 2) * SLOT_M;

  const halfAcross = Math.max(
    ((maxOff - minOff) / 2) * SLOT_M + STATION_ACROSS_MARGIN_M,
    STATION_HALF_THICKNESS_M,
  );

  const along = unit(bucket.dir);
  const across = rightOf(along);
  const center = add(bucket.point, scale(across, centerOffset));

  return roundedRectRing(
    center,
    along,
    across,
    STATION_HALF_THICKNESS_M,
    halfAcross,
    STATION_CORNER_STEPS,
  );
}

function resolveLineInfo(
  lineIds: string[],
  lineInfoMap: Map<string, StationLineInfo>,
): StationLineInfo[] {
  return [...lineIds]
    .sort()
    .map((id) => lineInfoMap.get(id))
    .filter((l): l is StationLineInfo => l !== undefined);
}
