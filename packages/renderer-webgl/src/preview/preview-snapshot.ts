import type {
  CityData,
  ExportPreviewAnnotation,
  ExportPreviewScale,
} from '@vellum/core';
import * as maplibregl from 'maplibre-gl';
import { csToGeo, geoToCs } from '../coordinate-transform';

const SCALE_SAMPLE_PIXELS = 100;
/** Target on-screen length of the graphic scale bar, in preview pixels. */
export const SCALE_TARGET_PIXELS = 80;

/** Everything a preview overlays on its image, projected through the live map. */
export interface PreviewProjection {
  /** Projection-derived graphic scale. */
  scale: ExportPreviewScale;
  /** District and park labels, as percentages of the frame. */
  annotations: ExportPreviewAnnotation[];
}

/**
 * Projects the overlay geometry of a viewport preview through the live map.
 *
 * @remarks
 * Reused by the export-path preview for `area: 'viewport'`, whose camera *is*
 * the live camera: MapLibre's own projection handles a rotated or tilted view,
 * which linear extent arithmetic cannot. Read-only — nothing here moves the map.
 *
 * @param map - The live interactive map.
 * @param cityData - City model whose districts and parks are labelled.
 * @returns The projected overlay, or `null` when the surface is unusable.
 */
export function buildPreviewProjection(
  map: maplibregl.Map,
  cityData: CityData | null,
): PreviewProjection | null {
  const canvas = map.getCanvas();
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  if (!cityData || width <= 0 || height <= 0) return null;
  const scale = buildPreviewScale(map, width, height);
  if (!scale) return null;
  return {
    scale,
    annotations: buildPreviewAnnotations(map, cityData, width, height),
  };
}

function buildPreviewScale(
  map: maplibregl.Map,
  width: number,
  height: number,
): ExportPreviewScale | null {
  const centerX = width / 2;
  const centerY = height / 2;
  const start = geoToCs(map.unproject([centerX, centerY]));
  const end = geoToCs(map.unproject([centerX + SCALE_SAMPLE_PIXELS, centerY]));
  const metresPerPixel =
    Math.hypot(end.x - start.x, end.z - start.z) / SCALE_SAMPLE_PIXELS;
  if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) return null;
  const distanceMeters = niceScaleDistance(
    metresPerPixel * SCALE_TARGET_PIXELS,
  );
  return {
    distanceMeters,
    widthPercent: (distanceMeters / metresPerPixel / width) * 100,
  };
}

function buildPreviewAnnotations(
  map: maplibregl.Map,
  cityData: CityData,
  width: number,
  height: number,
): ExportPreviewAnnotation[] {
  const annotations = [
    ...cityData.districts.map((district) => ({
      id: district.id,
      name: district.name,
      kind: 'district' as const,
      position: district.position,
    })),
    ...cityData.parkAreas.map((park) => ({
      id: park.id,
      name: park.name,
      kind: 'park' as const,
      position: park.position,
    })),
  ];
  return annotations.flatMap(({ id, name, kind, position }) => {
    const point = map.project(csToGeo(position));
    const xPercent = (point.x / width) * 100;
    const yPercent = (point.y / height) * 100;
    if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) {
      return [];
    }
    return [{ id, name, kind, xPercent, yPercent }];
  });
}

/**
 * Rounds a raw distance to a human-readable 1/2/5 × 10^n scale-bar length.
 *
 * @param distance - Raw world distance the bar would cover.
 * @returns The rounded distance in CS1 metres.
 */
export function niceScaleDistance(distance: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(distance));
  const normalized = distance / magnitude;
  const multiplier = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return multiplier * magnitude;
}
