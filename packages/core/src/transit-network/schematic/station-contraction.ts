/**
 * Station contraction for the schematic diagram (Story 4.6).
 *
 * @remarks
 * A bus terminal is a little road network of its own: every line runs through
 * the bays, turns and leaves. Those internal segments reach the line graph as a
 * loose subgraph — in some terminals they do not even share a node with the
 * street — and a schematic router turns them into octagons and tails that run
 * past the station. This module removes them *before* the network is derived,
 * so the diagram sees one node per station part instead.
 *
 * The rule, in order:
 *
 * 1. **Parts.** The unique stops of one `stationId` are clustered by single
 *    linkage with a hop of at most {@link STATION_PART_HOP_M}. A stop without
 *    finite coordinates joins no part and is left untouched.
 * 2. **Node assignment.** A route node joins a part when it lies within
 *    {@link STATION_CONTRACTION_RADIUS_M} of one of the part's stops **and**
 *    every line whose route touches it stops at that part. Within reach of
 *    several parts, the nearest stop wins, then the smallest part id. A line
 *    that only passes by therefore never bends into the station.
 * 3. **Segments.** A route segment with both ends in the same part is internal
 *    and leaves every route. One with a single end (or ends in two different
 *    parts) is rewired onto the part's central node
 *    `station:<stationId>:<repId>`, dropping the curve points inside the radius.
 * 4. **Turnarounds.** A walk of one line that leaves a central node and
 *    returns to it without calling anywhere is dropped from that line's route,
 *    so a terminus whose turning loop runs just past the radius ends at the
 *    station instead of drawing a ring (see {@link turnaroundPositions}).
 * 5. **Stops.** Each line's stops of a part are replaced by one representative:
 *    the smallest stop id of the part, with its name, at the part's centroid
 *    (the central node's position). Each line keeps its own `mode`.
 *
 * Grouping is by `stationId` only — never by name or proximity, which would
 * invent transfers — so a stop without one (street stops, `.cslmap`, a
 * `.vellummap` before Story 5.7) is handled exactly as before. A city with no
 * `stationId` at all comes back as the **same reference**.
 *
 * Only the schematic uses this. The geographic map derives its network from
 * the original `CityData`.
 */

import type {
  CityData,
  PathSegment,
  RoadNode,
  RoadSegment,
  TransitStop,
  Vec3,
} from '../../types/city-data';
import type {
  TransitNetwork,
  TransitNetworkExtensions,
} from '../../types/transit-network';
import { deriveTransitNetwork } from '../derive';
import { STATION_MERGE_THRESHOLD_M } from '../stops';
import { byString } from './contract';

/**
 * How far (world meters) a route node may be from a stop of a station part to
 * be contracted into it. The same 48 m the map uses to merge stops.
 */
export const STATION_CONTRACTION_RADIUS_M = STATION_MERGE_THRESHOLD_M;

/**
 * Largest hop (world meters) between neighbouring stops of one station for
 * them to stay in the same part. Hops, not diameter: a terminal's bays span
 * 80–91 m end to end but never more than 40 m between neighbours (ADR-0006).
 */
export const STATION_PART_HOP_M = STATION_MERGE_THRESHOLD_M;

/** One part of a station: stops linked by hops of at most {@link STATION_PART_HOP_M}. */
interface StationPart {
  /** `<stationId>:<repId>`; orders parts when two are equally near a node. */
  readonly id: string;
  readonly stationId: string;
  /** The representative stop: the part's smallest stop id. */
  readonly rep: TransitStop;
  /** Every unique stop of the part, sorted by id. */
  readonly stops: readonly TransitStop[];
  readonly stopIds: ReadonlySet<string>;
  /** Lines that stop at any stop of the part. */
  readonly lineIds: ReadonlySet<string>;
  readonly centroid: Vec3;
  /** Id of the central node the part contracts into. */
  readonly nodeId: string;
}

const isFiniteStop = (stop: TransitStop): boolean =>
  Number.isFinite(stop.position.x) && Number.isFinite(stop.position.z);

const planarDistance = (
  a: { x: number; z: number },
  b: { x: number; z: number },
): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Single-linkage clusters of `stops`, each sorted by id, ordered by first id. */
function singleLinkage(stops: readonly TransitStop[]): TransitStop[][] {
  const parent = stops.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      if (
        planarDistance(stops[i].position, stops[j].position) <=
        STATION_PART_HOP_M
      ) {
        const a = find(i);
        const b = find(j);
        // Union towards the smaller index, so roots are deterministic.
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  }
  const clusters = new Map<number, TransitStop[]>();
  stops.forEach((stop, i) => {
    const root = find(i);
    const cluster = clusters.get(root);
    if (cluster === undefined) clusters.set(root, [stop]);
    else cluster.push(stop);
  });
  return [...clusters.values()]
    .map((cluster) => [...cluster].sort((a, b) => byString(a.id, b.id)))
    .sort((a, b) => byString(a[0].id, b[0].id));
}

/** Builds every station part of the city, in deterministic order. */
function stationParts(cityData: CityData): StationPart[] {
  const sortedLines = [...cityData.transitLines].sort((a, b) =>
    byString(a.id, b.id),
  );
  // Unique stops by id (the first occurrence in line-id order wins), and the
  // lines that stop at each id.
  const stopById = new Map<string, TransitStop>();
  const linesOfStop = new Map<string, Set<string>>();
  for (const line of sortedLines) {
    for (const stop of line.stops) {
      if (stop.stationId === undefined) continue;
      // The first *finite* occurrence wins: a broken copy on one line must
      // not keep the stop's good copies on other lines out of the part.
      const stored = stopById.get(stop.id);
      if (
        stored === undefined ||
        (!isFiniteStop(stored) && isFiniteStop(stop))
      ) {
        stopById.set(stop.id, stop);
      }
      let lines = linesOfStop.get(stop.id);
      if (lines === undefined) {
        lines = new Set();
        linesOfStop.set(stop.id, lines);
      }
      lines.add(line.id);
    }
  }

  const byStation = new Map<string, TransitStop[]>();
  for (const stop of [...stopById.values()].sort((a, b) =>
    byString(a.id, b.id),
  )) {
    if (!isFiniteStop(stop)) continue;
    const stationId = stop.stationId as string;
    const stops = byStation.get(stationId);
    if (stops === undefined) byStation.set(stationId, [stop]);
    else stops.push(stop);
  }

  const parts: StationPart[] = [];
  for (const stationId of [...byStation.keys()].sort(byString)) {
    for (const cluster of singleLinkage(
      byStation.get(stationId) as TransitStop[],
    )) {
      const rep = cluster[0];
      const finiteY = cluster
        .map((stop) => stop.position.y)
        .filter((y) => Number.isFinite(y));
      const centroid: Vec3 = {
        x: cluster.reduce((sum, s) => sum + s.position.x, 0) / cluster.length,
        y:
          finiteY.length > 0
            ? finiteY.reduce((sum, y) => sum + y, 0) / finiteY.length
            : 0,
        z: cluster.reduce((sum, s) => sum + s.position.z, 0) / cluster.length,
      };
      const lineIds = new Set<string>();
      for (const stop of cluster) {
        for (const lineId of linesOfStop.get(stop.id) ?? []) {
          lineIds.add(lineId);
        }
      }
      parts.push({
        id: `${stationId}:${rep.id}`,
        stationId,
        rep,
        stops: cluster,
        stopIds: new Set(cluster.map((stop) => stop.id)),
        lineIds,
        centroid,
        nodeId: `station:${stationId}:${rep.id}`,
      });
    }
  }
  return parts;
}

/** A uniform bucket grid over stop positions, so a node probes only nearby stops. */
function stopIndex(parts: readonly StationPart[]): {
  near: (p: {
    x: number;
    z: number;
  }) => readonly { part: StationPart; stop: TransitStop }[];
} {
  const cell = STATION_CONTRACTION_RADIUS_M;
  const key = (cx: number, cz: number): string => `${cx},${cz}`;
  const buckets = new Map<string, { part: StationPart; stop: TransitStop }[]>();
  for (const part of parts) {
    for (const stop of part.stops) {
      const k = key(
        Math.floor(stop.position.x / cell),
        Math.floor(stop.position.z / cell),
      );
      const bucket = buckets.get(k);
      if (bucket === undefined) buckets.set(k, [{ part, stop }]);
      else bucket.push({ part, stop });
    }
  }
  return {
    near: (p) => {
      const cx = Math.floor(p.x / cell);
      const cz = Math.floor(p.z / cell);
      const out: { part: StationPart; stop: TransitStop }[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          out.push(...(buckets.get(key(cx + dx, cz + dz)) ?? []));
        }
      }
      return out;
    },
  };
}

/** Distance from `p` to the nearest stop of `part`. */
function distanceToPart(
  part: StationPart,
  p: { x: number; z: number },
): number {
  let best = Infinity;
  for (const stop of part.stops) {
    best = Math.min(best, planarDistance(stop.position, p));
  }
  return best;
}

/**
 * Route positions (indices into the flattened, contracted route) of the
 * line's **turnarounds**: closed walks that leave a central node and come
 * back to it with no call of the line anywhere along them.
 *
 * @remarks
 * The same-spoke case generalised. A terminus whose turning track runs just
 * past the radius (San Rico's monorail termini: loops of 99 m and 152 m whose
 * far node is 49 m and 71 m from the platform) would otherwise survive as a
 * ring corridor at the central node, which the grid router draws as the very
 * octagon this story removes. Dropping the walk makes the line end at the
 * station, as it does when it enters and leaves by one spoke.
 *
 * Conservative on purpose: the walk is per line (other lines keep the same
 * segments), it never crosses a gap in the route, it is refused when any stop
 * of the line outside this part lies within {@link STATION_CONTRACTION_RADIUS_M}
 * of it, and it is refused when it would be everything the line has left.
 */
function turnaroundPositions(
  line: CityData['transitLines'][number],
  route: readonly string[],
  segmentOf: (segId: string) => RoadSegment | undefined,
  centreByNodeId: ReadonlyMap<string, StationPart>,
  positionOf: (nodeId: string) => Vec3 | undefined,
  partOfStop: ReadonlyMap<string, StationPart>,
): Set<number> {
  const removed = new Set<number>();
  if (centreByNodeId.size === 0 || route.length < 2) return removed;

  // Orient the walk: segment k runs from[k] → to[k]. A segment that does not
  // continue from the previous one starts a new piece (gap).
  const segs = route.map(segmentOf);
  const from: (string | null)[] = [];
  const to: (string | null)[] = [];
  const gapBefore: boolean[] = [];
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k];
    if (seg === undefined) {
      from.push(null);
      to.push(null);
      gapBefore.push(true);
      continue;
    }
    const prev = k > 0 ? to[k - 1] : null;
    if (prev === seg.startNodeId || prev === seg.endNodeId) {
      const forward = prev === seg.startNodeId;
      from.push(forward ? seg.startNodeId : seg.endNodeId);
      to.push(forward ? seg.endNodeId : seg.startNodeId);
      gapBefore.push(false);
      continue;
    }
    const next = segs[k + 1];
    const backward =
      next !== undefined &&
      (seg.startNodeId === next.startNodeId ||
        seg.startNodeId === next.endNodeId) &&
      seg.endNodeId !== next.startNodeId &&
      seg.endNodeId !== next.endNodeId;
    from.push(backward ? seg.endNodeId : seg.startNodeId);
    to.push(backward ? seg.startNodeId : seg.endNodeId);
    gapBefore.push(true);
  }

  const ownStops = line.stops.filter(isFiniteStop);
  const callsAlong = (part: StationPart, first: number, last: number) => {
    const polyline: Vec3[] = [];
    for (let k = first; k <= last; k++) {
      const seg = segs[k] as RoadSegment;
      const a = positionOf(from[k] as string);
      const b = positionOf(to[k] as string);
      if (a === undefined || b === undefined) return true;
      const points =
        from[k] === seg.startNodeId ? seg.points : [...seg.points].reverse();
      polyline.push(a, ...points, b);
    }
    return ownStops.some((stop) => {
      if (partOfStop.get(stop.id) === part) return false;
      for (let i = 1; i < polyline.length; i++) {
        if (
          distanceToSegment(stop.position, polyline[i - 1], polyline[i]) <=
          STATION_CONTRACTION_RADIUS_M
        ) {
          return true;
        }
      }
      return false;
    });
  };

  // Only segments the network can draw count as "what the line has left": an
  // id missing from the road network is no route at all.
  let remaining = segs.filter((seg) => seg !== undefined).length;
  let k = 0;
  while (k < segs.length) {
    const centre = from[k] === null ? undefined : centreByNodeId.get(from[k]!);
    if (centre === undefined) {
      k++;
      continue;
    }
    let close = -1;
    for (let t = k; t < segs.length; t++) {
      if (t > k && gapBefore[t]) break;
      if (to[t] === null) break;
      if (to[t] === from[k]) {
        close = t;
        break;
      }
    }
    if (
      close < 0 ||
      close - k + 1 >= remaining ||
      callsAlong(centre, k, close)
    ) {
      k++;
      continue;
    }
    for (let t = k; t <= close; t++) removed.add(t);
    remaining -= close - k + 1;
    k = close + 1;
  }
  return removed;
}

/** Planar distance from `p` to the segment `a`–`b`. */
function distanceToSegment(
  p: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/**
 * Contracts every station part of the city into one central node, for the
 * schematic diagram only. See the module comment for the rule.
 *
 * @returns A new `CityData`, or `cityData` itself when no stop carries a
 *   `stationId`. The input is never mutated.
 */
export function contractSchematicStations(cityData: CityData): CityData {
  const hasStationIds = cityData.transitLines.some((line) =>
    line.stops.some((stop) => stop.stationId !== undefined),
  );
  if (!hasStationIds) return cityData;

  const parts = stationParts(cityData);
  if (parts.length === 0) return cityData;

  const nodeById = new Map(cityData.roadNodes.map((n) => [n.id, n]));
  const segById = new Map(cityData.roadSegments.map((s) => [s.id, s]));

  // Lines touching each route node, through any segment of their route.
  const linesAtNode = new Map<string, Set<string>>();
  const touch = (nodeId: string, lineId: string): void => {
    let lines = linesAtNode.get(nodeId);
    if (lines === undefined) {
      lines = new Set();
      linesAtNode.set(nodeId, lines);
    }
    lines.add(lineId);
  };
  for (const line of cityData.transitLines) {
    for (const pathSeg of line.route) {
      for (const segId of pathSeg.segmentIds) {
        const seg = segById.get(segId);
        if (seg === undefined) continue;
        touch(seg.startNodeId, line.id);
        touch(seg.endNodeId, line.id);
      }
    }
  }

  // ── Node assignment.
  const index = stopIndex(parts);
  const partOfNode = new Map<string, StationPart>();
  for (const nodeId of [...linesAtNode.keys()].sort(byString)) {
    const node = nodeById.get(nodeId);
    if (
      node === undefined ||
      !Number.isFinite(node.position.x) ||
      !Number.isFinite(node.position.z)
    ) {
      continue;
    }
    const lines = linesAtNode.get(nodeId) as Set<string>;
    let best: StationPart | null = null;
    let bestDistance = Infinity;
    const probed = new Set<StationPart>();
    for (const { part } of index.near(node.position)) {
      if (probed.has(part)) continue;
      probed.add(part);
      const d = distanceToPart(part, node.position);
      if (d > STATION_CONTRACTION_RADIUS_M) continue;
      // Every line touching the node must stop here, or one that passes by
      // would be drawn as if it ran through the station.
      if (![...lines].every((lineId) => part.lineIds.has(lineId))) continue;
      if (
        d < bestDistance ||
        (d === bestDistance && best !== null && byString(part.id, best.id) < 0)
      ) {
        best = part;
        bestDistance = d;
      }
    }
    if (best !== null) partOfNode.set(nodeId, best);
  }

  // ── Segments: internal ones leave the routes, spokes are rewired.
  const internal = new Set<string>();
  const rewired = new Map<string, RoadSegment>();
  const usedParts = new Set<StationPart>();
  const routeSegIds = new Set(
    cityData.transitLines.flatMap((line) =>
      line.route.flatMap((r) => r.segmentIds),
    ),
  );
  for (const segId of [...routeSegIds].sort(byString)) {
    const seg = segById.get(segId);
    if (seg === undefined) continue;
    const startPart = partOfNode.get(seg.startNodeId);
    const endPart = partOfNode.get(seg.endNodeId);
    if (startPart === undefined && endPart === undefined) continue;
    if (startPart !== undefined && startPart === endPart) {
      internal.add(segId);
      continue;
    }
    const insideAnEnd = (p: Vec3): boolean =>
      (startPart !== undefined &&
        distanceToPart(startPart, p) <= STATION_CONTRACTION_RADIUS_M) ||
      (endPart !== undefined &&
        distanceToPart(endPart, p) <= STATION_CONTRACTION_RADIUS_M);
    if (startPart !== undefined) usedParts.add(startPart);
    if (endPart !== undefined) usedParts.add(endPart);
    rewired.set(segId, {
      ...seg,
      startNodeId: startPart?.nodeId ?? seg.startNodeId,
      endNodeId: endPart?.nodeId ?? seg.endNodeId,
      points: seg.points.filter((p) => !insideAnEnd(p)),
    });
  }

  const centralNodes: RoadNode[] = parts
    .filter((part) => usedParts.has(part))
    .map((part) => ({ id: part.nodeId, position: { ...part.centroid } }));

  const centreByNodeId = new Map(
    parts.filter((part) => usedParts.has(part)).map((p) => [p.nodeId, p]),
  );
  const positionOf = (nodeId: string): Vec3 | undefined =>
    centreByNodeId.get(nodeId)?.centroid ?? nodeById.get(nodeId)?.position;

  // ── Stops: one representative per part and line.
  const partOfStop = new Map<string, StationPart>();
  for (const part of parts) {
    for (const stopId of part.stopIds) partOfStop.set(stopId, part);
  }
  const representative = (
    stop: TransitStop,
    part: StationPart,
  ): TransitStop => ({
    id: part.rep.id,
    mode: stop.mode,
    position: { ...part.centroid },
    name: part.rep.name,
    ...(part.rep.nameDerived === undefined
      ? {}
      : { nameDerived: part.rep.nameDerived }),
    stationId: part.stationId,
  });

  const transitLines = cityData.transitLines.map((line) => {
    const stops: TransitStop[] = [];
    for (const stop of line.stops) {
      const part =
        stop.stationId === undefined ? undefined : partOfStop.get(stop.id);
      // A stop with a non-finite position is in no part and stays as it is.
      const next =
        part === undefined || !isFiniteStop(stop)
          ? stop
          : representative(stop, part);
      // Consecutive bays of one part collapse into one call at the station.
      if (part !== undefined && stops.at(-1)?.id === next.id) continue;
      stops.push(next);
    }
    const kept = line.route.map((pathSeg) =>
      pathSeg.segmentIds.filter((segId) => !internal.has(segId)),
    );
    const turnarounds = turnaroundPositions(
      line,
      kept.flat(),
      (segId) => rewired.get(segId) ?? segById.get(segId),
      centreByNodeId,
      positionOf,
      partOfStop,
    );
    let at = 0;
    const route: PathSegment[] = kept.map((segmentIds) => ({
      segmentIds: segmentIds.filter(() => !turnarounds.has(at++)),
    }));
    return { ...line, stops, route };
  });

  return {
    ...cityData,
    roadNodes: [...cityData.roadNodes, ...centralNodes],
    roadSegments: cityData.roadSegments.map(
      (seg) => rewired.get(seg.id) ?? seg,
    ),
    transitLines,
  };
}

/**
 * The transit network the schematic diagram is laid out from: the city with
 * its stations contracted ({@link contractSchematicStations}), derived exactly
 * as `deriveTransitNetwork` derives the map's.
 */
export function deriveSchematicTransitNetwork(
  cityData: CityData,
  extensions?: TransitNetworkExtensions,
): TransitNetwork {
  return deriveTransitNetwork(contractSchematicStations(cityData), extensions);
}
