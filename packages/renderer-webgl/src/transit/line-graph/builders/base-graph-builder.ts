/**
 * Base-graph construction: transit-carrying road segments with their line
 * sets, stage 1 of {@link buildTransitLineGraph}.
 */

import type { CityData } from '@vellum/core';
import type { LineInfo, BaseSegment } from '../types';
import { getOrCreate } from '../utils/collections';

/** Extracts per-line metadata (id, name, color, mode) from `CityData`. */
export function extractLines(cityData: CityData): Map<string, LineInfo> {
  const lines = new Map<string, LineInfo>();
  for (const line of cityData.transitLines) {
    lines.set(line.id, {
      id: line.id,
      name: line.name,
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
