/**
 * Deterministic label placement and collision resolution.
 *
 * @remarks
 * Runs in the SVG worker, so it can never reach `document`, `document.fonts`,
 * a canvas, or MapLibre's collision manager. That is not only an architectural
 * boundary — it is what makes the result reproducible: measuring text through
 * the platform would make the layout depend on which fonts the machine has
 * installed, and two exports of the same map would disagree.
 *
 * Instead the pass uses its own advance-width table (see {@link measureText}).
 * The numbers are approximate for any given font, and deliberately so: what
 * matters is that they are *the same numbers everywhere*, so a label hidden by
 * collision on one machine is hidden on every machine.
 */

import {
  projectScenePoint,
  type SceneLabel,
  type SceneLabelAnchor,
  type SceneProjection,
} from '@vellum/core';

/**
 * Advance width as a fraction of the font size, for a monospace stack.
 *
 * @remarks
 * Measured against DM Mono, whose advance is 0.6em like most monospace
 * faces. A proportional fallback resolves narrower, so this over-estimates
 * slightly — which is the safe direction: labels are spaced a little more
 * generously than strictly needed rather than overlapping.
 */
const MONOSPACE_ADVANCE_EM = 0.6;

/**
 * Fraction of the font size a glyph rises above the baseline.
 *
 * @remarks
 * Cap height rather than full ascent: collision boxes should hug the visible
 * text, not the font's line box, or labels repel each other from empty space.
 */
const CAP_HEIGHT_EM = 0.72;

/** Padding added around a label's box before testing overlap, in pixels. */
const COLLISION_PADDING_PX = 2;

/** A label that survived layout, with its resolved output-space geometry. */
export interface PlacedLabel {
  /** The label as the scene declared it. */
  readonly label: SceneLabel;
  /** Baseline origin in output pixels. */
  readonly xPx: number;
  /** Baseline origin in output pixels. */
  readonly yPx: number;
  /** SVG `text-anchor` matching the label's declared anchor. */
  readonly textAnchor: 'start' | 'middle' | 'end';
}

/** Outcome of one layout pass. */
export interface LabelLayout {
  /** Labels to draw, in the order they were placed. */
  readonly placed: readonly PlacedLabel[];
  /** How many labels were withheld because a higher-priority one won. */
  readonly hiddenByCollision: number;
  /** How many were withheld because they fell outside the output area. */
  readonly hiddenOutsideArea: number;
}

/** An axis-aligned box in output pixels. */
interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Places every label, hiding those that collide or fall outside the document.
 *
 * @remarks
 * The order is fully determined before anything is placed: priority first,
 * then the stable label id. Nothing depends on the order the scene happened to
 * produce, so the same scene always yields the same layout — including the
 * same set of hidden labels.
 *
 * A losing label is *hidden*, never nudged: moving it would put text somewhere
 * the data does not support, and a map that quietly relocates its own labels
 * is worse than one that omits them.
 *
 * @param labels - Every label in the scene.
 * @param projection - Document projection used to resolve world positions.
 * @returns The placed labels and counts of what was withheld.
 */
export function layoutLabels(
  labels: readonly SceneLabel[],
  projection: SceneProjection,
): LabelLayout {
  const ordered = [...labels].sort(compareLabels);
  const placed: PlacedLabel[] = [];
  const occupied: Box[] = [];
  let hiddenByCollision = 0;
  let hiddenOutsideArea = 0;

  for (const label of ordered) {
    const point = projectScenePoint(projection, label.at);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      hiddenOutsideArea += 1;
      continue;
    }
    const width = measureText(label.text, label.style.fontSizePx);
    const height = label.style.fontSizePx * CAP_HEIGHT_EM;
    const box = boxFor(point.x, point.y, width, height, label.anchor);

    if (!isInsideDocument(box, projection)) {
      // Clipped rather than truncated: a half-drawn word at the edge reads as
      // a rendering bug, and there is nowhere honest to move it to.
      hiddenOutsideArea += 1;
      continue;
    }
    if (occupied.some((other) => overlaps(box, other))) {
      hiddenByCollision += 1;
      continue;
    }

    occupied.push(pad(box, COLLISION_PADDING_PX));
    placed.push({
      label,
      xPx: point.x,
      // SVG positions text on its baseline; the anchor describes the visible
      // box, so the baseline sits half a cap-height below a centred anchor.
      yPx: baselineFor(point.y, height, label.anchor),
      textAnchor: textAnchorFor(label.anchor),
    });
  }

  return { placed, hiddenByCollision, hiddenOutsideArea };
}

/**
 * Estimates a string's rendered width without consulting the platform.
 *
 * @remarks
 * Every code point counts as one advance, so CJK and emoji — which are
 * typically full-width — are under-measured. That is a known limitation of a
 * table this small; it is recorded here rather than hidden because the
 * alternative (real font metrics) would reintroduce machine dependence.
 *
 * Iterates code points, not UTF-16 units, so a surrogate pair counts once
 * instead of twice.
 *
 * @param text - The string to measure.
 * @param fontSizePx - Font size in output pixels.
 * @returns Estimated width in output pixels.
 */
export function measureText(text: string, fontSizePx: number): number {
  let codePoints = 0;
  for (const _ of text) codePoints += 1;
  return codePoints * fontSizePx * MONOSPACE_ADVANCE_EM;
}

/** Priority first, then the stable id — never the scene's iteration order. */
function compareLabels(a: SceneLabel, b: SceneLabel): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function boxFor(
  x: number,
  y: number,
  width: number,
  height: number,
  anchor: SceneLabelAnchor,
): Box {
  const halfHeight = height / 2;
  if (anchor === 'left') {
    return {
      left: x,
      top: y - halfHeight,
      right: x + width,
      bottom: y + halfHeight,
    };
  }
  if (anchor === 'right') {
    return {
      left: x - width,
      top: y - halfHeight,
      right: x,
      bottom: y + halfHeight,
    };
  }
  const halfWidth = width / 2;
  if (anchor === 'top') {
    return {
      left: x - halfWidth,
      top: y,
      right: x + halfWidth,
      bottom: y + height,
    };
  }
  if (anchor === 'bottom') {
    return {
      left: x - halfWidth,
      top: y - height,
      right: x + halfWidth,
      bottom: y,
    };
  }
  return {
    left: x - halfWidth,
    top: y - halfHeight,
    right: x + halfWidth,
    bottom: y + halfHeight,
  };
}

function baselineFor(
  y: number,
  height: number,
  anchor: SceneLabelAnchor,
): number {
  if (anchor === 'top') return y + height;
  if (anchor === 'bottom') return y;
  return y + height / 2;
}

function textAnchorFor(anchor: SceneLabelAnchor): 'start' | 'middle' | 'end' {
  if (anchor === 'left') return 'start';
  if (anchor === 'right') return 'end';
  return 'middle';
}

function isInsideDocument(box: Box, projection: SceneProjection): boolean {
  return (
    box.left >= 0 &&
    box.top >= 0 &&
    box.right <= projection.width &&
    box.bottom <= projection.height
  );
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

function pad(box: Box, amount: number): Box {
  return {
    left: box.left - amount,
    top: box.top - amount,
    right: box.right + amount,
    bottom: box.bottom + amount,
  };
}
