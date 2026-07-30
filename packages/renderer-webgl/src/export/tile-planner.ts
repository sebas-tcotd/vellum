import {
  MAX_TILED_LOGICAL_PIXELS,
  type CapabilityReport,
  type ExportExtent,
  type ExportSnapshot,
  type PixelRect,
  type TilePlan,
  type TilePlanRejection,
  type TilePlanTile,
} from '@vellum/core';
import {
  CS1_EXTENT_DEG,
  CS1_WORLD_HALF,
  CS1_WORLD_SIZE,
  csToGeo,
} from '../coordinate-transform';

const MAX_USEFUL_SIDE = 2048;
const MIN_USEFUL_SIDE = 256;
const MAX_TILE_RGBA_BYTES = 32 * 1024 * 1024;
const MAPLIBRE_TILE_SIZE_PX = 512;

/** Builds a pure, capability-bounded tile plan without allocating a surface. */
export function planTiles(
  snapshot: ExportSnapshot,
  capability: CapabilityReport,
): TilePlan | TilePlanRejection {
  const { width, height } = snapshot.surface;
  if (
    !isPositiveInteger(width) ||
    !isPositiveInteger(height) ||
    width * height > MAX_TILED_LOGICAL_PIXELS
  )
    return reject('dimensions');
  if (snapshot.camera.bearing !== 0 || snapshot.camera.pitch !== 0)
    return reject('dimensions');
  const limits = limitsFrom(capability);
  if (!limits) return reject('gpu');
  const side = chooseUsefulSide(width, height, limits);
  if (!side) return reject('dimensions');
  const renderExtent = fitAspect(
    snapshot.request.area === 'full-map' ? worldExtent() : snapshot.extent,
    width / height,
  );
  const worldUnitsPerPixel = (renderExtent.maxX - renderExtent.minX) / width;
  const zoom = zoomFor(worldUnitsPerPixel);
  const tiles = makeTiles(
    width,
    height,
    side,
    renderExtent,
    worldUnitsPerPixel,
    zoom,
  );
  return {
    tiles,
    expectedTiles: tiles.length,
    pixelRatio: 1,
    renderExtent,
    worldUnitsPerPixel,
    zoom,
  };
}

function chooseUsefulSide(
  width: number,
  height: number,
  limits: readonly [number, number],
): number | undefined {
  const minimum = Math.min(MIN_USEFUL_SIDE, width, height);
  for (
    let side = MAX_USEFUL_SIDE;
    side >= minimum;
    side = Math.floor(side / 2)
  ) {
    if (gridFits(width, height, side, limits)) return side;
  }
  return undefined;
}

function gridFits(
  width: number,
  height: number,
  side: number,
  limits: readonly [number, number],
): boolean {
  for (let y = 0; y < height; y += side)
    for (let x = 0; x < width; x += side) {
      const useful = {
        x,
        y,
        width: Math.min(side, width - x),
        height: Math.min(side, height - y),
      };
      const render = expand(useful, width, height, side);
      if (
        render.width > limits[0] ||
        render.height > limits[1] ||
        render.width * render.height * 4 > MAX_TILE_RGBA_BYTES
      )
        return false;
    }
  return true;
}

function makeTiles(
  width: number,
  height: number,
  side: number,
  extent: ExportExtent,
  units: number,
  zoom: number,
): readonly TilePlanTile[] {
  const tiles: TilePlanTile[] = [];
  for (let y = 0, tileY = 0; y < height; y += side, tileY += 1)
    for (let x = 0, tileX = 0; x < width; x += side, tileX += 1) {
      const usefulRect = {
        x,
        y,
        width: Math.min(side, width - x),
        height: Math.min(side, height - y),
      };
      const renderRect = expand(usefulRect, width, height, side);
      const tileExtent = extentFor(renderRect, extent, units);
      const center = csToGeo({
        x: (tileExtent.minX + tileExtent.maxX) / 2,
        z: (tileExtent.minZ + tileExtent.maxZ) / 2,
      });
      tiles.push({
        sequence: tiles.length,
        tileX,
        tileY,
        usefulRect,
        renderRect,
        extent: tileExtent,
        camera: {
          longitude: center.lng,
          latitude: center.lat,
          zoom,
          bearing: 0,
          pitch: 0,
        },
      });
    }
  return tiles;
}

function expand(
  rect: PixelRect,
  width: number,
  height: number,
  side: number,
): PixelRect {
  const overscan = Math.min(256, Math.max(64, Math.ceil(side * 0.125)));
  const x = Math.max(0, rect.x - overscan);
  const y = Math.max(0, rect.y - overscan);
  return {
    x,
    y,
    width: Math.min(width, rect.x + rect.width + overscan) - x,
    height: Math.min(height, rect.y + rect.height + overscan) - y,
  };
}

function fitAspect(extent: ExportExtent, aspect: number): ExportExtent {
  const width = extent.maxX - extent.minX;
  const height = extent.maxZ - extent.minZ;
  if (width / height < aspect) {
    const half = (height * aspect) / 2;
    const center = (extent.minX + extent.maxX) / 2;
    return { ...extent, minX: center - half, maxX: center + half };
  }
  if (width / height > aspect) {
    const half = width / aspect / 2;
    const center = (extent.minZ + extent.maxZ) / 2;
    return { ...extent, minZ: center - half, maxZ: center + half };
  }
  return extent;
}

function extentFor(
  rect: PixelRect,
  extent: ExportExtent,
  units: number,
): ExportExtent {
  return {
    minX: extent.minX + rect.x * units,
    maxX: extent.minX + (rect.x + rect.width) * units,
    minZ: extent.minZ + rect.y * units,
    maxZ: extent.minZ + (rect.y + rect.height) * units,
  };
}
function zoomFor(units: number): number {
  return Math.log2(
    360 / (MAPLIBRE_TILE_SIZE_PX * (CS1_EXTENT_DEG / CS1_WORLD_SIZE) * units),
  );
}
function worldExtent(): ExportExtent {
  return {
    minX: -CS1_WORLD_HALF,
    maxX: CS1_WORLD_HALF,
    minZ: -CS1_WORLD_HALF,
    maxZ: CS1_WORLD_HALF,
  };
}
function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
function reject(reason: TilePlanRejection['reason']): TilePlanRejection {
  return { rejected: true, reason };
}
function limitsFrom(
  report: CapabilityReport,
): readonly [number, number] | undefined {
  if (
    report.maxTextureSize === 'unknown' ||
    report.maxRenderbufferSize === 'unknown' ||
    report.maxCanvasSize === 'unknown' ||
    report.maxViewportDims === 'unknown'
  )
    return undefined;
  const values = [
    report.maxTextureSize,
    report.maxRenderbufferSize,
    report.maxCanvasSize,
    ...report.maxViewportDims,
  ];
  return values.every((value) => Number.isFinite(value) && value > 0)
    ? [Math.min(...values), Math.min(...values)]
    : undefined;
}
