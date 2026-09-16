import type { ExportTargetLongEdge } from '../ipc-contract';
import type { ExportExtent, ExportSnapshot } from '../types/export-pipeline';
import { mapFrameMarginPixels } from './map-frame-metrics';
import { zoomForWorldUnitsPerPixel } from './output-density';

/** Output pixel dimensions of a rendered export document. */
export interface ExportOutputSurface {
  /** Document width in pixels. */
  width: number;
  /** Document height in pixels. */
  height: number;
}

/**
 * Resolves full-map output pixel dimensions from a world extent.
 *
 * @remarks
 * The single point of resolution math for full-map exports — the export
 * dialog's preview must call this same function rather than re-deriving the
 * aspect-ratio rounding itself, or the two can silently drift apart.
 *
 * Pure arithmetic over core types: it lives here, not in the renderer adapter,
 * so `@vellum/ui` can size its preview without importing `@vellum/renderer-webgl`
 * (ADR-0001).
 *
 * @param extent - The world-space rectangle the document covers.
 * @param targetLongEdge - Requested pixel length of the long edge; falls back to the canvas.
 * @param canvasWidth - Live canvas width in CSS pixels, used only when no target is given.
 * @param canvasHeight - Live canvas height in CSS pixels, used only when no target is given.
 * @returns The document's pixel dimensions, preserving the extent's aspect ratio.
 */
export function resolveFullMapOutputSurface(
  extent: ExportSnapshot['extent'],
  targetLongEdge: ExportTargetLongEdge | undefined,
  canvasWidth = 0,
  canvasHeight = 0,
): ExportOutputSurface {
  const extentAspect =
    (extent.maxX - extent.minX) / (extent.maxZ - extent.minZ);
  const side = targetLongEdge ?? Math.max(canvasWidth, canvasHeight);
  return extentAspect >= 1
    ? { width: side, height: Math.max(1, Math.round(side / extentAspect)) }
    : { width: Math.max(1, Math.round(side * extentAspect)), height: side };
}

/** A full-map export's world extent paired with the surface that renders it. */
export interface FullMapFraming {
  /** Content extent grown by the frame margin; what the document actually covers. */
  extent: ExportExtent;
  /** Pixel dimensions of the document covering {@link FullMapFraming.extent}. */
  surface: ExportOutputSurface;
  /** Per-side margin reserved around the content, in world units. */
  marginWorldUnits: number;
}

/**
 * Fixed-point iterations used to settle the margin against its own zoom.
 *
 * @remarks
 * The margin depends on the export zoom, which depends on the world units per
 * output pixel, which the margin itself shifts. Three passes are far more than
 * the ramp needs: growing an extent by a few percent moves the zoom by
 * hundredths of a level, and the width ramp changes by ~4 px per hundredth at
 * its steepest.
 */
const FRAMING_ITERATIONS = 3;

/**
 * Resolves a full-map export's extent and surface with room for the map frame.
 *
 * @remarks
 * A full-map document maps its extent edge to edge onto its surface, so an
 * extent equal to the city bounds puts the frame *on* the document border:
 * MapLibre paints the outer half of the stroke, and all of its shadow, outside
 * the image. Reserving that margin in the extent — not in the surface — keeps
 * the user's requested long edge exactly as asked and leaves
 * {@link resolveFullMapOutputSurface} the single point of dimension math.
 *
 * The margin is derived per call from {@link mapFrameMarginPixels} evaluated at
 * the real export zoom, never a fixed inset: the frame ramp spans 6 px to
 * 130 px across the zoom range, so any constant would be wrong nearly
 * everywhere.
 *
 * @param extent - The content extent the document must cover (usually city bounds).
 * @param targetLongEdge - Requested pixel length of the long edge; falls back to the canvas.
 * @param canvasWidth - Live canvas width in CSS pixels, used only when no target is given.
 * @param canvasHeight - Live canvas height in CSS pixels, used only when no target is given.
 * @returns The padded extent, its surface, and the margin that produced them.
 */
export function resolveFullMapFraming(
  extent: ExportExtent,
  targetLongEdge: ExportTargetLongEdge | undefined,
  canvasWidth = 0,
  canvasHeight = 0,
): FullMapFraming {
  let framed = extent;
  let surface = resolveFullMapOutputSurface(
    extent,
    targetLongEdge,
    canvasWidth,
    canvasHeight,
  );
  let marginWorldUnits = 0;
  for (let pass = 0; pass < FRAMING_ITERATIONS; pass += 1) {
    // A surface with no long edge (no target, no live canvas) carries no
    // density, so there is no export zoom to evaluate the frame ramp at.
    // Inventing one would reserve a margin for a document nobody sized.
    if (!(surface.width > 0) || !(surface.height > 0)) {
      return { extent, surface, marginWorldUnits: 0 };
    }
    const worldUnitsPerPixel = (framed.maxX - framed.minX) / surface.width;
    if (!Number.isFinite(worldUnitsPerPixel) || worldUnitsPerPixel <= 0) {
      return { extent, surface, marginWorldUnits: 0 };
    }
    const zoom = zoomForWorldUnitsPerPixel(worldUnitsPerPixel);
    const nextMargin = mapFrameMarginPixels(zoom) * worldUnitsPerPixel;
    if (!Number.isFinite(nextMargin) || nextMargin <= 0) {
      return { extent, surface, marginWorldUnits: 0 };
    }
    marginWorldUnits = nextMargin;
    framed = growExtent(extent, marginWorldUnits);
    surface = resolveFullMapOutputSurface(
      framed,
      targetLongEdge,
      canvasWidth,
      canvasHeight,
    );
  }
  return { extent: framed, surface, marginWorldUnits };
}

function growExtent(extent: ExportExtent, margin: number): ExportExtent {
  return {
    minX: extent.minX - margin,
    maxX: extent.maxX + margin,
    minZ: extent.minZ - margin,
    maxZ: extent.maxZ + margin,
  };
}
