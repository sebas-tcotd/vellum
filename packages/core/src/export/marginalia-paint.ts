/**
 * Paints a {@link MarginaliaLayout} onto any 2D canvas.
 *
 * @remarks
 * One painter for every raster destination — the dialog preview, the legacy
 * single-surface PNG and each tile of the tiled PNG. It is written against
 * {@link MarginaliaCanvas}, the handful of `CanvasRenderingContext2D` members it
 * actually calls, so `@vellum/core` keeps no DOM dependency and a test can hand
 * it a recording fake.
 */

import type {
  MarginaliaBounds,
  MarginaliaLayout,
  MarginaliaPrimitive,
  MarginaliaText,
} from './marginalia-layout';
import {
  MARGINALIA_FONT_FAMILY,
  marginaliaGlyphAdvance,
  measureMarginaliaText,
} from './marginalia-layout';

/** Gradient handle returned by {@link MarginaliaCanvas.createLinearGradient}. */
export interface MarginaliaGradient {
  addColorStop(offset: number, color: string): void;
}

/**
 * Minimal 2D canvas surface the painter draws on.
 *
 * @remarks
 * Structurally satisfied by `CanvasRenderingContext2D` and
 * `OffscreenCanvasRenderingContext2D`. Style properties are typed `unknown`
 * because the painter only ever writes them.
 */
export interface MarginaliaCanvas {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): MarginaliaGradient;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: unknown;
  lineJoin: unknown;
  font: string;
  textAlign: unknown;
  textBaseline: unknown;
  globalAlpha: number;
}

/** Where the layout lands on the canvas. */
export interface MarginaliaPaintTransform {
  /** Added to every output-pixel X before scaling (e.g. `-renderRect.x`). */
  readonly offsetX: number;
  /** Added to every output-pixel Y before scaling (e.g. `-renderRect.y`). */
  readonly offsetY: number;
  /** Canvas pixels per output pixel. */
  readonly scale: number;
  /**
   * Output-pixel rectangle the canvas covers; nothing outside it is painted.
   *
   * @remarks
   * A tile passes its `renderRect`, so only the intersection of the panel with
   * the tile is drawn and a tile that misses the panel paints nothing at all.
   */
  readonly clip?: MarginaliaBounds;
}

function intersects(a: MarginaliaBounds, b: MarginaliaBounds): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * Paints the layout.
 *
 * @returns `true` when anything was painted.
 */
export function paintMarginalia(
  ctx: MarginaliaCanvas,
  layout: MarginaliaLayout,
  transform: MarginaliaPaintTransform,
): boolean {
  const { bounds } = layout;
  if (!bounds || layout.primitives.length === 0) return false;
  if (transform.clip && !intersects(bounds, transform.clip)) return false;

  ctx.save();
  try {
    ctx.scale(transform.scale, transform.scale);
    ctx.translate(transform.offsetX, transform.offsetY);
    if (transform.clip) {
      const { clip } = transform;
      const x = Math.max(clip.x, bounds.x);
      const y = Math.max(clip.y, bounds.y);
      ctx.beginPath();
      ctx.rect(
        x,
        y,
        Math.min(clip.x + clip.width, bounds.x + bounds.width) - x,
        Math.min(clip.y + clip.height, bounds.y + bounds.height) - y,
      );
      ctx.clip();
    }
    for (const primitive of layout.primitives) {
      paintPrimitive(ctx, primitive);
    }
  } finally {
    ctx.restore();
  }
  return true;
}

function paintPrimitive(
  ctx: MarginaliaCanvas,
  primitive: MarginaliaPrimitive,
): void {
  switch (primitive.kind) {
    case 'rect': {
      if (primitive.fill !== undefined) {
        ctx.globalAlpha = primitive.fillOpacity ?? 1;
        ctx.fillStyle = primitive.fill;
        ctx.beginPath();
        ctx.rect(primitive.x, primitive.y, primitive.width, primitive.height);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (primitive.stroke !== undefined && primitive.strokeWidth) {
        ctx.strokeStyle = primitive.stroke;
        ctx.lineWidth = primitive.strokeWidth;
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.rect(primitive.x, primitive.y, primitive.width, primitive.height);
        ctx.stroke();
      }
      return;
    }
    case 'line':
      ctx.strokeStyle = primitive.stroke;
      ctx.lineWidth = primitive.strokeWidth;
      ctx.lineCap = primitive.lineCap;
      ctx.beginPath();
      ctx.moveTo(primitive.x1, primitive.y1);
      ctx.lineTo(primitive.x2, primitive.y2);
      ctx.stroke();
      return;
    case 'path': {
      const [first, ...rest] = primitive.points;
      if (!first) return;
      ctx.fillStyle = primitive.fill;
      ctx.beginPath();
      ctx.moveTo(first[0], first[1]);
      for (const point of rest) ctx.lineTo(point[0], point[1]);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'ramp': {
      const gradient = ctx.createLinearGradient(
        primitive.x,
        0,
        primitive.x + primitive.width,
        0,
      );
      for (const stop of primitive.stops) {
        gradient.addColorStop(stop.offset, stop.color);
      }
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.rect(primitive.x, primitive.y, primitive.width, primitive.height);
      ctx.fill();
      return;
    }
    case 'text':
      paintText(ctx, primitive);
      return;
  }
}

/**
 * Draws one text run: halo stroke underneath, fill on top.
 *
 * @remarks
 * Tracked text is placed glyph by glyph on the monospaced advance the layout
 * measured with, so the canvas and the SVG agree on its width without relying
 * on `letterSpacing` support in the host canvas.
 */
function paintText(ctx: MarginaliaCanvas, text: MarginaliaText): void {
  ctx.font = `${text.fontSize}px ${MARGINALIA_FONT_FAMILY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const glyphs = text.letterSpacing > 0 ? clusters(text.text) : [text.text];
  const width = measureMarginaliaText(
    text.text,
    text.fontSize,
    text.letterSpacing,
  );
  const startX =
    text.anchor === 'start'
      ? text.x
      : text.anchor === 'middle'
        ? text.x - width / 2
        : text.x - width;
  const draw = (paint: (value: string, x: number) => void): void => {
    if (glyphs.length === 1 && text.letterSpacing <= 0) {
      paint(text.text, startX);
      return;
    }
    // Same advances the layout measured: wide glyphs take two cells, and a
    // joiner or combining mark rides with the glyph before it.
    let x = startX;
    for (const glyph of glyphs) {
      paint(glyph, x);
      x += measureMarginaliaText(glyph, text.fontSize) + text.letterSpacing;
    }
  };

  ctx.textAlign = 'left';
  if (text.halo.width > 0) {
    ctx.strokeStyle = text.halo.color;
    ctx.lineWidth = text.halo.width;
    draw((value, x) => ctx.strokeText(value, x, text.y));
  }
  ctx.fillStyle = text.fill;
  draw((value, x) => ctx.fillText(value, x, text.y));
}

/** Splits text into visible glyphs, keeping zero-advance marks with their base. */
function clusters(text: string): string[] {
  const out: string[] = [];
  for (const glyph of text) {
    if (out.length > 0 && marginaliaGlyphAdvance(glyph) === 0) {
      out[out.length - 1] += glyph;
    } else {
      out.push(glyph);
    }
  }
  return out;
}
