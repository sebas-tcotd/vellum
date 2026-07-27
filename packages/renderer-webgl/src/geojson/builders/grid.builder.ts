import type { CityData } from '@vellum/core';
import { CS1_WORLD_HALF, csToGeoArray } from '../../coordinate-transform';
import type { Feature, FeatureCollection, LineStringGeometry } from '../types';

const TILE_SIZE = (CS1_WORLD_HALF * 2) / 9;

type GridFeature = Feature<LineStringGeometry, Record<string, never>>;

export function buildGridGeoJson(
  _cityData: CityData,
): FeatureCollection<GridFeature> {
  const half = CS1_WORLD_HALF;
  const features: GridFeature[] = [];

  for (let i = 1; i < 9; i++) {
    const z = -half + i * TILE_SIZE;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          csToGeoArray({ x: -half, z }),
          csToGeoArray({ x: half, z }),
        ],
      },
      properties: {} as Record<string, never>,
    });
  }

  for (let i = 1; i < 9; i++) {
    const x = -half + i * TILE_SIZE;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          csToGeoArray({ x, z: -half }),
          csToGeoArray({ x, z: half }),
        ],
      },
      properties: {} as Record<string, never>,
    });
  }

  return { type: 'FeatureCollection', features };
}
