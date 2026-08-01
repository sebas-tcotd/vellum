import type {
  CityData,
  ExportPreviewAnnotation,
  ExportPreviewScale,
  ExportPreviewSnapshot,
} from '@vellum/core';
import maplibregl from 'maplibre-gl';
import { csToGeo, geoToCs } from '../coordinate-transform';

const SCALE_SAMPLE_PIXELS = 100;
const SCALE_TARGET_PIXELS = 80;

/** Builds a preview snapshot from the current MapLibre surface and city data. */
export function buildPreviewSnapshot(
  map: maplibregl.Map,
  cityData: CityData | null,
  bearingDegrees: number,
): ExportPreviewSnapshot | null {
  const canvas = map.getCanvas();
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  if (!cityData || width <= 0 || height <= 0) return null;
  const scale = buildPreviewScale(map, width, height);
  if (!scale) return null;
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width,
    height,
    bearingDegrees,
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

function niceScaleDistance(distance: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(distance));
  const normalized = distance / magnitude;
  const multiplier = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return multiplier * magnitude;
}
