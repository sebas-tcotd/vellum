/**
 * Node splitting for base grids with fewer ports than a node has corridors
 * (SSTD 2021 §2, Bast, Brosi & Storandt).
 *
 * @remarks
 * An orthoradial cell has four ports and an octilinear one eight. A node with
 * more corridors than that cannot leave each corridor on a port of its own, so
 * two of them would run over the same grid step — one line drawn on top of
 * another, which Story 4.9 forbids. SSTD's fix, followed here: a contiguous run
 * of the node's corridors (in circular order) moves to a new node at the same
 * place, and a synthetic corridor joins the two. The synthetic corridor carries
 * the lines that cross between the run and the rest of the node, plus the lines
 * of the run that end at the node, so every line still reaches the node it
 * reaches in the data. Its strokes are real strokes of real lines; only its
 * identity is synthetic, and {@link isSplitCorridorId} says so.
 *
 * Only the schematic grid strategies use this, on their own copy of the
 * network. The geographic map and the geographic schematic never see it.
 */

import { CS1_LAT_SIGN, type CsPoint } from '../../coordinate-transform';
import type {
  CorridorTransition,
  LineGraphEdge,
  LineGraphNode,
  TransitNetwork,
} from '../../types/transit-network';
import { byString } from './contract';
import { departureAngle, normalizeAngle } from './corridor-angles';

/** Prefix of every node and corridor id this module creates. */
export const SPLIT_ID_PREFIX = 'split:';

/**
 * How far (world meters) the new node sits from the one it was split off,
 * towards the corridors it took. Far below a grid cell, so both seed the same
 * area; just enough for the synthetic corridor to have a direction.
 */
export const SPLIT_NODE_OFFSET_M = 1;

/** Whether `edgeId` names a corridor created by {@link splitHighDegreeNodes}. */
export function isSplitCorridorId(edgeId: string): boolean {
  return edgeId.startsWith(SPLIT_ID_PREFIX);
}

/** Lines that ride a corridor, through its bundles. */
function linesOf(network: TransitNetwork, edge: LineGraphEdge): string[] {
  const lines = new Set<string>();
  for (const bundleId of edge.bundleIds) {
    for (const lineId of network.bundles.get(bundleId)?.lineIds ?? []) {
      if (network.lines.has(lineId)) lines.add(lineId);
    }
  }
  return [...lines].sort(byString);
}

/** Ports a node's corridors take: a ring leaves and returns, so it takes two. */
function portsAt(
  edges: ReadonlyMap<string, LineGraphEdge>,
  node: LineGraphNode,
): number {
  let ports = 0;
  for (const edgeId of node.edgeIds) {
    const edge = edges.get(edgeId);
    if (edge === undefined) continue;
    ports += edge.nodeA === edge.nodeB ? 2 : 1;
  }
  return ports;
}

/**
 * A copy of `network` in which no node has more ports than `maxDegree`.
 *
 * @remarks
 * For each node over the limit (in id order), the `k = ports − maxDegree + 1`
 * corridors forming the contiguous window, in geographic circular order, with
 * the fewest lines move to a new node `split:<node>:<n>`, joined to the node by
 * the synthetic corridor of the same id. The new node is split again if it is
 * itself over the limit. Rings stay on their node. Transitions are rewritten so
 * a line that crossed between the window and the rest now crosses the
 * synthetic corridor. Returns `network` itself when nothing is over the limit.
 */
export function splitHighDegreeNodes(
  network: TransitNetwork,
  maxDegree: number,
): TransitNetwork {
  if (!Number.isFinite(maxDegree) || maxDegree < 3) return network;
  const edges = new Map(network.edges);
  const nodes = new Map(network.nodes);
  let transitions: readonly CorridorTransition[] = network.transitions;
  const lineOrder = new Map(network.lineOrder);
  let changed = false;

  const queue = [...nodes.keys()].sort(byString);
  const counters = new Map<string, number>();
  while (queue.length > 0) {
    const nodeId = queue.shift() as string;
    const node = nodes.get(nodeId);
    if (node === undefined) continue;
    const ports = portsAt(edges, node);
    if (ports <= maxDegree) continue;

    // The node's corridors in geographic circular order, rings left out.
    const ends = node.edgeIds
      .map((edgeId) => edges.get(edgeId))
      .filter(
        (edge): edge is LineGraphEdge =>
          edge !== undefined && edge.nodeA !== edge.nodeB,
      )
      .map((edge) => ({
        edge,
        angle: normalizeAngle(
          departureAngle(edge.path, edge.nodeA === nodeId ? 'start' : 'end') ??
            0,
        ),
        weight: linesOf(network, edge).length,
      }))
      .sort((a, b) => a.angle - b.angle || byString(a.edge.id, b.edge.id));
    const k = ports - maxDegree + 1;
    // A window must leave at least one corridor behind, or there is nothing to
    // split it from.
    if (k < 2 || k >= ends.length) continue;

    let bestStart = 0;
    let bestWeight = Infinity;
    for (let start = 0; start < ends.length; start++) {
      let weight = 0;
      for (let i = 0; i < k; i++)
        weight += ends[(start + i) % ends.length].weight;
      if (weight < bestWeight) {
        bestWeight = weight;
        bestStart = start;
      }
    }
    const window = Array.from(
      { length: k },
      (_, i) => ends[(bestStart + i) % ends.length],
    );
    const detached = new Set(window.map((item) => item.edge.id));

    const n = (counters.get(nodeId) ?? 0) + 1;
    counters.set(nodeId, n);
    const splitId = `${SPLIT_ID_PREFIX}${nodeId}:${n}`;

    // The new node sits a meter towards the corridors it takes. Plane angle →
    // world direction: the plane's y is `-CS1_LAT_SIGN · z`.
    let sx = 0;
    let sz = 0;
    for (const item of window) {
      sx += Math.cos(item.angle);
      sz += -CS1_LAT_SIGN * Math.sin(item.angle);
    }
    // A window whose directions cancel out (two opposite arms) still needs a
    // direction, or the synthetic corridor would have no length and drop out of
    // the circular order: fall back to its first corridor's.
    if (Math.hypot(sx, sz) < 1e-9) {
      sx = Math.cos(window[0].angle);
      sz = -CS1_LAT_SIGN * Math.sin(window[0].angle);
    }
    const norm = Math.hypot(sx, sz);
    const position: CsPoint =
      norm > 0
        ? {
            x: node.position.x + (sx / norm) * SPLIT_NODE_OFFSET_M,
            z: node.position.z + (sz / norm) * SPLIT_NODE_OFFSET_M,
          }
        : { ...node.position };

    // Which lines the synthetic corridor carries: those crossing between the
    // window and the rest, and those of the window that end at the node.
    const crossing = new Set<string>();
    const continuing = new Set<string>();
    for (const t of transitions) {
      if (t.nodeId !== nodeId) continue;
      const fromIn = detached.has(t.fromEdge);
      const toIn = detached.has(t.toEdge);
      if (fromIn) continuing.add(`${t.fromEdge}|${t.lineId}`);
      if (toIn) continuing.add(`${t.toEdge}|${t.lineId}`);
      if (fromIn !== toIn) crossing.add(t.lineId);
    }
    const carried = new Set(crossing);
    for (const item of window) {
      for (const lineId of linesOf(network, item.edge)) {
        if (!continuing.has(`${item.edge.id}|${lineId}`)) carried.add(lineId);
      }
    }
    if (carried.size === 0) continue;
    changed = true;

    const bundleIds = [
      ...new Set(
        [...carried]
          .map((lineId) => network.bundleOfLine.get(lineId))
          .filter((bundleId): bundleId is string => bundleId !== undefined),
      ),
    ].sort(byString);
    const synthetic: LineGraphEdge = {
      id: splitId,
      nodeA: splitId,
      nodeB: nodeId,
      bundleIds,
      path: [position, { ...node.position }],
      segmentIds: [],
    };
    edges.set(splitId, synthetic);
    for (const item of window) {
      const edge = item.edge;
      edges.set(edge.id, {
        ...edge,
        nodeA: edge.nodeA === nodeId ? splitId : edge.nodeA,
        nodeB: edge.nodeB === nodeId ? splitId : edge.nodeB,
      });
    }
    nodes.set(nodeId, {
      ...node,
      edgeIds: [...node.edgeIds.filter((id) => !detached.has(id)), splitId],
    });
    nodes.set(splitId, {
      id: splitId,
      position,
      edgeIds: [...window.map((item) => item.edge.id), splitId],
    });

    // The synthetic corridor's slots: the window's own orders, in circular order.
    const ordered: string[] = [];
    for (const item of window) {
      for (const lineId of lineOrder.get(item.edge.id) ?? []) {
        if (carried.has(lineId) && !ordered.includes(lineId)) {
          ordered.push(lineId);
        }
      }
    }
    for (const lineId of [...carried].sort(byString)) {
      if (!ordered.includes(lineId)) ordered.push(lineId);
    }
    lineOrder.set(splitId, ordered);

    const rewritten: CorridorTransition[] = [];
    const seen = new Set<string>();
    const push = (t: CorridorTransition): void => {
      const key = `${t.lineId}|${t.nodeId}|${t.fromEdge}|${t.fromEnd}|${t.toEdge}|${t.toEnd}`;
      if (seen.has(key)) return;
      seen.add(key);
      rewritten.push(t);
    };
    for (const t of transitions) {
      if (t.nodeId !== nodeId) {
        push(t);
        continue;
      }
      const fromIn = detached.has(t.fromEdge);
      const toIn = detached.has(t.toEdge);
      if (fromIn && toIn) {
        push({ ...t, nodeId: splitId });
      } else if (fromIn) {
        push({ ...t, nodeId: splitId, toEdge: splitId, toEnd: 'start' });
        push({ ...t, fromEdge: splitId, fromEnd: 'end' });
      } else if (toIn) {
        push({ ...t, toEdge: splitId, toEnd: 'end' });
        push({ ...t, nodeId: splitId, fromEdge: splitId, fromEnd: 'start' });
      } else {
        push(t);
      }
    }
    // A window line that ends at the node rides the synthetic corridor to it,
    // so it needs a transition onto that corridor at the new node; without
    // one its stroke on the synthetic corridor is cut off from the window.
    for (const item of window) {
      const end = item.edge.nodeA === nodeId ? 'start' : 'end';
      for (const lineId of linesOf(network, item.edge)) {
        if (!carried.has(lineId)) continue;
        if (continuing.has(`${item.edge.id}|${lineId}`)) continue;
        push({
          lineId,
          nodeId: splitId,
          fromEdge: item.edge.id,
          fromEnd: end,
          toEdge: splitId,
          toEnd: 'start',
        });
      }
    }
    transitions = rewritten;
    // The new node may still be over the limit; the old one now is not.
    queue.unshift(splitId);
  }

  if (!changed) return network;
  return { ...network, edges, nodes, transitions, lineOrder };
}
