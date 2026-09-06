import type { ExportTargetLongEdge } from '../ipc-contract';
import type { ExportSnapshot } from '../types/export-pipeline';

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
