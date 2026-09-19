/**
 * Composites the cartographic marginalia onto a captured WebGL frame.
 *
 * @remarks
 * The layout comes from `@vellum/core` (`layoutSnapshotMarginalia`) and is
 * painted by core's `paintMarginalia`; this module only owns the browser side:
 * waiting for DM Mono, copying the WebGL canvas onto a 2D canvas the size of
 * the frame, painting, and encoding the PNG.
 *
 * Memory: compositing needs one full RGBA copy of the captured frame next to
 * the WebGL drawing buffer. For a tile that is bounded by the tile plan; for
 * the legacy single-surface route it is a copy of the *whole* document
 * (up to its 64 MP cap), held until the PNG is encoded. Frames that do not
 * intersect the panel skip the copy entirely (`marginaliaOverlayFor` returns
 * `null`), and each tile paints only its share of the panel.
 */

import {
  MARGINALIA_FONT_FAMILY,
  paintMarginalia,
  type MarginaliaLayout,
  type PixelRect,
} from '@vellum/core';

/** Where a captured frame sits in the document, and what to paint over it. */
export interface MarginaliaOverlay {
  /** Layout of the whole document, in output pixels. */
  readonly layout: MarginaliaLayout;
  /** Output-pixel rectangle the captured frame covers. */
  readonly rect: PixelRect;
}

/**
 * Returns the overlay for a frame, or `null` when the frame shows no marginalia.
 *
 * @param layout - Layout of the complete document.
 * @param rect - Output-pixel rectangle the frame covers; the whole surface when omitted.
 */
export function marginaliaOverlayFor(
  layout: MarginaliaLayout,
  rect: PixelRect = {
    x: 0,
    y: 0,
    width: layout.surface.width,
    height: layout.surface.height,
  },
): MarginaliaOverlay | null {
  const { bounds } = layout;
  if (!bounds || layout.primitives.length === 0) return null;
  const overlaps =
    bounds.x < rect.x + rect.width &&
    rect.x < bounds.x + bounds.width &&
    bounds.y < rect.y + rect.height &&
    rect.y < bounds.y + bounds.height;
  return overlaps ? { layout, rect } : null;
}

/**
 * Waits for DM Mono before anything is painted with it.
 *
 * @remarks
 * A canvas silently draws with the fallback face when the web font has not
 * finished loading, and the first tile would then disagree with the rest. A
 * failure is not fatal: the stack falls back to `monospace` and says so.
 *
 * @returns `true` when DM Mono is available.
 */
export async function loadMarginaliaFont(): Promise<boolean> {
  const fonts = (globalThis as { document?: Document }).document?.fonts;
  if (!fonts) return false;
  try {
    const faces = await fonts.load(`16px ${MARGINALIA_FONT_FAMILY}`);
    if (faces.length > 0) return true;
  } catch {
    // Reported below.
  }
  console.warn(
    '[export] DM Mono is not available; marginalia text falls back to monospace.',
  );
  return false;
}

/**
 * Paints the overlay onto a copy of `source` and encodes it as PNG.
 *
 * @param source - The rendered WebGL canvas (`preserveDrawingBuffer: true`).
 * @param overlay - Marginalia to paint over the frame.
 * @returns Encoded PNG bytes of the composited frame.
 */
export async function encodeCanvasWithMarginalia(
  source: HTMLCanvasElement,
  overlay: MarginaliaOverlay,
): Promise<Uint8Array> {
  const { width, height } = source;
  const surface = createCompositingSurface(width, height);
  const ctx = surface.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) {
    throw new Error(
      'Marginalia compositing failed: a 2D canvas context is unavailable',
    );
  }
  ctx.drawImage(source, 0, 0);
  paintMarginalia(ctx, overlay.layout, {
    offsetX: -overlay.rect.x,
    offsetY: -overlay.rect.y,
    // A HiDPI legacy surface or a supersampled tile is larger than the output
    // rectangle it represents; the layout is scaled to the physical frame.
    scale: overlay.rect.width > 0 ? width / overlay.rect.width : 1,
    clip: overlay.rect,
  });
  const blob = await encodeSurface(surface);
  return new Uint8Array(await blob.arrayBuffer());
}

type CompositingSurface = OffscreenCanvas | HTMLCanvasElement;

/** An `OffscreenCanvas` when the host has one, a detached `<canvas>` otherwise. */
function createCompositingSurface(
  width: number,
  height: number,
): CompositingSurface {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encodeSurface(surface: CompositingSurface): Promise<Blob> {
  if (!('toBlob' in surface)) {
    return surface.convertToBlob({ type: 'image/png' });
  }
  return new Promise((resolve, reject) => {
    surface.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png');
  });
}
