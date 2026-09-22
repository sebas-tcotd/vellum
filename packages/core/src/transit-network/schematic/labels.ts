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
} from './contract';

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

interface LabelBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const overlaps = (a: LabelBox, b: LabelBox): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

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

/** Axis-aligned bounds of a text box of `width × height` rotated by `angle`. */
function rotatedBox(
  centreX: number,
  centreY: number,
  width: number,
  height: number,
  angle: number,
): LabelBox {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const halfX = (cos * width + sin * height) / 2;
  const halfY = (sin * width + cos * height) / 2;
  return {
    left: centreX - halfX,
    right: centreX + halfX,
    top: centreY - halfY,
    bottom: centreY + halfY,
  };
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
  const stationSize = SCHEMATIC_STATION_LABEL_SIZE * scale;
  const strokeReach = (SCHEMATIC_LINE_WIDTH / 2) * scale;
  const widthOf = (text: string, size: number): number =>
    text.length * size * GLYPH_ADVANCE;

  const occupied: LabelBox[] = [];
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
  const ordered = [...layout.stations].sort((a, b) => {
    const priority = (station: typeof a): number =>
      (station.confirmedTransfer ? 4 : 0) +
      (station.lineIds.length > 1 ? 2 : 0) +
      (station.lineIds.some((lineId) => callsByLine.get(lineId) === 1) ? 1 : 0);
    return (
      priority(b) - priority(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  });
  for (const station of ordered) {
    const name = stationById.get(station.id)?.name?.trim();
    // An absent real name intentionally remains a symbol with no fabricated id.
    if (!name) continue;
    const width = widthOf(name, stationSize);
    const gap = strokeReach + stationSize * 0.6;
    const candidates = [
      { dx: gap, dy: -gap, anchor: 'start' as const },
      { dx: -gap, dy: -gap, anchor: 'end' as const },
      { dx: gap, dy: stationSize, anchor: 'start' as const },
      { dx: -gap, dy: stationSize, anchor: 'end' as const },
    ];
    let placed = false;
    for (const candidate of candidates) {
      const x = station.x + candidate.dx;
      const y = station.y + candidate.dy;
      const centreX =
        candidate.anchor === 'start' ? x + width / 2 : x - width / 2;
      const box = rotatedBox(
        centreX,
        y - stationSize * 0.35,
        width,
        stationSize,
        0,
      );
      if (occupied.some((other) => overlaps(box, other))) continue;
      occupied.push(box);
      result.push({
        id: `station:${station.id}`,
        kind: 'station',
        variant: 'full',
        accessibleName: name,
        text: name,
        x,
        y,
        anchor: candidate.anchor,
        angle: 0,
        fontSize: SCHEMATIC_STATION_LABEL_SIZE,
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
      fontSize: SCHEMATIC_STATION_LABEL_SIZE,
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
      if (occupied.some((other) => overlaps(box, other))) continue;
      // The anchor is the optical centre of the run; the view centres the
      // glyphs on it vertically (`dominant-baseline`) rather than this module
      // guessing at a baseline offset in a rotated frame.
      chosen = { x: centreX, y: centreY, box };
      break;
    }
    if (chosen === null) continue;
    occupied.push(chosen.box);
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
