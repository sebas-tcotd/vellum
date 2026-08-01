import {
  createExportSnapshot,
  exportScaleForFormat,
  type CityData,
  type ExportArea,
  type ExportCamera,
  type ExportSnapshot,
  type LayerOptions,
  type RenderParams,
  type RenderStyleParams,
} from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import { geoToCs } from '../coordinate-transform';

/** State required to capture an immutable export snapshot from a live map. */
export interface ExportSnapshotBuildInput {
  /** Live MapLibre map whose viewport and CSS surface are captured. */
  map: maplibregl.Map;
  /** Immutable city model currently rendered by the map. */
  cityData: CityData;
  /** Current renderer theme. */
  style: RenderStyleParams;
  /** Visibility state of the logical layers. */
  activeLayers: RenderParams['activeLayers'];
  /** Active layer filtering and coloring options. */
  layerOptions: LayerOptions;
  /** Whether non-transit layers are dimmed. */
  transitDimming: boolean;
  /** Whether the watermark is included in the export. */
  watermarkVisible: boolean;
  /** Requested export settings. */
  request: Parameters<typeof createExportSnapshot>[0]['request'];
}

/** Builds an export snapshot using CSS pixels and the requested world extent. */
export function buildExportSnapshot(
  input: ExportSnapshotBuildInput,
): ExportSnapshot | null {
  const canvas = input.map.getCanvas();
  const baseWidth = canvas.clientWidth;
  const baseHeight = canvas.clientHeight;
  if (!isUsableSurface(baseWidth, baseHeight)) return null;

  const extent = resolveExportExtent(
    input.map,
    input.cityData,
    input.request.area,
  );
  if (!extent) return null;

  const surface =
    input.request.area === 'full-map'
      ? surfaceForExtent(extent, baseWidth, baseHeight)
      : { width: baseWidth, height: baseHeight };
  const scale = exportScaleForFormat(input.request.format);

  return createExportSnapshot({
    cityData: input.cityData,
    style: input.style,
    activeLayers: input.activeLayers,
    layerOptions: input.layerOptions,
    transitDimming: input.transitDimming,
    watermarkVisible: input.watermarkVisible,
    camera: getCurrentCamera(input.map),
    extent,
    surface: { width: surface.width * scale, height: surface.height * scale },
    request: input.request,
  });
}

/** Reads the current MapLibre camera into the core export representation. */
export function getCurrentCamera(map: maplibregl.Map): ExportCamera {
  const center = map.getCenter();
  return {
    longitude: center.lng,
    latitude: center.lat,
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

function isUsableSurface(width: number, height: number): boolean {
  return (
    Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
  );
}

function resolveExportExtent(
  map: maplibregl.Map,
  cityData: CityData,
  area: ExportArea,
): ExportSnapshot['extent'] | null {
  if (area === 'full-map') {
    const { minX, maxX, minZ, maxZ } = cityData.bounds;
    return { minX, maxX, minZ, maxZ };
  }
  try {
    const viewport = map.getBounds();
    const west = geoToCs({ lng: viewport.getWest(), lat: viewport.getNorth() });
    const east = geoToCs({ lng: viewport.getEast(), lat: viewport.getSouth() });
    return {
      minX: Math.min(west.x, east.x),
      maxX: Math.max(west.x, east.x),
      minZ: Math.min(west.z, east.z),
      maxZ: Math.max(west.z, east.z),
    };
  } catch {
    return null;
  }
}

function surfaceForExtent(
  extent: ExportSnapshot['extent'],
  canvasWidth: number,
  canvasHeight: number,
): { width: number; height: number } {
  const extentAspect =
    (extent.maxX - extent.minX) / (extent.maxZ - extent.minZ);
  const side = Math.max(canvasWidth, canvasHeight);
  return extentAspect >= 1
    ? { width: side, height: Math.max(1, Math.round(side / extentAspect)) }
    : { width: Math.max(1, Math.round(side * extentAspect)), height: side };
}
