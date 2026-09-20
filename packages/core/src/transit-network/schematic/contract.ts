/**
 * The schematic layout contract (Epic 4, Story 4.1), split out of `./index`
 * so the shared grid machinery of Story 4.3 can depend on it without a cycle.
 *
 * @remarks
 * This file is an internal seam, not a second public surface. `./index`
 * re-exports the public names here — the types and the two viewBox constants —
 * verbatim, so the Story 4.1/4.2 API is unchanged. {@link byString} is
 * deliberately *not* re-exported: it is a shared sort helper for the modules in
 * this folder, not part of the layout contract.
 */

/** A point in schematic (SVG user) space: x grows right, y grows down. */
export interface SchematicPoint {
  readonly x: number;
  readonly y: number;
}

/** One drawn stroke: the geometry of one corridor as ridden by one line. */
export interface SchematicSegment {
  readonly lineId: string;
  readonly color: string;
  readonly points: readonly SchematicPoint[];
}

/** One station symbol. */
export interface SchematicStation {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /**
   * Ids of every drawable line this station belongs to, sorted and immutable.
   *
   * @remarks
   * Membership describes the *base* geometry: it is what lets a visibility
   * projection (`filterSchematicLayout`) decide whether a station shared
   * by several lines survives, without recomputing anything. A station is only
   * ever recorded for lines that actually draw a stroke, so this is never
   * empty in a layout produced by a strategy.
   */
  readonly lineIds: readonly string[];
}

/** Output of a schematic strategy, in a fixed viewBox `0 0 width height`. */
export interface SchematicLayout {
  readonly bounds: { readonly width: number; readonly height: number };
  readonly segments: readonly SchematicSegment[];
  readonly stations: readonly SchematicStation[];
}

/** Fixed viewBox side of every schematic layout. */
export const SCHEMATIC_VIEWBOX_SIZE = 1000;
/** Margin kept free around the drawn network, in viewBox units. */
export const SCHEMATIC_MARGIN = 40;

/** Deterministic string order, used everywhere ids are sorted. */
export const byString = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
