import { describe, expect, it } from 'vitest';
import { makeCityData, TRANSIT_FIXTURES, transitFixture } from '../../testing';
import { deriveTransitNetwork } from '../index';
import { geographicSchematicLayout } from './geographic';
import {
  createOrthoradialGrid,
  ORTHORADIAL_GRID,
  orthoradialConformance,
  orthoradialConformanceOf,
  orthoradialLayoutWithCentre,
  orthoradialSchematicLayout,
  spokesAtRing,
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
    const touchesCentre = layout.corridors.some((corridor) =>
      corridor.points.some(
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

describe('pseudo-orthoradial ring density (SSTD §5.2)', () => {
  it('scales beyond the former 681-cell grid capacity within its hard limit', () => {
    const grid = createOrthoradialGrid(
      Array.from({ length: 682 }, (_, index) => ({
        x: Math.cos(index) * 100,
        y: Math.sin(index) * 100,
      })),
    );
    expect(grid.cellCount).toBeGreaterThanOrEqual(682);
    expect(grid.cellCount).toBeLessThanOrEqual(4096);
  });

  it('doubles the spokes whenever the radius doubles', () => {
    // The property the paper names the grid for. A constant spoke count — what
    // this grid had before — crowds the centre and empties the outside, and the
    // assertion that catches a regression to it is this one.
    for (let ring = 1; ring <= 8; ring++) {
      expect(spokesAtRing(2 * ring)).toBe(2 * spokesAtRing(ring));
    }
    expect(spokesAtRing(1)).toBe(ORTHORADIAL_GRID.baseSpokes);
    // Every count stays a multiple of the base, so every inner ray has an aligned
    // ray outside it and a radial step is exactly radial.
    for (let ring = 1; ring <= 16; ring++) {
      expect(spokesAtRing(ring) % ORTHORADIAL_GRID.baseSpokes).toBe(0);
    }
  });

  it('keeps neighbouring cells a comparable distance apart at every radius', () => {
    // The consequence that matters to a reader: with a fixed count the outer
    // rings' neighbours drift apart without bound. Here the spacing stays inside
    // a factor of two of the innermost ring's, everywhere.
    const grid = createOrthoradialGrid(
      Array.from({ length: 40 }, (_, i) => ({
        x: Math.cos(i) * 500,
        y: Math.sin(i) * 500,
      })),
    );
    const spacings: number[] = [];
    for (let cell = 1; cell < grid.cellCount; cell++) {
      const here = grid.point(cell);
      // The two arc neighbours are the last two steps a ring cell reports.
      const arcs = grid.neighbors(cell).slice(-2);
      for (const step of arcs) {
        const there = grid.point(step.cell);
        spacings.push(Math.hypot(there.x - here.x, there.y - here.y));
      }
    }
    expect(spacings.length).toBeGreaterThan(0);
    const min = Math.min(...spacings);
    const max = Math.max(...spacings);
    expect(min).toBeGreaterThan(0);
    expect(max / min).toBeLessThanOrEqual(2);
  });

  it('keeps one centre cell, and every ring reachable, with the counts doubling', () => {
    const grid = createOrthoradialGrid([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 0, y: 400 },
    ]);
    // One centre, and it is nobody else's position.
    const centre = grid.point(0);
    for (let cell = 1; cell < grid.cellCount; cell++) {
      expect(
        Math.hypot(
          grid.point(cell).x - centre.x,
          grid.point(cell).y - centre.y,
        ),
      ).toBeGreaterThan(1e-9);
    }
    // A cell on an odd spoke of a doubled ring has no inward step of its own
    // (it would not be radial), but the conformant fallback still reaches the
    // centre from it.
    for (let cell = 1; cell < grid.cellCount; cell++) {
      const walk = grid.lineTo(cell, 0);
      expect(walk[0]).toBe(cell);
      expect(walk[walk.length - 1]).toBe(0);
      // And back out again.
      const out = grid.lineTo(0, cell);
      expect(out[out.length - 1]).toBe(cell);
    }
  });

  it('degenerates gracefully to the minimum ring count for one seed', () => {
    // A single node: the grid still has to have a step length, a centre, and
    // enough cells for the router to walk on.
    const grid = createOrthoradialGrid([{ x: 7, y: -3 }]);
    expect(grid.cellCount).toBeGreaterThan(1);
    expect(grid.point(0)).toEqual({ x: 7, y: -3 });
    expect(grid.snap({ x: 7, y: -3 })).toBe(0);
    for (let cell = 0; cell < grid.cellCount; cell++) {
      const p = grid.point(cell);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });
});
