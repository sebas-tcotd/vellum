import type { District, CityData } from '@vellum/core';
import type { RendererTokens } from '../tokens';

/**
 * Renders district name labels onto the districts canvas (z-index 7).
 *
 * @remarks
 * The `.cslmap` format only exports a single position per district — no polygon
 * boundaries are available. Each district is rendered as a text label anchored at
 * `district.position` in world-space, using a stroke+fill technique for readability
 * over complex map backgrounds (terrain, buildings, roads).
 *
 * **CRITICAL INVARIANT:** Requires DM Mono to be loaded via FontFace API in the
 * OffscreenCanvas Worker BEFORE any render call. If not loaded, the label falls back
 * to the system monospace font — visually incorrect but not a crash.
 *
 * @param ctx - Canvas 2D rendering context (main or offscreen).
 * @param districts - Districts to render.
 * @param bounds - World-space bounds from CityData.
 * @param tokens - Renderer design tokens.
 * @param canvasWidth - Canvas width in pixels.
 * @param canvasHeight - Canvas height in pixels.
 */
export function renderDistrictsLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  districts: District[],
  bounds: CityData['bounds'],
  tokens: RendererTokens,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (districts.length === 0) return;

  if (
    !Number.isFinite(canvasWidth) ||
    canvasWidth <= 0 ||
    !Number.isFinite(canvasHeight) ||
    canvasHeight <= 0
  )
    return;

  const rangeX = bounds.maxX - bounds.minX;
  const rangeZ = bounds.maxZ - bounds.minZ;

  if (
    !Number.isFinite(rangeX) ||
    rangeX <= 0 ||
    !Number.isFinite(rangeZ) ||
    rangeZ <= 0
  )
    return;

  function worldToCanvas(pos: { x: number; z: number }): [number, number] {
    return [
      ((pos.x - bounds.minX) / rangeX) * canvasWidth,
      canvasHeight - ((pos.z - bounds.minZ) / rangeZ) * canvasHeight,
    ];
  }

  // Scale font proportionally to the physical canvas size so labels stay legible
  // at any devicePixelRatio (e.g. 2× Retina). Clamp to a minimum of 14px.
  const fontSize = Math.max(14, Math.round(canvasWidth / 100));
  ctx.font = `small-caps ${fontSize}px "DM Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const district of districts) {
    if (!district.name) continue;

    const [cx, cy] = worldToCanvas({
      x: district.position.x,
      z: district.position.z,
    });
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

    // Stroke pass — dark outline for readability over complex backgrounds
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 4;
    ctx.strokeText(district.name, cx, cy);

    // Fill pass
    ctx.fillStyle = tokens.districtLabel;
    ctx.fillText(district.name, cx, cy);
  }
}
