/**
 * Preview capture that goes through the real export path.
 *
 * @remarks
 * Every preview the dialog shows — including the first one, the instant it
 * opens — comes from here. A preview read off the live canvas is framed on the
 * current viewport and painted with the theme's own background, so it can
 * describe something the file will not: a different crop, a different
 * background, and a map frame clipped where the export keeps it whole.
 *
 * So this module builds a genuine {@link ExportSnapshot} — same extent math,
 * same frame margin, same camera the file is rendered from — only sized down to
 * preview resolution. `MapLibreRenderer` then renders it on the same disposable
 * surface the exporters use, so the live map's camera, layers and theme are
 * never touched.
 */

import {
  createExportSnapshot,
  resolveFullMapFraming,
  zoomForWorldUnitsPerPixel,
  type CityData,
  type ExportCamera,
  type ExportPreviewAnnotation,
  type ExportPreviewOptions,
  type ExportPreviewScale,
  type ExportPreviewSnapshot,
  type ExportPreviewSurface,
  type ExportRequest,
  type ExportExtent,
  type ExportSnapshot,
  type LayerOptions,
  type RenderParams,
  type RenderStyleParams,
} from '@vellum/core';
import type * as maplibregl from 'maplibre-gl';
import { csToGeo } from '../coordinate-transform';
import {
  getCurrentCamera,
  resolveExportExtent,
} from '../export/export-snapshot-builder';
import { fitExtentToAspect } from '../export/tile-planner';
import {
  niceScaleDistance,
  SCALE_TARGET_PIXELS,
  type PreviewProjection,
} from './preview-snapshot';

/**
 * Long edge of a preview render, in logical pixels.
 *
 * @remarks
 * Large enough to read a city's structure inside the dialog's `aspect-video`
 * frame on a HiDPI display, small enough that a full-map render stays a
 * fraction of a second rather than a visible stall on every radio click.
 */
export const PREVIEW_LONG_EDGE_PX = 720;

/** Presentation is decoration the dialog draws itself; the render carries none. */
const NEUTRAL_PRESENTATION: ExportRequest['presentation'] = {
  showCityName: false,
  showVellumLogo: false,
  showSourceFile: false,
  showGeneratedAt: false,
  showDistrictNames: false,
  showParkNames: false,
  showLayerLegend: false,
  showRoadLegend: false,
  showTransitLegend: false,
  showElevationLegend: false,
  showScaleBar: false,
  showOrientation: false,
  showSummary: false,
};

/** Live state a preview render needs, mirroring the export snapshot's inputs. */
export interface PreviewExportSnapshotInput {
  /** Live MapLibre map, read only — never mutated by a preview capture. */
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
  /** Whether the watermark is included. */
  watermarkVisible: boolean;
  /** Composition the preview must reproduce. */
  options: ExportPreviewOptions;
}

/**
 * Builds a preview-sized export snapshot for the requested composition.
 *
 * @param input - Live renderer state plus the dialog's current options.
 * @returns The snapshot, or `null` when the surface or extent is unusable.
 */
export function buildPreviewExportSnapshot(
  input: PreviewExportSnapshotInput,
): ExportSnapshot | null {
  const canvas = input.map.getCanvas();
  const baseWidth = canvas.clientWidth || canvas.width;
  const baseHeight = canvas.clientHeight || canvas.height;
  if (!isUsable(baseWidth) || !isUsable(baseHeight)) return null;

  const { area, background } = input.options;
  const contentExtent = resolveExportExtent(input.map, input.cityData, area);
  if (!contentExtent) return null;

  const camera = getCurrentCamera(input.map);
  const framing =
    area === 'full-map'
      ? resolveFullMapFraming(
          contentExtent,
          undefined,
          PREVIEW_LONG_EDGE_PX,
          PREVIEW_LONG_EDGE_PX,
        )
      : null;
  const surface = framing?.surface ?? scaleToPreview(baseWidth, baseHeight);
  if (surface.width <= 0 || surface.height <= 0) return null;

  const shared = {
    background,
    fileName: 'preview',
    presentation: NEUTRAL_PRESENTATION,
  } as const;
  return createExportSnapshot({
    cityData: input.cityData,
    style: input.style,
    activeLayers: input.activeLayers,
    layerOptions: input.layerOptions,
    transitDimming: input.transitDimming,
    watermarkVisible: input.watermarkVisible,
    camera: framing
      ? // Framed on the extent the document covers, exactly as the tiled
        // exporter frames the file. Leaving the renderer to fit the city
        // bounds itself would drop the margin the framing just reserved and
        // put the map frame back on the border of the preview.
        cameraForExtent(framing.extent, surface)
      : // A viewport export renders at the canvas's own size. Rendering the
        // preview smaller at the same zoom would crop it, so the zoom drops by
        // the same factor — MapLibre zoom is log2 of scale, so half the surface
        // is exactly one zoom level less for the same ground cover.
        { ...camera, zoom: camera.zoom + Math.log2(surface.width / baseWidth) },
    extent: framing?.extent ?? contentExtent,
    surface,
    request:
      area === 'full-map'
        ? {
            ...shared,
            area: 'full-map',
            format: 'png-1x',
            // Unused by the capture, which is sized by `surface`; carried only
            // because a full-map request is not representable without it.
            targetLongEdge: 6000,
          }
        : { ...shared, area: 'viewport', format: 'png-1x' },
  });
}

/**
 * Derives the graphic scale from a snapshot's own geometry.
 *
 * @remarks
 * Pure arithmetic over extent and surface — no live map. A full-map preview
 * frames an area the interactive camera is not looking at, so projecting
 * through the live map would describe the wrong picture.
 *
 * @param snapshot - The preview snapshot being rendered.
 * @returns The scale bar, or `null` when the density is degenerate.
 */
export function previewScaleFromSnapshot(
  snapshot: ExportSnapshot,
): ExportPreviewScale | null {
  const metresPerPixel =
    (snapshot.extent.maxX - snapshot.extent.minX) / snapshot.surface.width;
  if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) return null;
  const distanceMeters = niceScaleDistance(
    metresPerPixel * SCALE_TARGET_PIXELS,
  );
  return {
    distanceMeters,
    widthPercent:
      (distanceMeters / metresPerPixel / snapshot.surface.width) * 100,
  };
}

/**
 * Projects district and park labels into the snapshot's extent.
 *
 * @remarks
 * Valid because a full-map snapshot is always axis-aligned (bearing and pitch
 * are neutralized above) and its extent maps linearly onto its surface.
 * Y descends from `maxZ`, matching how the tiled renderer lays rows out.
 *
 * @param snapshot - The preview snapshot being rendered.
 * @returns Labels inside the frame, as percentages of the preview.
 */
export function previewAnnotationsFromSnapshot(
  snapshot: ExportSnapshot,
): ExportPreviewAnnotation[] {
  const { minX, maxX, minZ, maxZ } = snapshot.extent;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  if (width <= 0 || depth <= 0) return [];
  const labels = [
    ...snapshot.cityData.districts.map((district) => ({
      id: district.id,
      name: district.name,
      kind: 'district' as const,
      position: district.position,
    })),
    ...snapshot.cityData.parkAreas.map((park) => ({
      id: park.id,
      name: park.name,
      kind: 'park' as const,
      position: park.position,
    })),
  ];
  return labels.flatMap(({ id, name, kind, position }) => {
    const xPercent = ((position.x - minX) / width) * 100;
    const yPercent = ((maxZ - position.z) / depth) * 100;
    if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) {
      return [];
    }
    return [{ id, name, kind, xPercent, yPercent }];
  });
}

/** What the preview still has to report about the map it was taken from. */
export interface PreviewSourceContext {
  /**
   * CSS size of the live canvas — the document a `viewport` export produces.
   *
   * @remarks
   * Carried because the rendered preview is deliberately smaller, so its own
   * dimensions cannot answer "how big will the file be?".
   */
  viewportSurface: ExportPreviewSurface;
  /** Clockwise bearing of the live interactive camera, in degrees. */
  liveBearingDegrees: number;
  /**
   * Overlay geometry projected through the live map.
   *
   * @remarks
   * Supplied for a viewport preview, whose camera is the live camera and may be
   * rotated or tilted — MapLibre's projection handles that, linear extent
   * arithmetic does not. Omitted for a north-up full-map preview, whose overlay
   * comes from the snapshot's own extent.
   */
  projection?: PreviewProjection | null;
}

/**
 * Assembles the preview snapshot the dialog renders.
 *
 * @param snapshot - The export snapshot that produced `pngBytes`.
 * @param pngBytes - Encoded PNG captured on the disposable export surface.
 * @param source - What the live map still has to contribute; see
 * {@link PreviewSourceContext}.
 * @returns The preview, or `null` when the snapshot has no usable density.
 */
export function toPreviewSnapshot(
  snapshot: ExportSnapshot,
  pngBytes: Uint8Array,
  source: PreviewSourceContext,
): ExportPreviewSnapshot | null {
  const scale = source.projection?.scale ?? previewScaleFromSnapshot(snapshot);
  if (!scale) return null;
  return {
    dataUrl: pngBytesToDataUrl(pngBytes),
    width: snapshot.surface.width,
    height: snapshot.surface.height,
    viewportSurface: source.viewportSurface,
    bearingDegrees: snapshot.camera.bearing,
    liveBearingDegrees: source.liveBearingDegrees,
    scale,
    annotations:
      source.projection?.annotations ??
      previewAnnotationsFromSnapshot(snapshot),
  };
}

/** Encodes captured PNG bytes as a data URL the dialog's `<img>` can show. */
export function pngBytesToDataUrl(bytes: Uint8Array): string {
  // Chunked: `String.fromCharCode(...bytes)` blows the argument limit on
  // anything but a thumbnail, and a preview PNG is comfortably past it.
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

/**
 * Derives the north-up camera that renders `extent` onto `surface`.
 *
 * @remarks
 * Mirrors `planTiles`: the extent is first grown to the surface's aspect ratio,
 * because a document pads whichever axis its extent does not fill, and the zoom
 * then follows from the resulting world units per pixel.
 */
function cameraForExtent(
  extent: ExportExtent,
  surface: { width: number; height: number },
): ExportCamera {
  const rendered = fitExtentToAspect(extent, surface.width / surface.height);
  const center = csToGeo({
    x: (rendered.minX + rendered.maxX) / 2,
    z: (rendered.minZ + rendered.maxZ) / 2,
  });
  return {
    longitude: center.lng,
    latitude: center.lat,
    zoom: zoomForWorldUnitsPerPixel(
      (rendered.maxX - rendered.minX) / surface.width,
    ),
    bearing: 0,
    pitch: 0,
  };
}

function scaleToPreview(
  width: number,
  height: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  const ratio = Math.min(1, PREVIEW_LONG_EDGE_PX / longEdge);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function isUsable(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
