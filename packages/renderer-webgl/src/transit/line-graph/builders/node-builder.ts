/**
 * Junction node construction for {@link buildTransitLineGraph}: nodes with
 * their incident corridor edges sorted counter-clockwise by departure
 * azimuth (needed for different-segment crossing detection, paper Fig. 4
 * right).
 */

import type { CityData } from '@vellum/core';
import type { LineGraphEdge, LineGraphNode } from '../types';
import { getOrCreate } from '../utils/collections';
import { departureAzimuth } from '../utils/geo';

/** Builds every junction node touched by at least one corridor edge. */
export function buildNodes(
  cityData: CityData,
  edges: Map<string, LineGraphEdge>,
): Map<string, LineGraphNode> {
  const incident = new Map<string, string[]>();

  for (const e of edges.values()) {
    for (const nid of new Set([e.nodeA, e.nodeB])) {
      getOrCreate(incident, nid, () => []).push(e.id);
    }
  }

  const nodeById = new Map(cityData.roadNodes.map((n) => [n.id, n]));
  const nodes = new Map<string, LineGraphNode>();

  for (const [nid, edgeIds] of incident) {
    const rn = nodeById.get(nid);
    if (!rn) continue;

    const position = { x: rn.position.x, z: rn.position.z };

    const sorted = [...edgeIds].sort((a, b) => {
      const ea = edges.get(a);
      const eb = edges.get(b);
      if (!ea || !eb) return a.localeCompare(b);

      const azA = departureAzimuth(ea, nid);
      const azB = departureAzimuth(eb, nid);
      return azA !== azB ? azA - azB : a.localeCompare(b);
    });

    nodes.set(nid, { id: nid, position, edgeIds: sorted });
  }

  return nodes;
}
