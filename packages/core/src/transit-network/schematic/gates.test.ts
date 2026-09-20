/**
 * The executable gates of Story 4.3.
 *
 * @remarks
 * This file *is* the evidence: the comparative report
 * (`4-3-layout-gates-report.md`) is transcribed from the table it prints, and a
 * layout that stops passing here stops being publishable. Prose cannot fail, so
 * none of the verdicts below live in prose.
 *
 * Every layout runs inside `beforeAll`, never in a `describe` body: a throw
 * during collection is reported as a suite-level error rather than a failing
 * test, and a strategy timed while the module is being evaluated is timed
 * outside the runner's isolation. Timing uses `performance.now()` — `Date.now()`
 * has 1 ms granularity, which cannot say anything useful about a 1500 ms budget.
 *
 * The `ctr*` columns are the same measurements over the corridor **centerlines**
 * rather than the drawn strokes. They are what makes the Story 4.3b report able to
 * say which half of that change moved a number: a centerline figure answers to the
 * routing alone (grid, costs, placement) and is directly comparable to the
 * pre-4.3b table, where a stroke *was* the centerline; the gap between the two
 * columns is what the rendering stage added.
 *
 * The table is printed with `console.log`, which vitest intercepts by default;
 * `vitest run --disableConsoleIntercept <this file>` shows it. The gates
 * themselves run and fail either way — seeing the numbers is for regenerating
 * the report, not for the verdict.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { TRANSIT_FIXTURES, transitFixture } from '../../testing';
import type { TransitNetwork } from '../../types/transit-network';
import { deriveTransitNetwork } from '../index';
import type { SchematicLayout } from './contract';
import {
  evaluateSchematicGates,
  measureSchematicLayout,
  type SchematicGateReport,
  type SchematicLayoutMetrics,
} from './metrics';
import { octilinearSchematicLayout, octilinearViolations } from './octilinear';
import {
  orthoradialConformanceOf,
  orthoradialLayoutWithCentre,
} from './orthoradial';

interface Candidate {
  readonly id: 'octilinear' | 'orthoradial';
  /** Lays the network out and reports the violations of its own grammar. */
  readonly run: (network: TransitNetwork) => {
    layout: SchematicLayout;
    violations: readonly string[];
  };
}

const CANDIDATES: readonly Candidate[] = [
  {
    id: 'octilinear',
    run: (network) => {
      const layout = octilinearSchematicLayout(network);
      return { layout, violations: octilinearViolations(layout) };
    },
  },
  {
    id: 'orthoradial',
    run: (network) => {
      const { layout, centre } = orthoradialLayoutWithCentre(network);
      return {
        layout,
        violations: orthoradialConformanceOf(layout, centre).violations,
      };
    },
  },
];

interface Row {
  readonly fixture: string;
  readonly strategy: string;
  readonly elapsedMs: number;
  readonly metrics: SchematicLayoutMetrics;
  readonly report: SchematicGateReport;
}

const rows: Row[] = [];

describe('schematic layout gates', () => {
  for (const fixture of TRANSIT_FIXTURES) {
    for (const candidate of CANDIDATES) {
      describe(`${fixture.id} / ${candidate.id}`, () => {
        let metrics: SchematicLayoutMetrics;
        let report: SchematicGateReport;
        let violations: readonly string[];

        beforeAll(() => {
          const network = deriveTransitNetwork(transitFixture(fixture.id));
          const startedAt = performance.now();
          const run = candidate.run(network);
          const elapsedMs = performance.now() - startedAt;
          violations = run.violations;
          metrics = measureSchematicLayout(network, run.layout).metrics;
          report = evaluateSchematicGates(metrics, elapsedMs);
          rows.push({
            fixture: fixture.id,
            strategy: candidate.id,
            elapsedMs,
            metrics,
            report,
          });
        });

        it('draws exactly the strokes the network calls for, per corridor', () => {
          expect(metrics.missingSegments).toEqual([]);
          expect(metrics.segmentCount).toBeGreaterThan(0);
        });

        it('keeps every junction joined', () => {
          expect(metrics.brokenJunctions).toEqual([]);
        });

        it('draws exactly the baseline stations with the same membership', () => {
          expect(metrics.missingStations).toEqual([]);
          expect(metrics.changedMembership).toEqual([]);
          expect(metrics.topologyPreserved).toBe(true);
        });

        it('obeys its own geometric grammar everywhere', () => {
          expect(violations).toEqual([]);
        });

        it('keeps two station symbols apart', () => {
          expect(
            report.gates.find((g) => g.id === 'legibility/stationSeparation'),
          ).toMatchObject({ passed: true });
        });

        it('puts every station on a stroke of one of its own lines', () => {
          expect(
            report.gates.find((g) => g.id === 'legibility/stationOnRoute'),
          ).toMatchObject({ passed: true });
        });

        it('hides no line of a shared corridor under another', () => {
          expect(metrics.overlappingCorridorStrokes).toEqual([]);
          expect(
            report.gates.find((g) => g.id === 'legibility/corridorSeparation'),
          ).toMatchObject({ passed: true });
        });

        it('places every station on a corridor its own lines ride', () => {
          expect(metrics.stationsOffOwnCorridor).toEqual([]);
          expect(
            report.gates.find((g) => g.id === 'legibility/stationOwnCorridor'),
          ).toMatchObject({ passed: true });
        });

        it('routes every corridor without falling back', () => {
          expect(metrics.fallbackRoutes).toBe(0);
          expect(metrics.routedEdges).toBeGreaterThan(0);
        });

        it('stays inside the time budget', () => {
          expect(
            report.gates.find((g) => g.id === 'performance/elapsed'),
          ).toMatchObject({ passed: true });
        });

        it('passes every gate', () => {
          expect(
            report.gates.filter((g) => !g.passed).map((g) => g.id),
          ).toEqual([]);
        });
      });
    }
  }

  describe('comparative metrics table', () => {
    // Printed, not asserted: the numbers are comparative evidence for Story
    // 4.4, and pinning a crossing count or a length to a snapshot would turn a
    // measurement into a contract nobody agreed to.
    it('covers every fixture and strategy, and prints them', () => {
      const header = [
        'fixture',
        'strategy',
        'ms',
        'strokes',
        'corridors',
        'stations',
        'vertices',
        'ctrVertices',
        'crossings',
        'ctrCrossings',
        'length',
        'ctrLength',
        'displacement',
        'minStationDist',
        'tightPairs',
        'maxOffRoute',
        'fallbacks',
        'relocated',
        'gates',
      ];
      const ordered = [...rows].sort(
        (a, b) =>
          TRANSIT_FIXTURES.findIndex((f) => f.id === a.fixture) -
            TRANSIT_FIXTURES.findIndex((f) => f.id === b.fixture) ||
          a.strategy.localeCompare(b.strategy),
      );
      const lines = [header.join(' | ')];
      for (const row of ordered) {
        lines.push(
          [
            row.fixture,
            row.strategy,
            row.elapsedMs.toFixed(2),
            String(row.metrics.segmentCount),
            String(row.metrics.routedEdges),
            String(row.metrics.stationCount),
            String(row.metrics.vertexCount),
            String(row.metrics.corridorVertexCount),
            String(row.metrics.crossings),
            String(row.metrics.corridorCrossings),
            row.metrics.totalLength.toFixed(1),
            row.metrics.corridorLength.toFixed(1),
            row.metrics.relativeDisplacement.toFixed(4),
            row.metrics.minStationDistance.toFixed(1),
            String(row.metrics.tightStationPairs),
            row.metrics.maxStationOffRoute.toExponential(1),
            String(row.metrics.fallbackRoutes),
            String(row.metrics.relocatedNodes),
            row.report.passed ? 'pass' : 'FAIL',
          ].join(' | '),
        );
      }
      console.log(`\n${lines.join('\n')}\n`);
      expect(rows).toHaveLength(TRANSIT_FIXTURES.length * CANDIDATES.length);
    });
  });
});
