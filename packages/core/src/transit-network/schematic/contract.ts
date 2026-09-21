/**
 * The schematic layout contract (Epic 4, Story 4.1), split out of `./index`
 * so the shared grid machinery of Story 4.3 can depend on it without a cycle.
 *
 * @remarks
 * This file is an internal seam, not a second public surface. `./index`
 * re-exports the public names here — the types and the viewBox constants —
 * verbatim, so the Story 4.1/4.2 API is unchanged. {@link byString} is
 * deliberately *not* re-exported: it is a shared sort helper for the modules in
 * this folder, not part of the layout contract.
 *
 * Story 4.3b widened it once: a layout now carries the **corridors with slots**
 * a strategy routed, next to the strokes a common rendering stage
 * (`./render.ts`) derived from them. The reason is in the ADR-0004 lesson — a
 * single stroke per `(corridor, line)` sharing one polyline cannot be offset
 * after the fact, because the offset needs to know how many lines the corridor
 * carries and in what order. That is LOOM's own split between ordering (stage 2)
 * and rendering (stage 3), and here it is the same split.
 */

import {
  LINE_SPACING_M,
  LINE_WIDTH_M,
  NODE_PAD_M,
  STATION_ACROSS_MARGIN_M,
  STATION_CORNER_STEPS,
  STATION_HALF_THICKNESS_M,
} from '../render-geometry/config';
import type { SchematicRenderInput } from './render';

/** A point in schematic (SVG user) space: x grows right, y grows down. */
export interface SchematicPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * One drawn stroke: the geometry of one corridor as ridden by one line.
 *
 * @remarks
 * `edgeId` names the corridor the stroke belongs to. It is what makes a stroke
 * self-identifying, and that matters more than it looks: `./metrics.ts` states
 * fidelity as `(corridor, line)` pairs, and before this field existed it had to
 * pair the network's expected strokes against the layout's *by array index*. A
 * positional pairing is only as good as two emission orders staying in step, and
 * when they drifted the check had nothing to compare and silently passed. With
 * the key on the stroke there is no order to drift.
 *
 * An inner connection carries no `edgeId`: it belongs to a node, not a corridor.
 */
export interface SchematicSegment {
  readonly lineId: string;
  readonly color: string;
  readonly points: readonly SchematicPoint[];
  /** Corridor this stroke draws, or `null` for an inner connection. */
  readonly edgeId: string | null;
}

/** One resolved line slot within a schematic corridor (ADR-0004's `offsetIndex`). */
export interface SchematicSlot {
  readonly lineId: string;
  /**
   * Signed, dimensionless offset index from `slotOffsetIndex`. Its displacement
   * in the diagram is `offsetIndex × ` {@link SCHEMATIC_SLOT}, measured towards
   * the hand `offsetTowards` names in `./offset.ts`.
   */
  readonly offsetIndex: number;
}

/**
 * One corridor of the line graph as the strategy placed it: the shared
 * centerline, and the slots the lines riding it occupy left-to-right.
 *
 * @remarks
 * The centerline is **not** drawn — it is the spine every stroke is offset from,
 * the reference a station sits on, and the thing that still has to meet its
 * neighbours at a junction after the geometry moved. Trimming, offsetting and
 * capping happen in `./render.ts` and leave this untouched.
 */
export interface SchematicCorridor {
  /** Line-graph edge id. */
  readonly edgeId: string;
  /** Untrimmed centerline in viewBox units, oriented nodeA → nodeB. */
  readonly points: readonly SchematicPoint[];
  /** Slots left-to-right along the centerline's direction. */
  readonly slots: readonly SchematicSlot[];
}

/** One station symbol. */
export interface SchematicStation {
  readonly id: string;
  /**
   * Centre of the symbol, already displaced across the corridor to the middle
   * of the slots it spans.
   */
  readonly x: number;
  readonly y: number;
  /** Corridor the station was placed on; its slots are the ones the shape spans. */
  readonly edgeId: string;
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
  /**
   * Closed ring of the symbol: a circle for a single stopping line, a capsule
   * perpendicular to the corridor spanning the slots of several (LOOM §5.4 /
   * Fig. 10, the same rule the geographic map draws).
   */
  readonly shape: readonly SchematicPoint[];
  /**
   * Whether *this* symbol's own stopping lines show two or more distinct modes
   * — the `'confirmed'` transfer criterion, recomputed per symbol exactly as
   * the map's station builder does rather than inherited from the candidate.
   *
   * @remarks
   * Exposed, not drawn: a transfer marker in the diagram is an Ask First item
   * of Story 4.3b. It is here so 4.4 does not have to re-derive it.
   */
  readonly confirmedTransfer: boolean;
}

/** Output of a schematic strategy, in a fixed viewBox `0 0 width height`. */
export interface SchematicLayout {
  readonly bounds: { readonly width: number; readonly height: number };
  /** Corridors with slots: what the strategy decided, before any drawing. */
  readonly corridors: readonly SchematicCorridor[];
  /** One offset, node-trimmed stroke per `(corridor, line)`. */
  readonly segments: readonly SchematicSegment[];
  /** Inner connections across a node's free area, one per line transition. */
  readonly connectors: readonly SchematicSegment[];
  readonly stations: readonly SchematicStation[];
  /** Serializable source required to rematerialize presentation after a worker clone. */
  readonly presentationInput?: SchematicRenderInput;
}

/**
 * Layouts that are a visibility *projection* of a base layout rather than a base
 * layout themselves.
 *
 * @remarks
 * `filterSchematicLayout` hides strokes without moving anything, which is exactly
 * what a filter must do — and exactly what makes the result unmeasurable.
 * Fidelity would report every hidden line as missing, `routedEdges` would count
 * corridors with no visible stroke and deflate the fallback share, and
 * `stationsOffOwnCorridor` would compare against slots of lines that are no
 * longer drawn. Measuring a filtered view is therefore refused rather than
 * documented: a wrong number that looks plausible is worse than an error.
 *
 * A `WeakSet` keyed on the layout object, so the tag is collected with it and
 * cannot be forged by shape. Hand-built layouts are not in it and stay
 * measurable — the metrics' own tests depend on mutilating one.
 */
const filteredLayouts = new WeakSet<SchematicLayout>();

/** Records a layout as a visibility projection of another. */
export function markFilteredLayout(layout: SchematicLayout): SchematicLayout {
  filteredLayouts.add(layout);
  return layout;
}

/** Whether this layout came out of `filterSchematicLayout`. */
export function isFilteredSchematicLayout(layout: SchematicLayout): boolean {
  return filteredLayouts.has(layout);
}

/** Fixed viewBox side of every schematic layout. */
export const SCHEMATIC_VIEWBOX_SIZE = 1000;
/**
 * Minimum margin kept free around the drawn network, in viewBox units.
 *
 * @remarks
 * A *minimum*: the drawing stage widens it by whatever the widest bundle's
 * outermost slot and the tallest station symbol actually need
 * ({@link schematicDrawingReach}). Normalisation fits the **centerlines** into the
 * viewBox, and the offsets and capsules are applied afterwards in viewBox units,
 * so a fixed margin lets the outer slot of a loaded corridor at the edge of the
 * network hang outside the viewBox and get clipped.
 */
export const SCHEMATIC_MARGIN = 40;

/**
 * Drawn stroke width of one line, in **viewBox units**.
 *
 * @remarks
 * The one number the rest of the schematic metrics are derived from, and the
 * reason it is a layout constant rather than a CSS one: the offset between two
 * lines of a corridor is computed here, in viewBox units, so the stroke width
 * has to be in the same units or the parallel lines will not fill their slots.
 * The previous view drew with `vector-effect: non-scaling-stroke`, i.e. in
 * *screen pixels*, which cannot agree with a viewBox-space offset at any zoom.
 */
export const SCHEMATIC_LINE_WIDTH = 4;

/**
 * viewBox units per world metre, so every metric constant of the map's
 * `render-geometry/config` can be re-expressed here without restating a ratio.
 *
 * @remarks
 * Guarded because it is a division by a constant from *another* module. A
 * `LINE_WIDTH_M` of 0 would make every schematic constant `Infinity` or `NaN` and
 * the whole diagram would vanish with no error anywhere — a map-side tuning change
 * must not be able to do that silently.
 */
const UNITS_PER_M = (() => {
  if (!(LINE_WIDTH_M > 0) || !Number.isFinite(LINE_WIDTH_M)) {
    throw new Error(
      `SCHEMATIC_BAD_LINE_WIDTH_M: ${String(LINE_WIDTH_M)} cannot scale viewBox units`,
    );
  }
  return SCHEMATIC_LINE_WIDTH / LINE_WIDTH_M;
})();

/** Gap between adjacent lines, in viewBox units. */
export const SCHEMATIC_LINE_SPACING = LINE_SPACING_M * UNITS_PER_M;
/** Width of one slot — the viewBox units behind one unit of `offsetIndex`. */
export const SCHEMATIC_SLOT = SCHEMATIC_LINE_WIDTH + SCHEMATIC_LINE_SPACING;
/** Free space kept around a junction node, in viewBox units. */
export const SCHEMATIC_NODE_PAD = NODE_PAD_M * UNITS_PER_M;
/** Half-thickness of a station symbol *along* its corridor, in viewBox units. */
export const SCHEMATIC_STATION_HALF_THICKNESS =
  STATION_HALF_THICKNESS_M * UNITS_PER_M;
/** Extra perpendicular margin so a symbol overhangs the lines it covers. */
export const SCHEMATIC_STATION_ACROSS_MARGIN =
  STATION_ACROSS_MARGIN_M * UNITS_PER_M;
/** Arc segments per rounded corner of a station symbol. */
export const SCHEMATIC_STATION_CORNER_STEPS = STATION_CORNER_STEPS;

/**
 * Whether a stop served by a single line still draws as a **circle**.
 *
 * @remarks
 * Not a style preference — it is the I/O matrix's own row, and it holds only as
 * long as the across margin does not exceed the half-thickness. `roundedRectRing`
 * takes the corner radius to be the smaller half-extent, so the marker is a
 * circle exactly when its two half-extents are equal, and for one slot the across
 * half-extent is `max(0 + margin, thickness)`. Let the margin grow past the
 * thickness and every single-line stop in the product silently becomes an ellipse.
 * Both numbers come from `render-geometry/config`, which this module does not own,
 * so the invariant is asserted here rather than assumed.
 */
export const SCHEMATIC_LONE_STOP_IS_CIRCLE =
  SCHEMATIC_STATION_ACROSS_MARGIN <= SCHEMATIC_STATION_HALF_THICKNESS;

/**
 * How far, in viewBox units, the drawing stage can reach beyond a centerline:
 * the outermost slot of the widest bundle plus the reach of a station symbol.
 *
 * @remarks
 * Normalisation fits the centerlines; offsets and capsules happen after it, in
 * viewBox units. So the margin the projection reserves has to cover them, or a
 * loaded corridor on the edge of the network draws its outer lines outside the
 * viewBox and the SVG clips them — silently, since the layout's own numbers would
 * all still be inside `bounds`.
 *
 * @param maxSlotCount - Slots of the widest corridor in the layout.
 */
export function schematicDrawingReach(maxSlotCount: number): number {
  const outermostSlot = (Math.max(1, maxSlotCount) - 1) / 2;
  return (
    outermostSlot * SCHEMATIC_SLOT +
    SCHEMATIC_STATION_ACROSS_MARGIN +
    SCHEMATIC_STATION_HALF_THICKNESS +
    SCHEMATIC_LINE_WIDTH / 2
  );
}

/** Deterministic string order, used everywhere ids are sorted. */
export const byString = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
