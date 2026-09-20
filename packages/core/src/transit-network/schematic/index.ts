/**
 * Schematic layout contract and strategies (Epic 4).
 *
 * @remarks
 * A schematic layout strategy is a pure function `TransitNetwork →
 * SchematicLayout`. It never touches MapLibre, React or Tauri, and the same
 * network always produces a deep-equal, frozen layout.
 *
 * Story 4.1 shipped {@link geographicSchematicLayout}, the baseline that
 * invents nothing. Story 4.3 adds two genuinely schematic geometries —
 * {@link octilinearSchematicLayout} and {@link orthoradialSchematicLayout} —
 * built on one shared grid router (`./grid-layout`), plus the deterministic
 * metrics and executable gates (`./metrics`) that decide which of them is fit
 * to publish. The geographic strategy stays the default: a layout that fails a
 * gate is experimental and never degrades it.
 */

export {
  SCHEMATIC_MARGIN,
  SCHEMATIC_VIEWBOX_SIZE,
  type SchematicLayout,
  type SchematicPoint,
  type SchematicSegment,
  type SchematicStation,
} from './contract';

import type { TransitNetwork } from '../../types/transit-network';
import type { SchematicLayout } from './contract';

/** A pure, deterministic layout strategy. */
export type SchematicLayoutStrategy = (
  network: TransitNetwork,
) => SchematicLayout;

export { geographicSchematicLayout } from './geographic';

export {
  GRID_ROUTER,
  routeOnGrid,
  schematicLayoutDiagnostics,
  type GridBase,
  type GridFactory,
  type GridStep,
  type SchematicLayoutDiagnostics,
} from './grid-layout';

export {
  createOctilinearGrid,
  isOctilinearConformant,
  OCTILINEAR_GRID,
  octilinearSchematicLayout,
  octilinearViolations,
} from './octilinear';

export {
  createOrthoradialGrid,
  ORTHORADIAL_GRID,
  orthoradialConformance,
  orthoradialConformanceOf,
  orthoradialLayoutWithCentre,
  orthoradialSchematicLayout,
  type OrthoradialConformance,
} from './orthoradial';

export {
  evaluateSchematicGates,
  measureSchematicLayout,
  SCHEMATIC_GATES,
  type SchematicGate,
  type SchematicGateReport,
  type SchematicLayoutMetrics,
} from './metrics';

/** Whether a layout has nothing to draw (no segments). */
export function isSchematicLayoutEmpty(layout: SchematicLayout): boolean {
  return layout.segments.length === 0;
}

/**
 * Projects a layout onto a set of visible lines: a pure filter that keeps
 * `bounds` and every surviving coordinate byte-identical.
 *
 * @remarks
 * Visibility is applied *after* the layout, never before it. Filtering the
 * network first would change the bounds and move every remaining station,
 * which is exactly what a filter must not do — the reader has to be able to
 * read the same map with fewer lines on it. A station survives while at least
 * one of its {@link SchematicStation.lineIds} is visible, so a shared
 * interchange stays put when only one of its lines is hidden.
 *
 * Ids the layout does not draw are ignored; the result is frozen and shares
 * the input's frozen segment/station objects, so it is safe to memoise.
 *
 * @param layout - The base layout a strategy produced.
 * @param visibleLineIds - Ids to keep. Anything else is dropped.
 */
export function filterSchematicLayout(
  layout: SchematicLayout,
  visibleLineIds: Iterable<string>,
): SchematicLayout {
  const visible =
    visibleLineIds instanceof Set
      ? (visibleLineIds as ReadonlySet<string>)
      : new Set(visibleLineIds);

  const segments = layout.segments.filter((s) => visible.has(s.lineId));
  const stations = layout.stations.filter((s) =>
    s.lineIds.some((id) => visible.has(id)),
  );
  // Nothing was hidden: hand back the very same layout so memoised consumers
  // and reference-equality checks see no change at all.
  if (
    segments.length === layout.segments.length &&
    stations.length === layout.stations.length
  ) {
    return layout;
  }

  return Object.freeze({
    bounds: layout.bounds,
    segments: Object.freeze(segments),
    stations: Object.freeze(stations),
  });
}
