import { describe, expect, it } from 'vitest';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
  transitFixture,
} from '../../testing';
import type { CityData, RoadNode, TransitStop } from '../../types/city-data';
import { deriveTransitNetwork } from '../index';
import { rightOf } from '../render-geometry/utils/vector';
import {
  SCHEMATIC_LINE_WIDTH,
  SCHEMATIC_SLOT,
  SCHEMATIC_STATION_HALF_THICKNESS,
  type SchematicLayout,
  type SchematicPoint,
} from './contract';
import { geographicSchematicLayout } from './geographic';
import { toPlane } from './grid-layout';
import { octilinearSchematicLayout } from './octilinear';
import { innerConnection, SCHEMATIC_ARC_SAMPLES } from './render';
import { turnAngle } from './offset';
import { orthoradialSchematicLayout } from './orthoradial';

const node = (id: string, x: number, z: number): RoadNode => ({
  id,
  position: { x, y: 0, z },
});
const stop = (
  id: string,
  x: number,
  z: number,
  mode: TransitStop['mode'] = 'Bus',
): TransitStop => ({ id, mode, position: { x, y: 0, z }, name: `Stop ${id}` });

/**
 * Two lines sharing one straight west→east corridor, with a stop that both call
 * at and a stop only one of them does.
 */
function sharedCorridorCity(): CityData {
  return makeCityData({
    roadNodes: [node('w', 0, 0), node('e', 1000, 0)],
    roadSegments: [
      makeRoadSegment({ id: 'main', startNodeId: 'w', endNodeId: 'e' }),
    ],
    transitLines: [
      makeTransitLine({
        id: 'A',
        color: '#ff0000',
        stops: [stop('shared', 500, 0), stop('west', 0, 0)],
        route: [{ segmentIds: ['main'] }],
      }),
      makeTransitLine({
        id: 'B',
        color: '#0000ff',
        stops: [stop('shared', 500, 0), stop('east', 1000, 0)],
        route: [{ segmentIds: ['main'] }],
      }),
    ],
  });
}

const STRATEGIES = [
  ['geographic', geographicSchematicLayout],
  ['octilinear', octilinearSchematicLayout],
  ['orthoradial', orthoradialSchematicLayout],
] as const;

/** Closest approach between two polylines, sampled at their vertices. */
function closestApproach(
  a: readonly SchematicPoint[],
  b: readonly SchematicPoint[],
): number {
  const toPiece = (
    p: SchematicPoint,
    q: SchematicPoint,
    r: SchematicPoint,
  ): number => {
    const dx = r.x - q.x;
    const dy = r.y - q.y;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p.x - q.x) * dx + (p.y - q.y) * dy) / len2),
          );
    return Math.hypot(p.x - (q.x + dx * t), p.y - (q.y + dy * t));
  };
  let best = Infinity;
  for (const p of a) {
    for (let i = 1; i < b.length; i++)
      best = Math.min(best, toPiece(p, b[i - 1], b[i]));
  }
  for (const p of b) {
    for (let i = 1; i < a.length; i++)
      best = Math.min(best, toPiece(p, a[i - 1], a[i]));
  }
  return best;
}

const strokeOf = (layout: SchematicLayout, lineId: string): SchematicPoint[] =>
  layout.segments
    .filter((s) => s.lineId === lineId)
    .flatMap((s) => [...s.points]);

describe('offset strokes', () => {
  it.each(STRATEGIES)(
    'gives every line of a shared corridor its own parallel stroke (%s)',
    (_name, strategy) => {
      const layout = strategy(deriveTransitNetwork(sharedCorridorCity()));
      const corridor = layout.corridors[0];
      // One slot each, a full slot apart, in the order MLNCM-S already chose.
      expect(corridor.slots.map((slot) => slot.offsetIndex)).toEqual([
        -0.5, 0.5,
      ]);
      const a = strokeOf(layout, 'A');
      const b = strokeOf(layout, 'B');
      expect(a).not.toEqual(b);
      // Neither is hidden under the other: they never come within a line width.
      expect(closestApproach(a, b)).toBeGreaterThan(SCHEMATIC_LINE_WIDTH);
      // And they are a slot apart, not some other distance.
      expect(closestApproach(a, b)).toBeCloseTo(SCHEMATIC_SLOT, 6);
    },
  );

  it('is the very geometry the metrics call unhidden', () => {
    const net = deriveTransitNetwork(transitFixture('dense'));
    for (const [, strategy] of STRATEGIES) {
      const layout = strategy(net);
      const byEdge = new Map<string, number>(
        layout.corridors.map((c) => [c.edgeId, c.slots.length]),
      );
      // The dense fixture exists to have corridors carrying several lines; if it
      // stopped doing so this whole suite would pass for the wrong reason.
      expect([...byEdge.values()].some((count) => count > 1)).toBe(true);
    }
  });
});

describe('chirality against the geographic map', () => {
  /**
   * The one test whose only job is the mirror. `rightOf` is calibrated to the map
   * frame (`z` north) and to the sign of MapLibre's `line-offset`; schematic space
   * is that frame with `y` growing *down*. Copying the hand across unchanged
   * mirrors every offset and every capsule, and nothing else in the suite would
   * notice — the strokes would still be parallel, a slot apart, in the right order.
   */
  it('puts the highest slot on the same hand as the rendered map does', () => {
    const net = deriveTransitNetwork(sharedCorridorCity());
    const corridor = net.renderGeometry.corridors.find(
      (c) => c.slots.length === 2,
    );
    expect(corridor).toBeDefined();
    const mapCorridor = corridor as NonNullable<typeof corridor>;

    // Where the map puts the highest-index slot, relative to the corridor.
    const highest = [...mapCorridor.slots].sort(
      (a, b) => b.offsetIndex - a.offsetIndex,
    )[0];
    const travel = {
      x: mapCorridor.path[1].x - mapCorridor.path[0].x,
      z: mapCorridor.path[1].z - mapCorridor.path[0].z,
    };
    const mapHand = rightOf(travel);
    const mapSide = Math.sign(highest.offsetIndex);
    // Expressed in schematic space, that hand points this way:
    const expected = toPlane({
      x: mapHand.x * mapSide,
      z: mapHand.z * mapSide,
    });

    // Where the diagram puts it.
    const layout = geographicSchematicLayout(net);
    const line = layout.corridors[0];
    const schematicHighest = [...line.slots].sort(
      (a, b) => b.offsetIndex - a.offsetIndex,
    )[0];
    expect(schematicHighest.lineId).toBe(highest.lineId);
    const stroke = strokeOf(layout, schematicHighest.lineId);
    const along = {
      x: line.points[1].x - line.points[0].x,
      y: line.points[1].y - line.points[0].y,
    };
    // Component of "stroke minus centerline" across the corridor.
    const across = { x: -along.y, y: along.x };
    const displacement = {
      x: stroke[0].x - line.points[0].x,
      y: stroke[0].y - line.points[0].y,
    };
    const sideOfDiagram = Math.sign(
      displacement.x * across.x + displacement.y * across.y,
    );
    const sideOfMap = Math.sign(expected.x * across.x + expected.y * across.y);
    expect(sideOfDiagram).not.toBe(0);
    expect(sideOfDiagram).toBe(sideOfMap);
  });
});

describe('station symbols', () => {
  it.each(STRATEGIES)(
    'draws a lone stop as a circle and a shared one as a capsule across the corridor (%s)',
    (_name, strategy) => {
      const layout = strategy(deriveTransitNetwork(sharedCorridorCity()));
      const extentOf = (id: string): { along: number; across: number } => {
        const station = layout.stations.find((s) => s.id === id);
        expect(station).toBeDefined();
        const shape = (station as NonNullable<typeof station>).shape;
        const xs = shape.map((p) => p.x);
        const ys = shape.map((p) => p.y);
        // The corridor runs west→east in this fixture, so "along" is x.
        return {
          along: Math.max(...xs) - Math.min(...xs),
          across: Math.max(...ys) - Math.min(...ys),
        };
      };
      const lone = extentOf('west');
      // A single stopping line spans one slot, so both half-extents collapse to
      // the fixed thickness and the capsule degenerates to a circle.
      expect(lone.along).toBeCloseTo(lone.across, 6);
      expect(lone.along).toBeCloseTo(2 * SCHEMATIC_STATION_HALF_THICKNESS, 6);

      const shared = extentOf('shared');
      // Two lines: the long axis runs ACROSS the corridor and spans both slots.
      expect(shared.across).toBeGreaterThan(shared.along);
      expect(shared.across).toBeGreaterThan(SCHEMATIC_SLOT);
    },
  );

  it('reports a confirmed transfer without drawing one', () => {
    const layout = geographicSchematicLayout(
      deriveTransitNetwork(transitFixture('transfer')),
    );
    // The transfer fixture exists to have stops served by more than one mode.
    expect(layout.stations.some((s) => s.confirmedTransfer)).toBe(true);
    // Every symbol is still just a ring: the marker itself is Ask First.
    for (const station of layout.stations) {
      expect(station.shape.length).toBeGreaterThan(3);
      expect(station.shape[0]).toEqual(station.shape[station.shape.length - 1]);
    }
  });

  it('names the corridor a symbol was placed on', () => {
    const layout = octilinearSchematicLayout(
      deriveTransitNetwork(transitFixture('dense')),
    );
    const edgeIds = new Set(layout.corridors.map((c) => c.edgeId));
    for (const station of layout.stations) {
      expect(edgeIds.has(station.edgeId)).toBe(true);
    }
  });
});

describe('node trims and inner connections', () => {
  it('opens a free area at a junction and bridges it with a connector', () => {
    const net = deriveTransitNetwork(transitFixture('simple'));
    const layout = octilinearSchematicLayout(net);
    // The simple fixture is an L: two corridors meeting at one node, so the trim
    // has something to make room for and the transitions have something to cross.
    expect(layout.corridors).toHaveLength(2);
    expect(layout.connectors.length).toBeGreaterThan(0);
    // Every stroke is strictly shorter than the centerline it came from, because
    // the node front cut it back.
    const lengthOf = (points: readonly SchematicPoint[]): number => {
      let total = 0;
      for (let i = 1; i < points.length; i++) {
        total += Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y,
        );
      }
      return total;
    };
    const trimmedSomething = layout.corridors.some((corridor) => {
      const stroke = layout.segments.find((s) =>
        corridor.slots.some((slot) => slot.lineId === s.lineId),
      );
      return (
        stroke !== undefined &&
        lengthOf(stroke.points) < lengthOf(corridor.points) - 1e-6
      );
    });
    expect(trimmedSomething).toBe(true);
    // A connector carries a colour, so it can be drawn as its own line.
    for (const connector of layout.connectors) {
      expect(connector.color).toMatch(/^#/);
      expect(connector.points.length).toBeGreaterThanOrEqual(2);
      for (const p of connector.points) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
    }
  });
});

describe('innerConnection', () => {
  it('is a straight line when the ports already face each other', () => {
    // LOOM §5, Fig. 26.3: a straight connector is not a degenerate arc to be
    // avoided, it is the preferred answer whenever the geometry allows it.
    expect(
      innerConnection(
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 10, y: 0 },
        { x: -1, y: 0 },
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it('is tangent to the corridor at BOTH ends', () => {
    // A single arc can only match one prescribed tangent; the other end meets its
    // stroke at a visible kink, and that end is a joint a reader looks straight at.
    // So this is a biarc, and the claim is checked at both ends, not narrated.
    const p = { x: 0, y: 0 };
    const q = { x: 60, y: 40 };
    const outP = { x: 1, y: 0 };
    const outQ = { x: 0, y: -1 };
    const arc = innerConnection(p, outP, q, outQ);
    expect(arc[0]).toEqual(p);
    expect(arc[arc.length - 1]).toEqual(q);
    expect(arc.length).toBeGreaterThan(4);

    const bearing = (a: SchematicPoint, b: SchematicPoint): number =>
      Math.atan2(b.y - a.y, b.x - a.x);
    const wrap = (angle: number): number =>
      Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
    // The chord to the first (and from the last) sample lags the true tangent by
    // half a sample step, which is the polyline approximation, not a tangent error.
    const tolerance = Math.PI / SCHEMATIC_ARC_SAMPLES;
    expect(
      wrap(bearing(arc[0], arc[1]) - Math.atan2(outP.y, outP.x)),
    ).toBeLessThanOrEqual(tolerance);
    // It arrives at q along the negation of q's outward direction.
    expect(
      wrap(
        bearing(arc[arc.length - 2], arc[arc.length - 1]) -
          Math.atan2(-outQ.y, -outQ.x),
      ),
    ).toBeLessThanOrEqual(tolerance);
  });

  it('turns smoothly all the way through, with no kink at the joint', () => {
    // Two arcs meeting at a shared tangent. If the joint were a plain concatenation
    // the turn there would spike; every interior turn staying small is what says the
    // two arcs actually share a tangent.
    const arc = innerConnection(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 60, y: 40 },
      { x: 0, y: -1 },
    );
    const turns: number[] = [];
    for (let i = 1; i < arc.length - 1; i++) {
      turns.push(Math.abs(turnAngle(arc[i - 1], arc[i], arc[i + 1])));
    }
    // A biarc of this shape turns ~135° in total; no single vertex may carry a
    // disproportionate share of it.
    const total = turns.reduce((sum, t) => sum + t, 0);
    expect(Math.max(...turns)).toBeLessThan(total / 2);
  });

  it('stays a straight line only when a straight line is tangent at both ends', () => {
    // Ports facing each other but offset sideways: a straight chord would leave
    // both strokes at an angle, so it must curve even though the tangents agree.
    const arc = innerConnection(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 40, y: 12 },
      { x: -1, y: 0 },
    );
    expect(arc.length).toBeGreaterThan(2);
  });

  it('falls back to the chord rather than omitting a connector', () => {
    // A pair of tangents with no finite equal-radius biarc. A missing connector is
    // a gap in the network; an ugly one is only ugly.
    const arc = innerConnection(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 10, y: 0 },
      { x: 1, y: 0 },
    );
    expect(arc[0]).toEqual({ x: 0, y: 0 });
    expect(arc[arc.length - 1]).toEqual({ x: 10, y: 0 });
    for (const point of arc) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    }
  });
});
