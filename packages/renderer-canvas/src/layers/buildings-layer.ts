import type { Building, CityData } from '@vellum/core';
import type { RendererTokens } from '../tokens';

/**
 * ItemClass values excluded from the buildings layer — decorative and utility
 * assets with no cartographic value.
 *
 * Defense-in-depth: the parser should already filter these, but the renderer
 * rejects any that reach it regardless (never assume the parser filtered).
 * Exported so tests can assert coverage of every excluded class.
 */
export const BUILDING_EXCLUDED_ITEM_CLASSES = new Set([
  'Beautification Item',
  'Airplane Path',
  'Ship Path',
  'Water Facility',
  'Earthquake Sensor',
  'Firewatch',
  'Radio',
  'Tsunami Buoy',
]);

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

/**
 * Renders building footprints as filled polygons onto the buildings canvas
 * (z-index 5). Buildings whose `itemClass` is in {@link BUILDING_EXCLUDED_ITEM_CLASSES}
 * are skipped; every other class — including unknown classes from mods — renders.
 *
 * Hardened against malformed data: non-finite or non-positive canvas dimensions,
 * degenerate bounds, missing footprints, footprints with fewer than 3 vertices,
 * and footprints with non-finite vertices are all skipped silently rather than
 * throwing or producing a corrupt path.
 *
 * The stroke fades out at low zoom values to prevent outlines from visually
 * dominating small building footprints (figure-ground competition). Full opacity
 * is reached at zoom ≥ 0.4; the stroke vanishes at zoom ≤ 0.15.
 */
export function renderBuildingsLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  buildings: Building[],
  bounds: CityData['bounds'],
  tokens: RendererTokens,
  canvasWidth: number,
  canvasHeight: number,
  zoom = 1,
): void {
  if (buildings.length === 0) return;

  // Canvas degenerado o no-finito → la proyección sería inválida, no renderizar.
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

  // Stroke alpha fades between zoom 0.15 (invisible) and 0.4 (full opacity).
  const strokeAlpha = Math.min(1, Math.max(0, (zoom - 0.15) / (0.4 - 0.15)));
  const rgb = hexToRgb(tokens.buildingStroke);
  const strokeStyle = rgb
    ? `rgba(${rgb.r},${rgb.g},${rgb.b},${strokeAlpha.toFixed(3)})`
    : tokens.buildingStroke;

  ctx.fillStyle = tokens.buildingFill;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1;

  for (const building of buildings) {
    if (BUILDING_EXCLUDED_ITEM_CLASSES.has(building.itemClass)) continue;
    // Footprint ausente o con menos de 3 vértices no es un polígono renderizable.
    if (!building.footprint || building.footprint.length < 3) continue;

    const points = building.footprint.map(worldToCanvas);
    // Un vértice no-finito (NaN/Infinity) produce un path corrupto — descartar.
    if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y)))
      continue;

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    if (strokeAlpha > 0) ctx.stroke();
  }
}
