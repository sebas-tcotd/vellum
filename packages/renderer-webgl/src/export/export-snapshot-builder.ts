import {
  createExportSnapshot,
  createSvgExportSnapshot,
  exportScaleForRequest,
  type CityData,
  type ExportArea,
  type ExportCamera,
  type ExportSnapshot,
  type ExportTargetLongEdge,
  type LayerOptions,
  type RenderParams,
  type RenderStyleParams,
  type SvgExportRequest,
  type SvgExportSnapshot,
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
      ? resolveFullMapOutputSurface(
          extent,
          input.request.targetLongEdge,
          baseWidth,
          baseHeight,
        )
      : { width: baseWidth, height: baseHeight };
  const scale = exportScaleForRequest(input.request);

  const camera = getCurrentCamera(input.map);
  const exportCamera =
    input.request.area === 'full-map'
      ? { ...camera, bearing: 0, pitch: 0 }
      : camera;

  return createExportSnapshot({
    cityData: input.cityData,
    style: input.style,
    activeLayers: input.activeLayers,
    layerOptions: input.layerOptions,
    transitDimming: input.transitDimming,
    watermarkVisible: input.watermarkVisible,
    camera: exportCamera,
    extent,
    surface: { width: surface.width * scale, height: surface.height * scale },
    request: input.request,
  });
}

/** Builds an SVG export snapshot from the same live map state. */
export function buildSvgExportSnapshot(
  input: Omit<ExportSnapshotBuildInput, 'request'> & {
    request: SvgExportRequest;
  },
): SvgExportSnapshot | null {
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

  // Vector output has no raster density to apply — `targetLongEdge` (or the
  // canvas, for a viewport export) *is* the final document size.
  const surface =
    input.request.area === 'full-map'
      ? resolveFullMapOutputSurface(
          extent,
          input.request.targetLongEdge,
          baseWidth,
          baseHeight,
        )
      : { width: baseWidth, height: baseHeight };

  return createSvgExportSnapshot({
    cityData: input.cityData,
    style: input.style,
    activeLayers: input.activeLayers,
    layerOptions: input.layerOptions,
    transitDimming: input.transitDimming,
    watermarkVisible: input.watermarkVisible,
    // Captured verbatim, never neutralized: an unsupported camera has to reach
    // `evaluateSvgCapability` so the user is told, rather than being flattened
    // into a top-down view they did not ask for (AC 9).
    camera: getCurrentCamera(input.map),
    extent,
    surface,
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

/**
 * Resolves full-map output pixel dimensions from a world extent.
 *
 * @remarks
 * The single point of resolution math for full-map exports — the export
 * dialog's preview must call this same function rather than re-deriving the
 * aspect-ratio rounding itself, or the two can silently drift apart.
 */
export function resolveFullMapOutputSurface(
  extent: ExportSnapshot['extent'],
  targetLongEdge: ExportTargetLongEdge | undefined,
  canvasWidth = 0,
  canvasHeight = 0,
): { width: number; height: number } {
  const extentAspect =
    (extent.maxX - extent.minX) / (extent.maxZ - extent.minZ);
  const side = targetLongEdge ?? Math.max(canvasWidth, canvasHeight);
  return extentAspect >= 1
    ? { width: side, height: Math.max(1, Math.round(side / extentAspect)) }
    : { width: Math.max(1, Math.round(side * extentAspect)), height: side };
}
