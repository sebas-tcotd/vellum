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
import { csToGeo } from '../coordinate-transform';
import { zoomForWorldUnitsPerPixel } from './output-density';

const MAX_USEFUL_SIDE = 2048;
const MIN_USEFUL_SIDE = 256;
const MAX_TILE_RGBA_BYTES = 32 * 1024 * 1024;

/** Builds a pure, capability-bounded tile plan without allocating a surface. */
export function planTiles(
  snapshot: ExportSnapshot,
  capability: CapabilityReport,
  signal?: AbortSignal,
): TilePlan | TilePlanRejection {
  throwIfAborted(signal);
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
  const side = chooseUsefulSide(width, height, limits, signal);
  if (!side) return reject('dimensions');
  const renderExtent = fitAspect(snapshot.extent, width / height);
  const worldUnitsPerPixel = (renderExtent.maxX - renderExtent.minX) / width;
  const zoom = zoomForWorldUnitsPerPixel(worldUnitsPerPixel);
  const tiles = makeTiles(
    width,
    height,
    side,
    renderExtent,
    worldUnitsPerPixel,
    zoom,
    signal,
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
  signal?: AbortSignal,
): number | undefined {
  const minimum = Math.min(MIN_USEFUL_SIDE, width, height);
  for (
    let side = MAX_USEFUL_SIDE;
    side >= minimum;
    side = Math.floor(side / 2)
  ) {
    throwIfAborted(signal);
    if (gridFits(width, height, side, limits, signal)) return side;
  }
  return undefined;
}

function gridFits(
  width: number,
  height: number,
  side: number,
  limits: readonly [number, number],
  signal?: AbortSignal,
): boolean {
  for (let y = 0; y < height; y += side)
    for (let x = 0; x < width; x += side) {
      throwIfAborted(signal);
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
  signal?: AbortSignal,
): readonly TilePlanTile[] {
  const tiles: TilePlanTile[] = [];
  for (let y = 0, tileY = 0; y < height; y += side, tileY += 1)
    for (let x = 0, tileX = 0; x < width; x += side, tileX += 1) {
      throwIfAborted(signal);
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
    // MapLibre renders increasing latitude at the top. With CS1_LAT_SIGN = 1,
    // increasing Z maps to increasing latitude, so output Y must descend from
    // maxZ to keep adjacent raster rows continuous.
    minZ: extent.maxZ - (rect.y + rect.height) * units,
    maxZ: extent.maxZ - rect.y * units,
  };
}
function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
function reject(reason: TilePlanRejection['reason']): TilePlanRejection {
  return { rejected: true, reason };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Export aborted');
  error.name = 'AbortError';
  throw error;
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
