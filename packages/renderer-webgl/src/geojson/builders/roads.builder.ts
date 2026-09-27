/** Road segment GeoJSON construction and tier/width classification. */

import {
  classifyRoadCategory,
  classifyRoadTier,
  ROAD_WIDTH_STYLES,
  type CityData,
  type RoadCategory,
  type RoadNode,
  type RoadSegment,
} from '@vellum/core';
import { csToGeoArray } from '../../coordinate-transform';
import type {
  RoadFeature,
  RoadTier,
  RoadsFeatureCollection,
} from '../types/roads.types';

/** A CS1 segment that survived classification, paired with its render tier. */
interface RenderedSegment {
  segment: RoadSegment;
  tier: RoadTier;
  /** Everything that must match for two segments to be drawn as one line. */
  signature: string;
}

/**
 * Builds a GeoJSON FeatureCollection of roads from parsed `CityData`.
 *
 * @remarks
 * CS1 splits a road into many short segments. Emitting one `LineString` each
 * makes every segment boundary a place where two separately-tessellated lines
 * merely abut: on a curve that leaves a wedge of background, and even on a
 * straight run the two antialiased edges do not sum to opaque, so a hairline
 * shows through. Consecutive segments that share a node and render identically
 * are therefore welded into a single `LineString`, which lets `line-join` do
 * the work and leaves no internal seam at all.
 *
 * Coordinates are the start node, any intermediate curve points, and the end
 * node — all converted to equatorial WGS-84 via `csToGeoArray`.
 *
 * Each feature includes `fixedWidth` and `scaledWidth` properties for use in
 * MapLibre `interpolate` expressions: `totalWidth = fixed + scaled * zoomFactor`.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildRoadsGeoJson(cityData: CityData): RoadsFeatureCollection {
  const nodeById = createNodeMap(cityData.roadNodes);
  const rendered = collectRenderable(cityData, nodeById);
  const byNode = indexByNode(rendered);

  const features = traceChains(rendered, byNode).map((chain) =>
    createChainFeature(chain, rendered, byNode, nodeById),
  );

  return { type: 'FeatureCollection', features };
}

// ─── Internal Helpers (SLAP & SRP) ──────────────────────────────────────────

function createNodeMap(nodes: RoadNode[]): Map<string, RoadNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

function collectRenderable(
  cityData: CityData,
  nodeById: Map<string, RoadNode>,
): RenderedSegment[] {
  const rendered: RenderedSegment[] = [];

  for (const segment of cityData.roadSegments) {
    const tier = classifyRoadTier(
      segment.itemClass,
      segment.wayType,
      segment.width,
    );

    if (!tier || !isValidSegment(segment, nodeById)) continue;

    rendered.push({ segment, tier, signature: signatureOf(segment, tier) });
  }

  return rendered;
}

/**
 * Two segments may only be welded when every property that drives filtering,
 * colour and width is identical — otherwise the merged line would render as
 * whichever half won.
 */
function signatureOf(segment: RoadSegment, tier: RoadTier): string {
  return [
    tier,
    segment.itemClass,
    segment.wayType.join(','),
    segment.width,
    // Welding across a name change would label the whole chain by one end.
    segment.name ?? '',
  ].join('|');
}

function indexByNode(rendered: RenderedSegment[]): Map<string, number[]> {
  const byNode = new Map<string, number[]>();

  rendered.forEach(({ segment }, index) => {
    for (const nodeId of [segment.startNodeId, segment.endNodeId]) {
      const at = byNode.get(nodeId);
      if (at) at.push(index);
      else byNode.set(nodeId, [index]);
    }
  });

  return byNode;
}

/**
 * Finds the single segment that continues the way through `nodeId`, or `null`
 * where the way ends, forks, or changes into something drawn differently.
 *
 * @remarks
 * A junction (three or more segments) is left unwelded: which pair to join is
 * arbitrary there, and the branches overlap anyway.
 */
function weldPartner(
  nodeId: string,
  from: number,
  rendered: RenderedSegment[],
  byNode: Map<string, number[]>,
): number | null {
  const touching = byNode.get(nodeId) ?? [];
  if (touching.length !== 2) return null;

  const partner = touching[0] === from ? touching[1] : touching[0];
  if (partner === undefined || partner === from) return null;

  return rendered[partner]?.signature === rendered[from]?.signature
    ? partner
    : null;
}

function otherEnd(segment: RoadSegment, nodeId: string): string {
  return segment.startNodeId === nodeId
    ? segment.endNodeId
    : segment.startNodeId;
}

/** Groups the rendered segments into maximal runs of weldable neighbours. */
function traceChains(
  rendered: RenderedSegment[],
  byNode: Map<string, number[]>,
): number[][] {
  const visited = new Set<number>();
  const chains: number[][] = [];

  rendered.forEach((entry, index) => {
    if (visited.has(index)) return;
    visited.add(index);

    const chain = [index];
    extend(chain, entry.segment.endNodeId, 'push', rendered, byNode, visited);
    extend(
      chain,
      entry.segment.startNodeId,
      'unshift',
      rendered,
      byNode,
      visited,
    );
    chains.push(chain);
  });

  return chains;
}

function extend(
  chain: number[],
  fromNode: string,
  side: 'push' | 'unshift',
  rendered: RenderedSegment[],
  byNode: Map<string, number[]>,
  visited: Set<number>,
): void {
  let node = fromNode;
  let current = side === 'push' ? chain[chain.length - 1] : chain[0];

  for (;;) {
    if (current === undefined) return;
    const next = weldPartner(node, current, rendered, byNode);
    // A ring road welds back onto itself; `visited` stops the walk.
    if (next === null || visited.has(next)) return;

    visited.add(next);
    chain[side](next);
    node = otherEnd(rendered[next]!.segment, node);
    current = next;
  }
}

/** The node each end of the chain terminates at, in drawing order. */
function chainEndNodes(
  chain: number[],
  rendered: RenderedSegment[],
): [string, string] {
  const first = rendered[chain[0]!]!.segment;
  const last = rendered[chain[chain.length - 1]!]!.segment;

  if (chain.length === 1) return [first.startNodeId, first.endNodeId];

  const second = rendered[chain[1]!]!.segment;
  const shared =
    first.endNodeId === second.startNodeId ||
    first.endNodeId === second.endNodeId
      ? first.endNodeId
      : first.startNodeId;
  const start = otherEnd(first, shared);

  const beforeLast = rendered[chain[chain.length - 2]!]!.segment;
  const sharedLast =
    last.startNodeId === beforeLast.startNodeId ||
    last.startNodeId === beforeLast.endNodeId
      ? last.startNodeId
      : last.endNodeId;

  return [start, otherEnd(last, sharedLast)];
}

function chainCoordinates(
  chain: number[],
  startNode: string,
  rendered: RenderedSegment[],
  nodeById: Map<string, RoadNode>,
): [number, number][] {
  const coordinates: [number, number][] = [];
  let node = startNode;

  for (const index of chain) {
    const { segment } = rendered[index]!;
    const forward = segment.startNodeId === node;
    const points = forward ? segment.points : [...segment.points].reverse();
    const tail = otherEnd(segment, node);

    if (coordinates.length === 0) {
      coordinates.push(csToGeoArray(nodeById.get(node)!.position));
    }
    coordinates.push(...points.map(csToGeoArray));
    coordinates.push(csToGeoArray(nodeById.get(tail)!.position));
    node = tail;
  }

  return coordinates;
}

function isElevated(segment: RoadSegment): boolean {
  return (
    segment.wayType.includes('Bridge') || segment.wayType.includes('Elevated')
  );
}

/**
 * Whether the ends of the chain should be closed off with a round cap.
 *
 * @remarks
 * On the elevated layers a round cap juts half a casing-width past the node,
 * and because that casing is darker than the surface network it reads as a lid
 * dropped across the road. That only matters where the chain meets something
 * drawn at grade; against other elevated lines the cap is the same colour and
 * simply fills the joint. So: cap unless this chain touches the ground network.
 */
function capsEnds(
  chain: number[],
  endNodes: [string, string],
  rendered: RenderedSegment[],
  byNode: Map<string, number[]>,
): boolean {
  const members = new Set(chain);

  for (const nodeId of endNodes) {
    for (const index of byNode.get(nodeId) ?? []) {
      if (members.has(index)) continue;
      if (!isElevated(rendered[index]!.segment)) return false;
    }
  }

  return true;
}

function isValidSegment(
  segment: RoadSegment,
  nodeMap: Map<string, RoadNode>,
): boolean {
  return nodeMap.has(segment.startNodeId) && nodeMap.has(segment.endNodeId);
}

/**
 * Builds the welded chain's single `LineString` feature.
 *
 * @remarks
 * The chain's `itemClass` and `category` are read off its **first** segment.
 * That is only correct because {@link signatureOf} includes `segment.itemClass`
 * and segments only weld when their signatures match, which makes every chain
 * item-class-homogeneous by construction. Drop `itemClass` from the signature
 * and this silently starts labelling a whole chain by whichever end happened to
 * come first — so the two must change together.
 */
/**
 * Categories whose detail-zoom width follows the segment's real width, so the
 * street edge meets the building frontage. Highways keep their cartographic
 * weight: no lots front onto them.
 */
const WORLD_LOCKED_CATEGORIES: ReadonlySet<RoadCategory> = new Set([
  'road',
  'runway',
]);

function createChainFeature(
  chain: number[],
  rendered: RenderedSegment[],
  byNode: Map<string, number[]>,
  nodeById: Map<string, RoadNode>,
): RoadFeature {
  const { segment, tier } = rendered[chain[0]!]!;
  const endNodes = chainEndNodes(chain, rendered);
  const { fixed, scaled } = ROAD_WIDTH_STYLES[tier];
  const category = classifyRoadCategory(segment.itemClass);

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: chainCoordinates(chain, endNodes[0], rendered, nodeById),
    },
    properties: {
      id: segment.id,
      itemClass: segment.itemClass,
      tier,
      category,
      isTunnel: segment.wayType.includes('Tunnel'),
      isBridge: segment.wayType.includes('Bridge'),
      isElevated: segment.wayType.includes('Elevated'),
      isUnderground: segment.wayType.includes('Underground'),
      capEnds: capsEnds(chain, endNodes, rendered, byNode),
      width: segment.width,
      worldWidth:
        WORLD_LOCKED_CATEGORIES.has(category) && tier !== 'highway'
          ? segment.width
          : 0,
      wayType: segment.wayType.join(','),
      fixedWidth: fixed,
      scaledWidth: scaled,
      ...(segment.name ? { name: segment.name } : {}),
    },
  };
}

/** One street-name label line: every same-name way stitched end to end. */
export interface RoadLabelFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  properties: { name: string; tier: RoadTier };
}

/** Sharpest turn (≈60°) a label line may take through a junction. */
const MIN_LABEL_TURN_COS = 0.5;

/**
 * Stitches same-name road lines through junctions into long label lines.
 *
 * @remarks
 * Welded render features stop at every junction, so a street is one block
 * long per feature and its name rarely fits: MapLibre drops a line label that
 * is longer than its line. Web maps label the *street*, not the block. Here,
 * at each shared endpoint the walk continues into the straightest unused
 * same-name, same-tier line, never turning sharper than ~60°.
 */
export function buildRoadLabelsGeoJson(roads: RoadsFeatureCollection): {
  type: 'FeatureCollection';
  features: RoadLabelFeature[];
} {
  const groups = new Map<string, RoadFeature[]>();
  for (const feature of roads.features) {
    const { name, category, tier } = feature.properties;
    if (!name || category !== 'road') continue;
    const key = `${tier}|${name}`;
    const group = groups.get(key);
    if (group) group.push(feature);
    else groups.set(key, [feature]);
  }

  const features: RoadLabelFeature[] = [];
  for (const group of groups.values()) {
    const { name, tier } = group[0]!.properties;
    for (const coordinates of stitchLines(
      group.map((f) => f.geometry.coordinates),
    )) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: { name: name!, tier },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

const pointKey = (p: number[]) => `${p[0]},${p[1]}`;

function stitchLines(lines: number[][][]): number[][][] {
  const byEnd = new Map<string, number[]>();
  lines.forEach((line, i) => {
    for (const end of [line[0]!, line[line.length - 1]!]) {
      const at = byEnd.get(pointKey(end));
      if (at) at.push(i);
      else byEnd.set(pointKey(end), [i]);
    }
  });
  const used = new Set<number>();

  // Extends `path` forward from its last point; returns it for chaining.
  const extend = (path: number[][]): number[][] => {
    for (;;) {
      const tail = path[path.length - 1]!;
      const before = path[path.length - 2]!;
      let best = -1;
      let bestCos = MIN_LABEL_TURN_COS;
      let bestLine: number[][] = [];
      for (const i of byEnd.get(pointKey(tail)) ?? []) {
        if (used.has(i)) continue;
        const line = lines[i]!;
        const oriented =
          pointKey(line[0]!) === pointKey(tail) ? line : [...line].reverse();
        const cos = turnCos(before, tail, oriented[1]!);
        if (cos > bestCos) {
          best = i;
          bestCos = cos;
          bestLine = oriented;
        }
      }
      if (best < 0) return path;
      used.add(best);
      path.push(...bestLine.slice(1));
    }
  };

  // Start from dead ends first so each walk covers a street end to end.
  const order = lines
    .map((_, i) => i)
    .sort((a, b) => endDegree(lines[a]!, byEnd) - endDegree(lines[b]!, byEnd));

  const out: number[][][] = [];
  for (const i of order) {
    if (used.has(i)) continue;
    used.add(i);
    const forward = extend([...lines[i]!]);
    out.push(withoutRepeats(extend(forward.reverse())));
  }
  return out;
}

/**
 * Drops consecutive duplicate points. `.vellummap` curves repeat their node at
 * each end, and a zero-length step has no direction: MapLibre's line-label
 * angle check then rejects every label that spans one.
 */
function withoutRepeats(path: number[][]): number[][] {
  return path.filter(
    (p, i) => i === 0 || pointKey(p) !== pointKey(path[i - 1]!),
  );
}

function endDegree(line: number[][], byEnd: Map<string, number[]>): number {
  return Math.min(
    byEnd.get(pointKey(line[0]!))!.length,
    byEnd.get(pointKey(line[line.length - 1]!))!.length,
  );
}

/** Cosine of the turn a → b → c (1 = straight on). */
function turnCos(a: number[], b: number[], c: number[]): number {
  const ux = b[0]! - a[0]!;
  const uy = b[1]! - a[1]!;
  const vx = c[0]! - b[0]!;
  const vy = c[1]! - b[1]!;
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  return len === 0 ? 1 : (ux * vx + uy * vy) / len;
}
