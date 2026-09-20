import { describe, expect, it } from 'vitest';
import { makeCityData, transitFixture } from '../../testing';
import { deriveTransitNetwork } from '../index';
import type { SchematicLayout } from './contract';
import { geographicSchematicLayout } from './geographic';
import {
  evaluateSchematicGates,
  measureSchematicLayout,
  SCHEMATIC_GATES,
} from './metrics';
import { octilinearSchematicLayout } from './octilinear';
import { orthoradialSchematicLayout } from './orthoradial';

const network = () => deriveTransitNetwork(transitFixture('dense'));

describe('measureSchematicLayout', () => {
  it('is deterministic and frozen, with timing kept outside the metrics', () => {
    const net = network();
    const layout = octilinearSchematicLayout(net);
    const a = measureSchematicLayout(net, layout);
    const b = measureSchematicLayout(net, layout);
    expect(a.metrics).toEqual(b.metrics);
    expect(Object.isFrozen(a.metrics)).toBe(true);
    expect(Object.isFrozen(a.metrics.missingSegments)).toBe(true);
    expect(typeof a.elapsedMs).toBe('number');
    expect('elapsedMs' in a.metrics).toBe(false);
  });

  it('reports the geographic baseline as perfectly faithful to itself', () => {
    const net = network();
    const { metrics } = measureSchematicLayout(
      net,
      geographicSchematicLayout(net),
    );
    expect(metrics.topologyPreserved).toBe(true);
    expect(metrics.relativeDisplacement).toBe(0);
    expect(metrics.fallbackRoutes).toBe(0);
  });

  it.each([
    ['octilinear', octilinearSchematicLayout],
    ['orthoradial', orthoradialSchematicLayout],
  ] as const)('finds %s faithful on the dense fixture', (_name, strategy) => {
    const net = network();
    const { metrics } = measureSchematicLayout(net, strategy(net));
    expect(metrics.missingSegments).toEqual([]);
    expect(metrics.missingStations).toEqual([]);
    expect(metrics.changedMembership).toEqual([]);
    expect(metrics.topologyPreserved).toBe(true);
  });

  it('names the strokes and stations a mutilated layout dropped', () => {
    const net = network();
    const full = octilinearSchematicLayout(net);
    const mutilated: SchematicLayout = {
      bounds: full.bounds,
      segments: full.segments.filter((s) => s.lineId !== 'D1'),
      stations: full.stations.slice(1),
    };
    const { metrics } = measureSchematicLayout(net, mutilated);
    expect(metrics.topologyPreserved).toBe(false);
    // Keyed `edgeId|lineId`, so each label names the corridor as well as the
    // line. Dropping a stroke shifts the rest of the canonical sequence, so the
    // report is not limited to D1 — but D1's corridors are certainly in it.
    expect(metrics.missingSegments.length).toBeGreaterThan(0);
    expect(metrics.missingSegments.some((k) => k.endsWith('|D1'))).toBe(true);
    for (const k of metrics.missingSegments) {
      expect(k).toMatch(/^.+\|.+$/);
    }
    expect(metrics.missingStations).toEqual([full.stations[0].id]);
  });

  it('notices a station whose line membership changed', () => {
    const net = network();
    const full = octilinearSchematicLayout(net);
    const changed: SchematicLayout = {
      bounds: full.bounds,
      segments: full.segments,
      stations: full.stations.map((s, i) =>
        i === 0 ? { ...s, lineIds: ['not-a-line'] } : s,
      ),
    };
    const { metrics } = measureSchematicLayout(net, changed);
    expect(metrics.changedMembership).toEqual([full.stations[0].id]);
    expect(metrics.topologyPreserved).toBe(false);
  });

  it('measures an empty network without throwing', () => {
    const net = deriveTransitNetwork(makeCityData({ transitLines: [] }));
    const { metrics } = measureSchematicLayout(
      net,
      octilinearSchematicLayout(net),
    );
    expect(metrics.segmentCount).toBe(0);
    expect(metrics.stationCount).toBe(0);
    expect(metrics.minStationDistance).toBe(0);
    expect(metrics.topologyPreserved).toBe(true);
  });
});

describe('evaluateSchematicGates', () => {
  it('passes every gate for a faithful, fast layout', () => {
    const net = network();
    const report = evaluateSchematicGates(
      measureSchematicLayout(net, octilinearSchematicLayout(net)).metrics,
      1,
    );
    expect(report.passed).toBe(true);
    expect(report.gates.map((g) => g.id)).toEqual([
      'fidelity/segments',
      'fidelity/junctions',
      'fidelity/stations',
      'fidelity/membership',
      'legibility/stationSeparation',
      'legibility/stationOnRoute',
      'routing/fallbackShare',
      'performance/elapsed',
    ]);
    expect(Object.isFrozen(report)).toBe(true);
  });

  it('fails the fidelity gate when a stroke is missing', () => {
    const net = network();
    const full = octilinearSchematicLayout(net);
    const { metrics } = measureSchematicLayout(net, {
      bounds: full.bounds,
      segments: full.segments.slice(1),
      stations: full.stations,
    });
    const report = evaluateSchematicGates(metrics, 1);
    expect(report.passed).toBe(false);
    expect(report.gates.find((g) => g.id === 'fidelity/segments')?.passed).toBe(
      false,
    );
  });

  it('fails the performance gate over budget', () => {
    const net = network();
    const report = evaluateSchematicGates(
      measureSchematicLayout(net, octilinearSchematicLayout(net)).metrics,
      SCHEMATIC_GATES.maxElapsedMs + 1,
    );
    expect(report.passed).toBe(false);
    expect(
      report.gates.find((g) => g.id === 'performance/elapsed')?.passed,
    ).toBe(false);
  });

  it('does not ask a single-station layout to separate anything', () => {
    const net = deriveTransitNetwork(makeCityData({ transitLines: [] }));
    const report = evaluateSchematicGates(
      measureSchematicLayout(net, octilinearSchematicLayout(net)).metrics,
      0,
    );
    expect(
      report.gates.find((g) => g.id === 'legibility/stationSeparation')?.passed,
    ).toBe(true);
  });
});

describe('metrics that close a verification hole', () => {
  /**
   * The hole patch 5 closes: an emission-order key cannot tell "the right lines
   * on the right corridors" from "the right lines on each other's corridors".
   * Swapping two corridors' geometry keeps every `lineId` and every count
   * intact, so only a corridor-aware check can see it.
   */
  it('catches the right lines drawn on the wrong corridors', () => {
    const net = network();
    const full = octilinearSchematicLayout(net);
    // Find two strokes of different corridors (different point arrays) and
    // trade their geometry.
    const first = full.segments[0];
    const other = full.segments.find(
      (s) =>
        s.points[0].x !== first.points[0].x ||
        s.points[0].y !== first.points[0].y,
    );
    expect(other).toBeDefined();
    const swapped: SchematicLayout = {
      bounds: full.bounds,
      segments: full.segments.map((s) =>
        s === first
          ? { ...s, points: (other as typeof first).points }
          : s === other
            ? { ...s, points: first.points }
            : s,
      ),
      stations: full.stations,
    };
    const { metrics } = measureSchematicLayout(net, swapped);
    // Counts and line ids are untouched, which is exactly why this used to pass.
    expect(metrics.segmentCount).toBe(full.segments.length);
    expect(metrics.missingSegments).toEqual([]);
    // The junctions are what give it away.
    expect(metrics.brokenJunctions.length).toBeGreaterThan(0);
    expect(metrics.topologyPreserved).toBe(false);
    expect(
      evaluateSchematicGates(metrics, 1).gates.find(
        (g) => g.id === 'fidelity/junctions',
      ),
    ).toMatchObject({ passed: false });
  });

  /**
   * The hole patch 4 closes: a station re-placed at the wrong arc fraction, or
   * assigned to a corridor none of its lines ride, keeps its id and its
   * membership and moves only in space.
   */
  it('catches a station that is not on a stroke of its own lines', () => {
    const net = network();
    const full = octilinearSchematicLayout(net);
    expect(full.stations.length).toBeGreaterThan(0);
    const moved: SchematicLayout = {
      bounds: full.bounds,
      segments: full.segments,
      stations: full.stations.map((s, i) =>
        i === 0 ? { ...s, x: s.x + 40, y: s.y + 40 } : s,
      ),
    };
    const { metrics } = measureSchematicLayout(net, moved);
    // Id and membership are intact, so the fidelity gates are all happy.
    expect(metrics.missingStations).toEqual([]);
    expect(metrics.changedMembership).toEqual([]);
    expect(metrics.maxStationOffRoute).toBeGreaterThan(
      SCHEMATIC_GATES.stationOnRoute,
    );
    expect(
      evaluateSchematicGates(metrics, 1).gates.find(
        (g) => g.id === 'legibility/stationOnRoute',
      ),
    ).toMatchObject({ passed: false });
  });

  it('measures the fallback share per corridor, not per stroke', () => {
    const net = network();
    const layout = octilinearSchematicLayout(net);
    const { metrics } = measureSchematicLayout(net, layout);
    // The dense fixture has corridors carrying more than one line, so the two
    // denominators genuinely differ — which is the whole bug.
    expect(metrics.routedEdges).toBeGreaterThan(0);
    expect(metrics.segmentCount).toBeGreaterThan(metrics.routedEdges);

    // One fallback out of `routedEdges` corridors, stated per corridor.
    const oneFallback = { ...metrics, fallbackRoutes: 1 };
    const gate = evaluateSchematicGates(oneFallback, 1).gates.find(
      (g) => g.id === 'routing/fallbackShare',
    );
    const expectedPercent = ((1 / metrics.routedEdges) * 100).toFixed(1);
    expect(gate?.detail).toContain(`${expectedPercent}%`);
    expect(gate?.detail).toContain(`of ${metrics.routedEdges} corridors`);
  });

  it('counts a line that crosses itself', () => {
    // Two pieces of one stroke that are not adjacent, arranged as an X. The old
    // same-line skip made this invisible, which is the crossing a single
    // meandering line is most likely to produce.
    const net = deriveTransitNetwork(makeCityData({ transitLines: [] }));
    const selfCrossing: SchematicLayout = {
      bounds: { width: 1000, height: 1000 },
      segments: [
        {
          lineId: 'X',
          color: '#000000',
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 50, y: -50 },
          ],
        },
      ],
      stations: [],
    };
    expect(measureSchematicLayout(net, selfCrossing).metrics.crossings).toBe(1);
  });

  it('does not count adjacent pieces of one stroke as a crossing', () => {
    const net = deriveTransitNetwork(makeCityData({ transitLines: [] }));
    const bend: SchematicLayout = {
      bounds: { width: 1000, height: 1000 },
      segments: [
        {
          lineId: 'X',
          color: '#000000',
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ],
      stations: [],
    };
    expect(measureSchematicLayout(net, bend).metrics.crossings).toBe(0);
  });
});
