import type { Building, CityData } from '@vellum/core';
import type { RendererTokens } from '../tokens';

// Defensa en profundidad: el parser ya debería filtrar estos ItemClass,
// pero el renderer rechaza los que lleguen de todos modos. No asumir que el
// parser ya filtró.
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

export function renderBuildingsLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  buildings: Building[],
  bounds: CityData['bounds'],
  tokens: RendererTokens,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (buildings.length === 0) return;

  const rangeX = bounds.maxX - bounds.minX;
  const rangeZ = bounds.maxZ - bounds.minZ;

  if (
    rangeX <= 0 ||
    !Number.isFinite(rangeX) ||
    rangeZ <= 0 ||
    !Number.isFinite(rangeZ)
  )
    return;

  function worldToCanvas(pos: { x: number; z: number }): [number, number] {
    return [
      ((pos.x - bounds.minX) / rangeX) * canvasWidth,
      canvasHeight - ((pos.z - bounds.minZ) / rangeZ) * canvasHeight,
    ];
  }

  ctx.fillStyle = tokens.buildingFill;

  for (const building of buildings) {
    if (BUILDING_EXCLUDED_ITEM_CLASSES.has(building.itemClass)) continue;
    // Un polígono con menos de 3 vértices no es renderizable — skip silencioso.
    if (building.footprint.length < 3) continue;

    const points = building.footprint.map(worldToCanvas);

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
  }
}
