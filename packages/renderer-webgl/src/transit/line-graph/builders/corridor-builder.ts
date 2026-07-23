/**
 * Corridor contraction — pruning rule 1 (Lemma 4.2) of
 * {@link buildTransitLineGraph}: degree-2 nodes whose two incident base
 * segments carry the same line set are contracted away, so the line graph's
 * edges are maximal corridors rather than individual road segments.
 */

import type { BaseSegment, LineGraphEdge } from '../types';
import type { CsPoint } from '../../../coordinate-transform';
import { keyOfLineSet } from '../utils/keys';
import { getOrCreate } from '../utils/collections';
import { dist2 } from '../utils/geo';

/** Result of {@link contractCorridors}. */
export interface CorridorResult {
  /** Corridor edges keyed by edge id. */
  edges: Map<string, LineGraphEdge>;
  /** Road segment id → the corridor edge id that contains it. */
  segmentToCorridor: Map<string, string>;
}

/**
 * Walks the base graph from every non-interior (junction/terminus) endpoint,
 * contracting chains of same-line-set segments into corridor edges, then
 * sweeps up any remaining pure rings (every node interior) as self-loops.
 */
export function contractCorridors(
  baseSegs: Map<string, BaseSegment>,
  bundleOfLine: Map<string, string>,
): CorridorResult {
  const nodeSegs = buildNodeDegreeMap(baseSegs);
  const visited = new Set<string>();
  const edges = new Map<string, LineGraphEdge>();
  const segmentToCorridor = new Map<string, string>();

  const isInterior = (nodeId: string) =>
    checkIsInterior(nodeId, nodeSegs, baseSegs);

  for (const segId of [...baseSegs.keys()].sort()) {
    if (visited.has(segId)) continue;

    const bs = baseSegs.get(segId);
    if (!bs) continue;

    const startFromA = !isInterior(bs.startNodeId);
    const startFromB = !isInterior(bs.endNodeId);
    if (!startFromA && !startFromB) continue;

    const anchor = startFromA ? bs.startNodeId : bs.endNodeId;
    const { segs, end } = walkCorridor(
      segId,
      anchor,
      baseSegs,
      nodeSegs,
      isInterior,
      visited,
    );

    addEdge(
      segs,
      anchor,
      end,
      baseSegs,
      bundleOfLine,
      edges,
      segmentToCorridor,
    );
  }

  // Pure rings
  for (const segId of [...baseSegs.keys()].sort()) {
    if (visited.has(segId)) continue;

    const bs = baseSegs.get(segId);
    if (!bs) continue;

    const { segs } = walkCorridor(
      segId,
      bs.startNodeId,
      baseSegs,
      nodeSegs,
      isInterior,
      visited,
    );
    addEdge(
      segs,
      bs.startNodeId,
      bs.startNodeId,
      baseSegs,
      bundleOfLine,
      edges,
      segmentToCorridor,
    );
  }

  return { edges, segmentToCorridor };
}

function buildNodeDegreeMap(
  baseSegs: Map<string, BaseSegment>,
): Map<string, string[]> {
  const nodeSegs = new Map<string, string[]>();
  for (const bs of baseSegs.values()) {
    getOrCreate(nodeSegs, bs.startNodeId, () => []).push(bs.segId);
    getOrCreate(nodeSegs, bs.endNodeId, () => []).push(bs.segId);
  }
  return nodeSegs;
}

/**
 * A node is interior (contractable) iff it joins exactly two base segments
 * that carry the same line set (Lemma 4.2 guarantees no optimality loss).
 */
function checkIsInterior(
  nodeId: string,
  nodeSegs: Map<string, string[]>,
  baseSegs: Map<string, BaseSegment>,
): boolean {
  const segs = nodeSegs.get(nodeId) ?? [];
  if (segs.length !== 2) return false;

  const a = baseSegs.get(segs[0]);
  const b = baseSegs.get(segs[1]);
  if (!a || !b || a.segId === b.segId) return false;

  return keyOfLineSet(a.lineIds) === keyOfLineSet(b.lineIds);
}

/** Walks a corridor chain starting at `startSegId` away from `startNode`. */
function walkCorridor(
  startSegId: string,
  startNode: string,
  baseSegs: Map<string, BaseSegment>,
  nodeSegs: Map<string, string[]>,
  isInterior: (nodeId: string) => boolean,
  visited: Set<string>,
): { segs: string[]; end: string } {
  const segs: string[] = [];
  let cur = startSegId;
  let entry = startNode;

  for (;;) {
    segs.push(cur);
    visited.add(cur);
    const bs = baseSegs.get(cur);
    if (!bs) break;

    const exit = bs.startNodeId === entry ? bs.endNodeId : bs.startNodeId;
    if (!isInterior(exit)) return { segs, end: exit };

    const nextSegs = nodeSegs.get(exit) ?? [];
    const next = nextSegs[0] === cur ? nextSegs[1] : nextSegs[0];

    if (next === undefined || visited.has(next)) return { segs, end: exit };

    entry = exit;
    cur = next;
  }
  return { segs, end: entry };
}

/** Concatenates base-segment paths oriented along a corridor walk. */
function buildPath(
  segs: string[],
  startNode: string,
  baseSegs: Map<string, BaseSegment>,
): CsPoint[] {
  const out: CsPoint[] = [];
  let entry = startNode;

  for (const segId of segs) {
    const bs = baseSegs.get(segId);
    if (!bs) continue;

    const forward = bs.startNodeId === entry;
    const pts = forward ? bs.path : [...bs.path].reverse();

    for (const p of pts) {
      const last = out[out.length - 1];
      if (last === undefined || dist2(last, p) > 1e-12) out.push(p);
    }
    entry = forward ? bs.endNodeId : bs.startNodeId;
  }
  return out;
}

function addEdge(
  segs: string[],
  from: string,
  to: string,
  baseSegs: Map<string, BaseSegment>,
  bundleOfLine: Map<string, string>,
  edges: Map<string, LineGraphEdge>,
  segmentToCorridor: Map<string, string>,
): void {
  let nodeA = from;
  let nodeB = to;
  let chain = segs;

  if (nodeB < nodeA) {
    nodeA = to;
    nodeB = from;
    chain = [...segs].reverse();
  }

  const first = baseSegs.get(chain[0]);
  if (!first) return;

  const id = `c:${[...chain].sort()[0]}`;
  const bundleIds = [
    ...new Set(first.lineIds.map((l) => bundleOfLine.get(l) ?? l)),
  ].sort();

  edges.set(id, {
    id,
    nodeA,
    nodeB,
    bundleIds,
    path: buildPath(chain, nodeA, baseSegs),
    segmentIds: chain,
  });

  for (const segId of chain) {
    segmentToCorridor.set(segId, id);
  }
}
