/**
 * Label placement for the schematic diagram: LOOM's own presentation rules
 * (Bast, Brosi & Storandt, Fig. 1), applied to a laid-out network.
 *
 * @remarks
 * Three rules decide everything here, and all three come from reading the
 * papers' renderings rather than from taste:
 *
 * 1. **A line names itself only where it runs alone.** On a corridor several
 *    lines share, a name next to the bundle cannot say *which* stroke it
 *    belongs to, so LOOM prints nothing there. Solo-ness is measured on the
 *    **drawn** strokes, not on the corridor's slot list: hiding every other
 *    line of a bundle really does leave this one alone, and the diagram should
 *    say so.
 * 2. **A label has to fit the thing it names.** A line label is set along a
 *    straight piece of its own stroke and is only placed when that piece is
 *    longer than the text. That single test is what keeps a dense network from
 *    turning into the overlapping mess a "place them all" pass produces.
 * 3. **Placement is measured on screen, not in the viewBox.** Every size here
 *    is in *design pixels* and is multiplied by the camera's quantised
 *    {@link SchematicLabelOptions.scale} on the way into viewBox space. Zooming
 *    in shrinks a label's footprint in diagram units, so more labels clear the
 *    fit and collision tests — semantic zoom falls out of the geometry instead
 *    of needing a second density knob.
 *
 * Nothing here invents a name. A stop the city never named stays a symbol with
 * an accessible name of its own and no drawn text.
 */

import {
  SCHEMATIC_LINE_WIDTH,
  type SchematicLayout,
  type SchematicPoint,
  type SchematicStation,
} from './contract';
import { transitModeImportance } from './importance';

/** A data-backed name available to the schematic presentation layer. */
export interface SchematicLabelSource {
  readonly id: string;
  readonly name: string | null;
  readonly mode?: string | null;
}

export type SchematicLabelVariant = 'full' | 'compact' | 'symbol';

export interface SchematicLabel {
  readonly id: string;
  readonly kind: 'line' | 'station';
  readonly variant: SchematicLabelVariant;
  /** Always the real, complete name for assistive technology and detail UI. */
  readonly accessibleName: string;
  /** Text painted in the diagram; absent for a symbol-only datum. */
  readonly text: string | null;
  /** Baseline anchor, already in viewBox units for the requested scale. */
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'middle' | 'end';
  /** Tangent angle in degrees, normalised to the readable hemisphere. */
  readonly angle: number;
  /** Type size in design pixels; the view multiplies it by the same scale. */
  readonly fontSize: number;
  /** The line's own colour for a line label; `null` means "use the text token". */
  readonly color: string | null;
}

export interface SchematicLabelOptions {
  /**
   * viewBox units per design pixel — the camera's quantised visual scale. `1`
   * is the fitted diagram; zooming in lowers it and lets more labels through.
   */
  readonly scale?: number;
}

/** Type size of a line label, in design pixels. */
export const SCHEMATIC_LINE_LABEL_SIZE = 11;
/** Type size of a station label, in design pixels. */
export const SCHEMATIC_STATION_LABEL_SIZE = 12;
/** Smallest station type the density rule may choose, in design pixels. */
export const SCHEMATIC_STATION_LABEL_MIN_SIZE = 9;
/**
 * Type size per design pixel of stop spacing: at 0.45 a name set
 * perpendicular to its line is about half as tall as the gap to the next stop,
 * which leaves room for that stop's own name beside it.
 */
const STATION_SIZE_PER_SPACING = 0.45;
/**
 * Mean glyph advance as a fraction of the type size.
 *
 * @remarks
 * A measurement stands in for one because the layout runs in a worker with no
 * font metrics at all. 0.58 is the advance of a semibold humanist sans over
 * mixed-case Latin text; it is deliberately a slight over-estimate, since the
 * failure of a too-small box is two labels drawn on top of each other and the
 * failure of a too-large one is a label that waits for the next zoom step.
 */
const GLYPH_ADVANCE = 0.58;

/**
 * An oriented box: centre, unit axis `u` (along the text) and half extents
 * along `u` and its normal. Labels, stop markers and stroke pieces are all
 * one of these, so a single separating-axis test covers every collision.
 */
interface LabelBox {
  readonly cx: number;
  readonly cy: number;
  readonly ux: number;
  readonly uy: number;
  readonly hu: number;
  readonly hv: number;
}

/** Separating-axis test over the two boxes' four axes. */
function overlaps(a: LabelBox, b: LabelBox): boolean {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  for (const [ax, ay] of [
    [a.ux, a.uy],
    [-a.uy, a.ux],
    [b.ux, b.uy],
    [-b.uy, b.ux],
  ]) {
    const reach = (box: LabelBox): number =>
      box.hu * Math.abs(box.ux * ax + box.uy * ay) +
      box.hv * Math.abs(-box.uy * ax + box.ux * ay);
    if (Math.abs(dx * ax + dy * ay) > reach(a) + reach(b)) return false;
  }
  return true;
}

/** The box a stroke piece of half-width `reach` paints between two points. */
function pieceBox(
  from: SchematicPoint,
  to: SchematicPoint,
  reach: number,
): LabelBox {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    cx: (from.x + to.x) / 2,
    cy: (from.y + to.y) / 2,
    ux: length > 0 ? (to.x - from.x) / length : 1,
    uy: length > 0 ? (to.y - from.y) / length : 0,
    hu: length / 2 + reach,
    hv: reach,
  };
}

/** Conservatively extracts a numbered line's compact, non-invented identity. */
export function deriveSchematicLineLabel(
  name: string | null | undefined,
): string | null {
  const value = name?.trim() ?? '';
  if (!value) return null;
  const hash = /#\s*(\d+)\b/.exec(value);
  if (hash) return hash[1];
  const line = /\b(?:line|línea)\s+(\d+)\b/i.exec(value);
  return line?.[1] ?? null;
}

/**
 * Chooses a stable degradation. A compact code is only used when it identifies
 * one visible entity; otherwise mode context is tried before falling to symbol.
 */
export function resolveLabelVariant(
  source: SchematicLabelSource,
  compactUseCount: ReadonlyMap<string, number> = new Map(),
): { readonly variant: SchematicLabelVariant; readonly text: string | null } {
  const full = source.name?.trim() ?? '';
  if (!full) return { variant: 'symbol', text: null };
  const compact = deriveSchematicLineLabel(full);
  if (compact && compactUseCount.get(compact) === 1) {
    return { variant: 'compact', text: compact };
  }
  if (compact && source.mode?.trim()) {
    return { variant: 'compact', text: `${source.mode.trim()} ${compact}` };
  }
  return { variant: 'full', text: full };
}

/** The longest straight piece of a polyline, or `null` when it has none. */
function longestStraightPiece(
  points: readonly SchematicPoint[],
): { from: SchematicPoint; to: SchematicPoint; length: number } | null {
  let best: {
    from: SchematicPoint;
    to: SchematicPoint;
    length: number;
  } | null = null;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (best === null || length > best.length) best = { from, to, length };
  }
  return best;
}

/** Degrees in the readable hemisphere: text never reads upside down. */
function readableAngle(from: SchematicPoint, to: SchematicPoint): number {
  let angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return angle;
}

/**
 * Uniform grid over oriented boxes, so a candidate label is only tested
 * against the obstacles around it. Without it every candidate was tested
 * against every stroke piece — ~140 ms per zoom step on a geographic layout
 * of 11k points, paid on nearly every wheel tick.
 */
class BoxGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly boxes: LabelBox[] = [];
  private readonly owners: (string | null)[] = [];
  private readonly seen: number[] = [];
  private stamp = 0;

  constructor(private readonly cell: number) {}

  add(box: LabelBox, owner: string | null = null): void {
    const index = this.boxes.length;
    this.boxes.push(box);
    this.owners.push(owner);
    this.seen.push(0);
    this.forCells(box, (key) => {
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(index);
      else this.cells.set(key, [index]);
    });
  }

  /** Whether `box` overlaps anything stored, ignoring boxes owned by `owner`. */
  hits(box: LabelBox, owner: string | null = null): boolean {
    const stamp = ++this.stamp;
    let hit = false;
    this.forCells(box, (key) => {
      if (hit) return;
      for (const index of this.cells.get(key) ?? []) {
        if (this.seen[index] === stamp) continue;
        this.seen[index] = stamp;
        if (owner !== null && this.owners[index] === owner) continue;
        if (overlaps(box, this.boxes[index])) {
          hit = true;
          return;
        }
      }
    });
    return hit;
  }

  /** Indices of the stored boxes whose cells `box` touches. */
  near(box: LabelBox): number[] {
    const stamp = ++this.stamp;
    const found: number[] = [];
    this.forCells(box, (key) => {
      for (const index of this.cells.get(key) ?? []) {
        if (this.seen[index] === stamp) continue;
        this.seen[index] = stamp;
        found.push(index);
      }
    });
    return found;
  }

  private forCells(box: LabelBox, visit: (key: number) => void): void {
    const reachX = box.hu * Math.abs(box.ux) + box.hv * Math.abs(box.uy);
    const reachY = box.hu * Math.abs(box.uy) + box.hv * Math.abs(box.ux);
    const i0 = Math.floor((box.cx - reachX) / this.cell);
    const i1 = Math.floor((box.cx + reachX) / this.cell);
    const j0 = Math.floor((box.cy - reachY) / this.cell);
    const j1 = Math.floor((box.cy + reachY) / this.cell);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) visit((i + 32768) * 65536 + (j + 32768));
    }
  }
}

/** Text box of `width × height` centred on a point and rotated by `angle`. */
function rotatedBox(
  centreX: number,
  centreY: number,
  width: number,
  height: number,
  angle: number,
): LabelBox {
  const radians = (angle * Math.PI) / 180;
  return {
    cx: centreX,
    cy: centreY,
    ux: Math.cos(radians),
    uy: Math.sin(radians),
    hu: width / 2,
    hv: height / 2,
  };
}

/**
 * Axis of the line(s) through a station, in radians modulo π.
 *
 * @remarks
 * Taken from the drawn stroke pieces nearest the stop, so it follows the
 * geometry the reader sees in every strategy (octilinear, orthoradial or
 * geographic), not a grid direction. Directions are averaged on the doubled
 * angle so a piece and its reverse agree. `null` when no stroke comes near.
 */
function stationAxis(
  station: SchematicStation,
  pieces: readonly {
    from: SchematicPoint;
    to: SchematicPoint;
    lineId: string;
  }[],
  reach: number,
): number | null {
  let sumX = 0;
  let sumY = 0;
  for (const { from, to, lineId } of pieces) {
    if (!station.lineIds.includes(lineId)) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) continue;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((station.x - from.x) * dx + (station.y - from.y) * dy) / lengthSquared,
      ),
    );
    const distance = Math.hypot(
      from.x + dx * t - station.x,
      from.y + dy * t - station.y,
    );
    if (distance > reach) continue;
    const doubled = 2 * Math.atan2(dy, dx);
    sumX += Math.cos(doubled);
    sumY += Math.sin(doubled);
  }
  if (sumX === 0 && sumY === 0) return null;
  return Math.atan2(sumY, sumX) / 2;
}

/** How far the stop's own symbol reaches from its centre along a direction. */
function markerReach(
  station: SchematicStation,
  directionX: number,
  directionY: number,
): number {
  let reach = 0;
  for (const point of station.shape) {
    reach = Math.max(
      reach,
      (point.x - station.x) * directionX + (point.y - station.y) * directionY,
    );
  }
  return reach;
}

/** Axis-aligned box around a stop's symbol, the obstacle it is to other labels. */
function markerBox(station: SchematicStation, minimum: number): LabelBox {
  let halfX = minimum;
  let halfY = minimum;
  for (const point of station.shape) {
    halfX = Math.max(halfX, Math.abs(point.x - station.x));
    halfY = Math.max(halfY, Math.abs(point.y - station.y));
  }
  return { cx: station.x, cy: station.y, ux: 1, uy: 0, hu: halfX, hv: halfY };
}

/**
 * Station type size for this view, in design pixels.
 *
 * @remarks
 * Set by how far apart the stops actually are on screen: the upper quartile
 * of each stop's distance to its nearest neighbour. Not the median — a city
 * builder's stops come in pairs across the street, one per direction, and
 * that pair spacing would pin the type to its minimum at every zoom. A dense fitted view gets small
 * type that still lets most names through; zooming in spreads the stops and
 * the type grows back to its full size. One size for every stop — mixed sizes
 * would read as a hierarchy the data does not have.
 */
function stationTypeSize(
  stations: readonly SchematicStation[],
  scale: number,
): number {
  if (stations.length < 2) return SCHEMATIC_STATION_LABEL_SIZE;
  // ponytail: O(n²) nearest neighbour; a grid index if a network ever passes a few thousand stops.
  const nearest = stations
    .map((station) => {
      let best = Infinity;
      for (const other of stations) {
        if (other === station) continue;
        const distance = Math.hypot(other.x - station.x, other.y - station.y);
        if (distance > 0 && distance < best) best = distance;
      }
      return best;
    })
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (nearest.length === 0) return SCHEMATIC_STATION_LABEL_SIZE;
  const spacing = nearest[Math.floor(nearest.length * 0.75)] / scale;
  return Math.min(
    SCHEMATIC_STATION_LABEL_SIZE,
    Math.max(
      SCHEMATIC_STATION_LABEL_MIN_SIZE,
      spacing * STATION_SIZE_PER_SPACING,
    ),
  );
}

/**
 * Projects data labels onto a laid-out diagram at one camera scale.
 *
 * @param layout - The layout as the diagram draws it, already filtered.
 * @param lines - Name and mode per *visible* line.
 * @param stations - Real stop names, keyed by the layout's station ids.
 * @param options - {@link SchematicLabelOptions.scale}, the camera's quantised
 *   visual scale. Everything is a function of the layout and this number, so
 *   panning never moves a label and the same zoom step always reads the same.
 */
export function placeSchematicLabels(
  layout: SchematicLayout,
  lines: readonly SchematicLabelSource[],
  stations: readonly SchematicLabelSource[],
  options: SchematicLabelOptions = {},
): readonly SchematicLabel[] {
  const scale =
    Number.isFinite(options.scale) && (options.scale as number) > 0
      ? (options.scale as number)
      : 1;
  const lineSize = SCHEMATIC_LINE_LABEL_SIZE * scale;
  const strokeReach = (SCHEMATIC_LINE_WIDTH / 2) * scale;
  const widthOf = (text: string, size: number): number =>
    text.length * size * GLYPH_ADVANCE;

  const result: SchematicLabel[] = [];

  // ── Stations first. A named stop is the detail a reader is looking for, and
  // emitting it ahead of the line labels is what stops a line name from taking
  // the space a station already won.
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const callsByLine = new Map<string, number>();
  for (const station of layout.stations) {
    for (const lineId of station.lineIds) {
      callsByLine.set(lineId, (callsByLine.get(lineId) ?? 0) + 1);
    }
  }
  // Story 4.7: the urban importance of a stop's most important line is the
  // primary key, so a metro station wins its name over a bus stop with more
  // lines. Read from the same table the routing order and the stroke weight
  // use; a line without a mode counts as `Unknown`.
  const modeByLine = new Map(lines.map((line) => [line.id, line.mode]));
  const levelOf = (station: SchematicStation): number =>
    Math.max(
      0,
      ...station.lineIds.map((lineId) => {
        const mode = modeByLine.get(lineId);
        return transitModeImportance(mode ?? 'Unknown') ?? 0;
      }),
    );
  const ordered = [...layout.stations].sort((a, b) => {
    // Most important level first, then the busiest stop (octi §5: higher line
    // degree labels first), then the tie-breakers that make a stop the one a
    // reader is looking for.
    const priority = (station: typeof a): number =>
      station.lineIds.length * 8 +
      (station.confirmedTransfer ? 4 : 0) +
      (station.lineIds.some((lineId) => callsByLine.get(lineId) === 1) ? 1 : 0);
    return (
      levelOf(b) - levelOf(a) ||
      priority(b) - priority(a) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  });

  // Obstacles a station name may not cover: every drawn stroke piece and every
  // other stop's symbol. A name across a line is exactly the ambiguity the
  // diagram exists to avoid.
  const pieces = [...layout.segments, ...layout.connectors].flatMap((segment) =>
    segment.points.slice(1).map((to, index) => ({
      from: segment.points[index],
      to,
      lineId: segment.lineId,
    })),
  );
  const stationTypeDesign = stationTypeSize(layout.stations, scale);
  const stationSize = stationTypeDesign * scale;
  // ponytail: cell floor at 1/200 of the diagram keeps a long octilinear run
  // from filling thousands of cells at deep zoom.
  const cell = Math.max(
    stationSize * 2,
    Math.max(layout.bounds.width, layout.bounds.height) / 200,
  );
  // Strokes and everything claimed (markers, placed labels) apart: a line
  // label sits beside its own stroke, so only the claimed grid applies to it.
  const strokes = new BoxGrid(cell);
  const claimed = new BoxGrid(cell);
  for (const piece of pieces) {
    strokes.add(pieceBox(piece.from, piece.to, strokeReach));
  }
  for (const station of layout.stations) {
    claimed.add(markerBox(station, strokeReach), station.id);
  }
  const blocked = (box: LabelBox, ownId: string): boolean =>
    claimed.hits(box, ownId) || strokes.hits(box);

  for (const station of ordered) {
    const name = stationById.get(station.id)?.name?.trim();
    // An absent real name intentionally remains a symbol with no fabricated id.
    if (!name) continue;
    const width = widthOf(name, stationSize);
    const probe = strokeReach * 3;
    const nearby = strokes
      .near({
        cx: station.x,
        cy: station.y,
        ux: 1,
        uy: 0,
        hu: probe,
        hv: probe,
      })
      .map((index) => pieces[index]);
    const axis = stationAxis(station, nearby, probe) ?? 0;
    const perpendicular = axis + Math.PI / 2;
    // The two perpendicular rays first, then the eight octilinear directions
    // ordered by how far they turn from perpendicular (octi §5). Same turn:
    // the ray that reads left-to-right, then upward, so neighbouring names on
    // one line fall on the same side of it.
    const rays = [
      perpendicular,
      perpendicular + Math.PI,
      ...Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4),
    ]
      .map((ray) => {
        const turn = Math.abs(
          Math.atan2(
            Math.sin(ray - perpendicular),
            Math.cos(ray - perpendicular),
          ),
        );
        return {
          ray,
          cost:
            Math.round(Math.min(turn, Math.PI - turn) * 1000) +
            (Math.cos(ray) > 1e-6 ? 0 : Math.cos(ray) < -1e-6 ? 0.2 : 0.1) +
            (Math.sin(ray) < 0 ? 0 : 0.05),
        };
      })
      .sort((a, b) => a.cost - b.cost);
    let placed = false;
    for (const { ray } of rays) {
      const directionX = Math.cos(ray);
      const directionY = Math.sin(ray);
      const start =
        Math.max(markerReach(station, directionX, directionY), strokeReach) +
        stationSize * 0.35;
      const x = station.x + directionX * start;
      const y = station.y + directionY * start;
      const box = rotatedBox(
        x + (directionX * width) / 2,
        y + (directionY * width) / 2,
        width,
        stationSize,
        (ray * 180) / Math.PI,
      );
      if (blocked(box, station.id)) continue;
      // Text runs along the ray, away from the stop; a ray into the left
      // half-plane is set the other way round and anchored at its end so it
      // never reads upside down.
      let angle = (Math.atan2(directionY, directionX) * 180) / Math.PI;
      let anchor: 'start' | 'end' = 'start';
      if (angle > 90 + 1e-6 || angle <= -90 + 1e-6) {
        angle = angle > 0 ? angle - 180 : angle + 180;
        anchor = 'end';
      }
      claimed.add(box);
      result.push({
        id: `station:${station.id}`,
        kind: 'station',
        variant: 'full',
        accessibleName: name,
        text: name,
        x,
        y,
        anchor,
        angle: Math.round(angle * 1000) / 1000,
        fontSize: stationTypeDesign,
        color: null,
      });
      placed = true;
      break;
    }
    if (placed) continue;
    // A genuine collision falls back to the still-accessible station symbol.
    result.push({
      id: `station:${station.id}`,
      kind: 'station',
      variant: 'symbol',
      accessibleName: name,
      text: null,
      x: station.x,
      y: station.y,
      anchor: 'start',
      angle: 0,
      fontSize: stationTypeDesign,
      color: null,
    });
  }
  // ── Line labels, on the strokes that are alone on their corridor.
  const strokesPerCorridor = new Map<string, number>();
  for (const segment of layout.segments) {
    if (segment.edgeId === null) continue;
    strokesPerCorridor.set(
      segment.edgeId,
      (strokesPerCorridor.get(segment.edgeId) ?? 0) + 1,
    );
  }
  const soloRun = new Map<
    string,
    { from: SchematicPoint; to: SchematicPoint; length: number }
  >();
  for (const segment of layout.segments) {
    if (segment.edgeId === null) continue;
    if (strokesPerCorridor.get(segment.edgeId) !== 1) continue;
    const piece = longestStraightPiece(segment.points);
    if (piece === null) continue;
    const best = soloRun.get(segment.lineId);
    if (best === undefined || piece.length > best.length) {
      soloRun.set(segment.lineId, piece);
    }
  }
  const compactCounts = new Map<string, number>();
  for (const line of lines) {
    const compact = deriveSchematicLineLabel(line.name);
    if (compact) {
      compactCounts.set(compact, (compactCounts.get(compact) ?? 0) + 1);
    }
  }
  const colorByLine = new Map<string, string>();
  for (const segment of layout.segments) {
    if (!colorByLine.has(segment.lineId)) {
      colorByLine.set(segment.lineId, segment.color);
    }
  }
  // Longest run first: the line with the most room to name itself gets to claim
  // it, and the order is a function of the geometry rather than of line ids.
  const requests = lines
    .flatMap((line) => {
      const run = soloRun.get(line.id);
      const full = line.name?.trim();
      if (run === undefined || !full) return [];
      return [{ line, run, full }];
    })
    .sort(
      (a, b) => b.run.length - a.run.length || (a.line.id < b.line.id ? -1 : 1),
    );

  for (const { line, run, full } of requests) {
    const compact = resolveLabelVariant(line, compactCounts);
    // Full name when the run can hold it, the compact code when it cannot.
    // Padding at both ends is what keeps a name from reading as if it ran off
    // the end of its own line.
    const padding = lineSize;
    const options_ = [
      { text: full, variant: 'full' as SchematicLabelVariant },
      ...(compact.text && compact.text !== full
        ? [{ text: compact.text, variant: compact.variant }]
        : []),
    ];
    const fitted = options_.find(
      (option) => widthOf(option.text, lineSize) + 2 * padding <= run.length,
    );
    if (fitted === undefined) continue;
    const width = widthOf(fitted.text, lineSize);
    const angle = readableAngle(run.from, run.to);
    const midX = (run.from.x + run.to.x) / 2;
    const midY = (run.from.y + run.to.y) / 2;
    // Unit normal of the run; the label sits clear of the stroke on one side.
    const dx = run.to.x - run.from.x;
    const dy = run.to.y - run.from.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const gap = strokeReach + lineSize * 0.75;
    let chosen: { x: number; y: number; box: LabelBox } | null = null;
    for (const hand of [1, -1]) {
      const centreX = midX + normalX * gap * hand;
      const centreY = midY + normalY * gap * hand;
      const box = rotatedBox(centreX, centreY, width, lineSize, angle);
      // Markers are already in `claimed`: a line label may not sit on a stop.
      if (claimed.hits(box)) continue;
      // The anchor is the optical centre of the run; the view centres the
      // glyphs on it vertically (`dominant-baseline`) rather than this module
      // guessing at a baseline offset in a rotated frame.
      chosen = { x: centreX, y: centreY, box };
      break;
    }
    if (chosen === null) continue;
    claimed.add(chosen.box);
    result.push({
      id: `line:${line.id}`,
      kind: 'line',
      variant: fitted.variant,
      accessibleName: full,
      text: fitted.text,
      x: chosen.x,
      y: chosen.y,
      anchor: 'middle',
      angle,
      fontSize: SCHEMATIC_LINE_LABEL_SIZE,
      color: colorByLine.get(line.id) ?? null,
    });
  }

  return Object.freeze(result);
}
