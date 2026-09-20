/**
 * Base-graph construction: transit-carrying road segments with their line
 * sets, stage 1 of {@link buildTransitLineGraph}.
 */

import type { CityData } from '../../../types/city-data';
import type { LineInfo, BaseSegment } from '../../../types/transit-network';
import { getOrCreate } from '../utils/collections';

/**
 * A line the player never renamed keeps CS1's own localization key instead of
 * a name — `TRANSPORT_LINE_PATTERN[Evacuation Bus]:0`. The bracketed part is
 * the asset it came from and is the only readable thing in there.
 *
 * The trailing `:0` is the index of a pattern variant, not the line's number,
 * so it is dropped rather than shown: turning it into "Evacuation Bus 0" would
 * put a number on screen that means nothing to the player.
 */
const LOCALIZATION_KEY = /^[A-Z][A-Z0-9_]*\[(.+)\](?::\d+)?$/;

/**
 * The name to show for a line: what the player called it, or the readable part
 * of the localization key CS1 leaves behind when they never named it.
 *
 * @remarks
 * Normalising here rather than at each surface means the legend, the map and
 * anything exported all say the same thing. A name that does not look like a
 * key is passed through untouched, including a blank one — an empty name is a
 * real state each surface words for itself.
 */
export function displayLineName(rawName: string): string {
  const asset = LOCALIZATION_KEY.exec(rawName.trim())?.[1]?.trim();
  return asset !== undefined && asset.length > 0 ? asset : rawName;
}

/** Extracts per-line metadata (id, name, color, mode) from `CityData`. */
export function extractLines(cityData: CityData): Map<string, LineInfo> {
  const lines = new Map<string, LineInfo>();
  for (const line of cityData.transitLines) {
    lines.set(line.id, {
      id: line.id,
      name: displayLineName(line.name),
      color: line.color,
      mode: line.mode,
    });
  }
  return lines;
}

/**
 * Groups road segments by the set of transit lines traversing them, keyed by
 * segment id. Segments referenced by a route but missing from the parsed
 * road network (filtered or absent) are skipped.
 */
export function buildBaseGraph(cityData: CityData): Map<string, BaseSegment> {
  const segLines = new Map<string, Set<string>>();

  for (const line of cityData.transitLines) {
    for (const pathSeg of line.route) {
      for (const segId of pathSeg.segmentIds) {
        getOrCreate(segLines, segId, () => new Set()).add(line.id);
      }
    }
  }

  const nodeById = new Map(cityData.roadNodes.map((n) => [n.id, n]));
  const segById = new Map(cityData.roadSegments.map((s) => [s.id, s]));
  const baseSegs = new Map<string, BaseSegment>();

  for (const segId of [...segLines.keys()].sort()) {
    const seg = segById.get(segId);
    if (seg === undefined) continue;

    const start = nodeById.get(seg.startNodeId);
    const end = nodeById.get(seg.endNodeId);
    if (start === undefined || end === undefined) continue;

    baseSegs.set(segId, {
      segId,
      startNodeId: seg.startNodeId,
      endNodeId: seg.endNodeId,
      path: [
        { x: start.position.x, z: start.position.z },
        ...seg.points.map((p) => ({ x: p.x, z: p.z })),
        { x: end.position.x, z: end.position.z },
      ],
      lineIds: [...(segLines.get(segId) ?? [])].sort(),
    });
  }

  return baseSegs;
}
