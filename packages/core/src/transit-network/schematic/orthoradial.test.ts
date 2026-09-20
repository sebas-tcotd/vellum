import { describe, expect, it } from 'vitest';
import { makeCityData, TRANSIT_FIXTURES, transitFixture } from '../../testing';
import { deriveTransitNetwork } from '../index';
import { geographicSchematicLayout } from './geographic';
import {
  createOrthoradialGrid,
  orthoradialConformance,
  orthoradialConformanceOf,
  orthoradialLayoutWithCentre,
  orthoradialSchematicLayout,
} from './orthoradial';

describe('orthoradialSchematicLayout', () => {
  it.each(TRANSIT_FIXTURES.map((f) => [f.id, f.build] as const))(
    'draws every stroke as an arc or a radial (%s)',
    (_id, build) => {
      const conformance = orthoradialConformance(deriveTransitNetwork(build()));
      expect(conformance.violations).toEqual([]);
      expect(conformance.conformant).toBe(true);
      // A layout of nothing but zero-length steps would also report no
      // violations, so the classification has to have seen real geometry.
      expect(conformance.arcSteps + conformance.radialSteps).toBeGreaterThan(0);
    },
  );

  it('is deterministic and frozen', () => {
    const network = deriveTransitNetwork(transitFixture('dense'));
    const a = orthoradialSchematicLayout(network);
    const b = orthoradialSchematicLayout(network);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.segments[0].points)).toBe(true);
  });

  it('draws the same strokes and stations as the geographic baseline', () => {
    const network = deriveTransitNetwork(transitFixture('dense'));
    const base = geographicSchematicLayout(network);
    const layout = orthoradialSchematicLayout(network);
    expect(layout.segments.map((s) => s.lineId)).toEqual(
      base.segments.map((s) => s.lineId),
    );
    expect(layout.stations.map((s) => s.id)).toEqual(
      base.stations.map((s) => s.id),
    );
    expect(layout.stations.map((s) => [...s.lineIds])).toEqual(
      base.stations.map((s) => [...s.lineIds]),
    );
  });

  /**
   * The transfer fixture's hub sits exactly on the centroid of the node cloud,
   * so it lands on ring 0 — the degenerate ring, which has a single cell and no
   * angle of its own. Every stroke out of it must still read as radial.
   */
  it('handles a node on the centre without breaking the grammar', () => {
    const network = deriveTransitNetwork(transitFixture('transfer'));
    const { layout, centre } = orthoradialLayoutWithCentre(network);
    const touchesCentre = layout.segments.some((segment) =>
      segment.points.some(
        (p) => Math.hypot(p.x - centre.x, p.y - centre.y) < 1e-6,
      ),
    );
    expect(touchesCentre).toBe(true);
    const conformance = orthoradialConformanceOf(layout, centre);
    expect(conformance.violations).toEqual([]);
  });

  it('gives ring 0 exactly one cell, so two nodes can never share the centre', () => {
    const grid = createOrthoradialGrid([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ]);
    const centre = grid.point(0);
    expect(centre).toEqual({ x: 100 / 3, y: 100 / 3 });
    expect(grid.snap(centre)).toBe(0);
    // Every other cell is off the centre: ring 0 is not `spokes` coincident
    // cells wearing one position.
    for (let cell = 1; cell < grid.cellCount; cell++) {
      const p = grid.point(cell);
      expect(Math.hypot(p.x - centre.x, p.y - centre.y)).toBeGreaterThan(1e-9);
    }
  });

  it('returns the baseline empty layout for a city without transit', () => {
    const network = deriveTransitNetwork(makeCityData({ transitLines: [] }));
    expect(orthoradialSchematicLayout(network)).toEqual(
      geographicSchematicLayout(network),
    );
    // No grid was ever built, so there is no centre to report but also no
    // throw: the empty case is handled before any geometry exists. What must
    // never happen is a *drawn* layout being handed an unprojected centre —
    // conformance measured against a point outside the layout's coordinate
    // space would be a verdict about nothing.
    const { layout, centre } = orthoradialLayoutWithCentre(network);
    expect(layout.segments).toEqual([]);
    expect(centre).toEqual({ x: 0, y: 0 });
    expect(Object.isFrozen(centre)).toBe(true);
  });

  it('projects the centre into the same space as the drawn points', () => {
    const network = deriveTransitNetwork(transitFixture('dense'));
    const { layout, centre } = orthoradialLayoutWithCentre(network);
    // The centre is inside the viewBox because it went through the very same
    // projection every point did. An unprojected plane centre would sit in world
    // coordinates, thousands of units away.
    expect(centre.x).toBeGreaterThanOrEqual(0);
    expect(centre.x).toBeLessThanOrEqual(layout.bounds.width);
    expect(centre.y).toBeGreaterThanOrEqual(0);
    expect(centre.y).toBeLessThanOrEqual(layout.bounds.height);
  });
});
