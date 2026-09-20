/**
 * The schematic rendering stage: LOOM §5's four steps, applied to corridors a
 * schematic strategy routed instead of to the geographic ones.
 *
 * @remarks
 * `../render-geometry` runs the same four steps for the map. It cannot simply be
 * called here, because two of the four are calibrated to MapLibre: step 1 is
 * delegated to the GPU (`line-offset`) and never materialises a polyline, and
 * step 3 draws cubic Béziers. So this module runs the four steps over the
 * *schematic* frame, reusing every part that is not MapLibre-shaped:
 *
 * 1. **Offset lines.** `slotOffsetIndex` — the one formula ADR-0004 allows —
 *    times {@link SCHEMATIC_SLOT}, materialised by `./offset.ts` because SVG has
 *    no `line-offset`. The hand is `offsetTowards`, calibrated against the map's
 *    `rightOf` rather than copied from it.
 * 2. **Free node area.** The same static trim as the map's corridor builder:
 *    node padding plus half the widest incident bundle, capped at
 *    `MAX_TRIM_FRACTION` of the corridor, and zero at a leaf or a ring.
 * 3. **Inner connections.** A tangent circular arc, or a straight line when the
 *    ports already face each other — *not* a Bézier. LOOM says so explicitly for
 *    schematic maps (§5, Fig. 26.3): on an octilinear grid an arc preserves the
 *    grammar a Bézier would break.
 * 4. **Stations.** The map's capsule rule verbatim: long axis *across* the
 *    corridor, spanning only the slots of the lines that actually stop, so a
 *    single-line stop degenerates to a circle.
 *
 * Everything here is in viewBox units and runs *after* normalisation, which is
 * what makes it correct: the offset is a fixed number of viewBox units, so
 * scaling it with the network would make parallel lines drift out of their slots
 * at every city size.
 */

import type { CorridorTransition, LineInfo } from '../../types/transit-network';
import {
  cubicBezier,
  cutEnd,
  cutStart,
  pointAtFraction,
  polylineLength,
  roundedRectRing,
  vAdd,
  vCross,
  vDot,
  vScale,
  vSub,
  vUnit,
  type Vec2,
} from '../geometry-kit';
import {
  BEZIER_ARM_FACTOR,
  MAX_TRIM_FRACTION,
} from '../render-geometry/config';
import {
  byString,
  SCHEMATIC_SLOT,
  SCHEMATIC_NODE_PAD,
  SCHEMATIC_STATION_ACROSS_MARGIN,
  SCHEMATIC_STATION_CORNER_STEPS,
  SCHEMATIC_STATION_HALF_THICKNESS,
  type SchematicCorridor,
  type SchematicPoint,
  type SchematicSegment,
  type SchematicSlot,
  type SchematicStation,
} from './contract';
import { offsetPolyline, offsetTowards } from './offset';

/** Sample count of one inner-connection arc. Matches the map's Bézier sampling. */
export const SCHEMATIC_ARC_SAMPLES = 8;

/** A corridor a strategy placed, before any drawing. */
export interface PlacedCorridor {
  readonly edgeId: string;
  /** Endpoint node ids; `nodeA === nodeB` marks a ring. */
  readonly nodeA: string;
  readonly nodeB: string;
  /** Untrimmed centerline in viewBox units, oriented nodeA → nodeB. */
  readonly points: readonly SchematicPoint[];
  /** Slots left-to-right along that direction. */
  readonly slots: readonly SchematicSlot[];
}

/** A stop a strategy placed on a corridor, by arc fraction of its centerline. */
export interface PlacedStop {
  readonly id: string;
  readonly edgeId: string;
  /** Arc fraction along the corridor's untrimmed centerline, in `[0, 1]`. */
  readonly fraction: number;
  /** Lines that stop here, sorted. */
  readonly lineIds: readonly string[];
}

/** What a node contributes to the free area around it. */
export interface NodeExtent {
  /** Incident corridor count: a leaf (fewer than two) is never trimmed. */
  readonly degree: number;
  /** Slots of the widest incident corridor. */
  readonly maxSlotCount: number;
}

/** Everything the rendering stage needs, and nothing about how it was routed. */
export interface SchematicRenderInput {
  readonly corridors: readonly PlacedCorridor[];
  readonly stops: readonly PlacedStop[];
  readonly transitions: readonly CorridorTransition[];
  readonly lines: ReadonlyMap<string, LineInfo>;
  readonly nodes: ReadonlyMap<string, NodeExtent>;
}

/** The drawable output of the rendering stage, unfrozen. */
export interface SchematicRenderOutput {
  readonly corridors: readonly SchematicCorridor[];
  readonly segments: readonly SchematicSegment[];
  readonly connectors: readonly SchematicSegment[];
  readonly stations: readonly SchematicStation[];
  /**
   * Stops whose arc fraction landed inside a node's free area and had to be
   * pulled back onto the drawn stroke.
   *
   * @remarks
   * Not a defect — a short corridor between two busy junctions can be almost
   * entirely free area — but it *is* a placement the strategy did not choose, and
   * `maxStationOffRoute` is measured against the centerline and so cannot see it.
   * Reported so it is a number instead of a silent nudge.
   */
  readonly stationsClampedToNodeArea: number;
}

const toVec = (p: SchematicPoint): Vec2 => [p.x, p.y];
const toPoint = (v: Vec2): SchematicPoint => ({ x: v[0], y: v[1] });

/** The trimmed centerline of a corridor: the map's rule, in viewBox units. */
interface TrimmedCorridor {
  readonly placed: PlacedCorridor;
  readonly trimmed: readonly SchematicPoint[];
  /** Arc length cut from the start, in viewBox units. */
  readonly trimA: number;
  /** Arc length of the untrimmed centerline. */
  readonly total: number;
  /** Arc length of what survived the trim. */
  readonly trimmedLength: number;
}

/**
 * Static free-area distance at a node: padding plus half the widest incident
 * bundle. A leaf node has nothing to make room for.
 */
function trimDistanceAt(
  nodes: ReadonlyMap<string, NodeExtent>,
  nodeId: string,
): number {
  const node = nodes.get(nodeId);
  if (node === undefined || node.degree < 2) return 0;
  return SCHEMATIC_NODE_PAD + (node.maxSlotCount * SCHEMATIC_SLOT) / 2;
}

function trimCorridor(
  placed: PlacedCorridor,
  nodes: ReadonlyMap<string, NodeExtent>,
): TrimmedCorridor {
  const path = placed.points.map(toVec);
  const total = polylineLength(path);
  const maxTrim = total * MAX_TRIM_FRACTION;
  // A ring starts and ends at the same node: trimming both ends of it would eat
  // the corridor from both sides of one free area.
  const ring = placed.nodeA === placed.nodeB;
  const trimA = ring
    ? 0
    : Math.min(trimDistanceAt(nodes, placed.nodeA), maxTrim);
  const trimB = ring
    ? 0
    : Math.min(trimDistanceAt(nodes, placed.nodeB), maxTrim);
  const cut = cutEnd(cutStart(path, trimA), trimB);
  // A trim that consumed the corridor leaves nothing to offset; the untrimmed
  // centerline still draws the stroke, which is better than dropping it — and
  // then nothing was really cut, so the arc-length bookkeeping says so too.
  const kept = cut.length >= 2 ? cut : path;
  const keptEverything = kept === path;
  return {
    placed,
    trimmed: kept.map(toPoint),
    trimA: keptEverything ? 0 : trimA,
    total,
    trimmedLength: keptEverything ? total : polylineLength(kept),
  };
}

/** Travel direction at one end of a polyline, pointing out of it. */
function endDirection(
  points: readonly SchematicPoint[],
  at: 'start' | 'end',
): Vec2 {
  if (points.length < 2) return [1, 0];
  return at === 'start'
    ? vUnit(vSub(toVec(points[0]), toVec(points[1])))
    : vUnit(
        vSub(
          toVec(points[points.length - 1]),
          toVec(points[points.length - 2]),
        ),
      );
}

/** Port of one slot at one end of a trimmed corridor. */
function portAt(
  corridor: TrimmedCorridor,
  offsetIndex: number,
  at: 'start' | 'end',
): SchematicPoint {
  const anchor =
    at === 'start'
      ? corridor.trimmed[0]
      : corridor.trimmed[corridor.trimmed.length - 1];
  // `offsetTowards` is defined on the *travel* direction (nodeA → nodeB), so the
  // outward direction at the start has to be flipped back before it is used —
  // otherwise the two ends of one corridor would offset to opposite hands.
  const travel =
    at === 'start'
      ? vScale(endDirection(corridor.trimmed, 'start'), -1)
      : endDirection(corridor.trimmed, 'end');
  const hand = offsetTowards(toPoint(travel));
  return {
    x: anchor.x + hand.x * offsetIndex * SCHEMATIC_SLOT,
    y: anchor.y + hand.y * offsetIndex * SCHEMATIC_SLOT,
  };
}

/**
 * The inner connection between two ports: a pair of circular arcs tangent to the
 * corridor at **both** ends, or the straight chord when a straight line already
 * is that.
 *
 * @remarks
 * LOOM prefers an arc or a straight line over a Bézier for schematic maps (§5,
 * Fig. 26.3), and the first implementation here followed that literally. It does
 * not survive contact with the requirement it has to meet: a **single** arc
 * through two given points can match a prescribed tangent at only one of them,
 * and tangency at just the departing end leaves a visible kink at the arriving
 * stroke — precisely the joint a reader looks at. The equal-radius biarc that
 * does give tangency at both ends solves a quadratic whose admissible branch is
 * easy to pick wrong: for two ports 72 units apart it drew a loop reaching 184
 * units away, right across the diagram.
 *
 * So this is the cubic Bézier the geographic map already uses
 * (`render-geometry/builders/connector-builder.ts`), with arms along the two
 * tangents. It is tangent at both ends by construction, it is scale-invariant
 * because the arms are a fraction of the chord, and — the property the biarc
 * lacked — it never leaves the convex hull of its four control points, so a
 * connector cannot wander outside the node area it belongs to. Its freedom to
 * curve between the ends costs nothing here: the octilinear and orthoradial
 * conformance checks exempt connectors by design, because a joint inside a node
 * is not part of either grammar.
 *
 * @param p - Port on the departing corridor.
 * @param outwardP - Unit direction out of the departing corridor at `p`.
 * @param q - Port on the arriving corridor.
 * @param outwardQ - Unit direction out of the arriving corridor at `q`. The
 *   connector arrives at `q` along its negation.
 */
export function innerConnection(
  p: SchematicPoint,
  outwardP: SchematicPoint,
  q: SchematicPoint,
  outwardQ: SchematicPoint,
): SchematicPoint[] {
  const from = toVec(p);
  const to = toVec(q);
  const chord = vSub(to, from);
  const chordLength = Math.hypot(chord[0], chord[1]);
  const straight = (): SchematicPoint[] => [
    { x: p.x, y: p.y },
    { x: q.x, y: q.y },
  ];
  if (chordLength <= 1e-9) return straight();

  // Travel directions: out of the departing corridor, and *into* the arriving one.
  const t1 = vUnit(toVec(outwardP));
  const t2 = vScale(vUnit(toVec(outwardQ)), -1);
  const along = vScale(chord, 1 / chordLength);
  // A straight line already is the both-ends-tangent answer when the chord runs
  // along both tangents. Checked against the chord, not between the tangents, so
  // two parallel-but-offset ports still get a curve.
  if (
    Math.abs(vCross(t1, along)) <= 1e-9 &&
    Math.abs(vCross(t2, along)) <= 1e-9 &&
    vDot(t1, along) > 0 &&
    vDot(t2, along) > 0
  ) {
    return straight();
  }

  const arm = chordLength * BEZIER_ARM_FACTOR;
  const control1 = vAdd(from, vScale(t1, arm));
  const control2 = vSub(to, vScale(t2, arm));
  const points = cubicBezier(
    from,
    control1,
    control2,
    to,
    SCHEMATIC_ARC_SAMPLES,
  ).map(toPoint);
  // Sampling is exact at the ends; pinning them removes the float drift that
  // would otherwise leave a hairline gap between a connector and its stroke.
  points[0] = { x: p.x, y: p.y };
  points[points.length - 1] = { x: q.x, y: q.y };
  return points;
}

/** Direction of the centerline at an arc fraction, as a unit vector. */
function directionAtFraction(
  points: readonly SchematicPoint[],
  fraction: number,
): Vec2 {
  const path = points.map(toVec);
  const total = polylineLength(path);
  if (total <= 0 || path.length < 2) return [1, 0];
  const want = Math.min(total, Math.max(0, fraction * total));
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const length = Math.hypot(
      path[i][0] - path[i - 1][0],
      path[i][1] - path[i - 1][1],
    );
    if (travelled + length >= want || i === path.length - 1) {
      return vUnit(vSub(path[i], path[i - 1]));
    }
    travelled += length;
  }
  return [1, 0];
}

/** Offset indices of the lines that stop here, within their corridor's slots. */
function stoppingOffsets(
  slots: readonly SchematicSlot[],
  lineIds: readonly string[],
): number[] {
  const byLine = new Map(slots.map((slot) => [slot.lineId, slot.offsetIndex]));
  return lineIds
    .map((lineId) => byLine.get(lineId))
    .filter((offsetIndex): offsetIndex is number => offsetIndex !== undefined);
}

/** Runs the four rendering steps over placed corridors. */
export function renderSchematic(
  input: SchematicRenderInput,
): SchematicRenderOutput {
  const trimmedById = new Map<string, TrimmedCorridor>();
  for (const placed of input.corridors) {
    trimmedById.set(placed.edgeId, trimCorridor(placed, input.nodes));
  }

  // ── Steps 1 & 2: one offset, node-trimmed stroke per (corridor, line), in the
  // canonical emission order — corridor id, then line id. Every stroke carries its
  // own `edgeId`, so `./metrics.ts` pairs it with the network by key rather than
  // by position: the order below is a convenience for a reader, not a contract two
  // modules have to keep in step.
  const segments: SchematicSegment[] = [];
  for (const corridor of input.corridors) {
    const trimmed = trimmedById.get(corridor.edgeId) as TrimmedCorridor;
    const offsetByLine = new Map(
      corridor.slots.map((slot) => [slot.lineId, slot.offsetIndex]),
    );
    for (const lineId of [...corridor.slots.map((s) => s.lineId)].sort(
      byString,
    )) {
      const line = input.lines.get(lineId);
      if (line === undefined) continue;
      segments.push({
        lineId,
        color: line.color,
        edgeId: corridor.edgeId,
        points: offsetPolyline(
          trimmed.trimmed,
          (offsetByLine.get(lineId) ?? 0) * SCHEMATIC_SLOT,
        ),
      });
    }
  }

  // ── Step 3: one inner connection per line transition, bridging the free area
  // the trim opened. Driven by `transitions` rather than by corridor membership,
  // so a line touching three corridors at one node still connects correctly.
  const connectors: SchematicSegment[] = [];
  for (const transition of input.transitions) {
    const from = trimmedById.get(transition.fromEdge);
    const to = trimmedById.get(transition.toEdge);
    if (from === undefined || to === undefined) continue;
    const fromSlot = from.placed.slots.find(
      (slot) => slot.lineId === transition.lineId,
    );
    const toSlot = to.placed.slots.find(
      (slot) => slot.lineId === transition.lineId,
    );
    const line = input.lines.get(transition.lineId);
    if (fromSlot === undefined || toSlot === undefined || line === undefined) {
      continue;
    }
    const p = portAt(from, fromSlot.offsetIndex, transition.fromEnd);
    const q = portAt(to, toSlot.offsetIndex, transition.toEnd);
    if (Math.hypot(q.x - p.x, q.y - p.y) < 1e-9) continue;
    // `endDirection` already points *out of* the corridor at either end: the
    // direction the connector leaves `p` along, and the one it must arrive at `q`
    // against. Both are needed — tangency at one end only is what leaves a kink
    // against the stroke at the other.
    const outwardFrom = endDirection(from.trimmed, transition.fromEnd);
    const outwardTo = endDirection(to.trimmed, transition.toEnd);
    connectors.push({
      lineId: transition.lineId,
      color: line.color,
      // A connector belongs to a node, not to a corridor.
      edgeId: null,
      points: innerConnection(p, toPoint(outwardFrom), q, toPoint(outwardTo)),
    });
  }

  // ── Step 4: a capsule across the corridor, spanning only the slots of the
  // lines that stop here. A lone line's capsule is a circle, because the corner
  // radius is the smaller half-extent.
  //
  // Placed on the **trimmed** geometry, which is the one subtlety. The stop's arc
  // fraction is a fraction of the *untrimmed* centerline — that is what preserves
  // stop order along a line, and it must stay that way — but the strokes were cut
  // back from the nodes. A stop whose fraction lands inside a node's free area
  // would otherwise sit on no stroke at all, floating over the inner connections,
  // and `maxStationOffRoute` is measured against the centerline so it is
  // structurally unable to notice. The arc position is therefore converted into
  // the trimmed path's own frame and clamped to it; a clamped stop is counted, so
  // "the symbol had to be pulled out of a junction" is a number rather than a
  // silent nudge.
  const stations: SchematicStation[] = [];
  let stationsClampedToNodeArea = 0;
  for (const stop of input.stops) {
    const corridor = trimmedById.get(stop.edgeId);
    if (corridor === undefined) continue;
    const drawn = corridor.trimmed.map(toVec);
    const wanted = Math.min(
      corridor.total,
      Math.max(0, stop.fraction * corridor.total),
    );
    const alongTrimmed = wanted - corridor.trimA;
    if (alongTrimmed < -1e-9 || alongTrimmed > corridor.trimmedLength + 1e-9) {
      stationsClampedToNodeArea++;
    }
    const drawnFraction =
      corridor.trimmedLength > 0
        ? Math.min(1, Math.max(0, alongTrimmed / corridor.trimmedLength))
        : 0;
    const offsets = stoppingOffsets(corridor.placed.slots, stop.lineIds);
    // A stop whose lines ride no slot of this corridor has no slots to span. The
    // symbol still belongs on the centerline rather than nowhere.
    const spread = offsets.length > 0 ? offsets : [0];
    const minOffset = Math.min(...spread);
    const maxOffset = Math.max(...spread);
    const along = directionAtFraction(corridor.trimmed, drawnFraction);
    const across = toVec(offsetTowards(toPoint(along)));
    const on = pointAtFraction(drawn, drawnFraction);
    const centre = [
      on[0] + across[0] * ((minOffset + maxOffset) / 2) * SCHEMATIC_SLOT,
      on[1] + across[1] * ((minOffset + maxOffset) / 2) * SCHEMATIC_SLOT,
    ] as Vec2;
    const halfAcross = Math.max(
      ((maxOffset - minOffset) / 2) * SCHEMATIC_SLOT +
        SCHEMATIC_STATION_ACROSS_MARGIN,
      SCHEMATIC_STATION_HALF_THICKNESS,
    );
    const modes = new Set(
      stop.lineIds
        .map((lineId) => input.lines.get(lineId)?.mode)
        .filter((mode) => mode !== undefined),
    );
    stations.push({
      id: stop.id,
      x: centre[0],
      y: centre[1],
      edgeId: stop.edgeId,
      lineIds: stop.lineIds,
      shape: roundedRectRing(
        centre,
        along,
        across,
        SCHEMATIC_STATION_HALF_THICKNESS,
        halfAcross,
        SCHEMATIC_STATION_CORNER_STEPS,
      ).map(toPoint),
      confirmedTransfer: modes.size >= 2,
    });
  }

  return {
    corridors: input.corridors.map((corridor) => ({
      edgeId: corridor.edgeId,
      points: corridor.points,
      slots: corridor.slots,
    })),
    segments,
    connectors,
    stations,
    stationsClampedToNodeArea,
  };
}
