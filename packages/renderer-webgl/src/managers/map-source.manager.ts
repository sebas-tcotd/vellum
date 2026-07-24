import maplibregl from 'maplibre-gl';
import type { CityData } from '@vellum/core';
import type { ResolvedColors } from '../style-adapter';
import {
  addBaseLayer,
  addBuildingsLayer,
  addDistrictsLayer,
  addForestsLayer,
  addGridPattern,
  addRoadsLayer,
  addServiceIconsLayer,
  addTerrainLayers,
  addTransitLayers,
} from '../layers';
import { LAYER_ID_MAP } from '../constants/layer.constants';

/**
 * Handles the injection and disposal of GeoJSON sources and their initial layers.
 */
export class MapSourceManager {
  constructor(
    private readonly map: maplibregl.Map,
    private colors: ResolvedColors,
  ) {}

  updateColors(newColors: ResolvedColors): void {
    this.colors = newColors;
  }

  /** Adds every base source and its initial layers (grid, terrain, roads, transit, etc.) for a freshly loaded city. */
  async initializeSourcesAndLayers(cityData: CityData): Promise<void> {
    await addGridPattern(this.map);
    addBaseLayer(this.map, cityData, this.colors);
    addTerrainLayers(this.map, cityData, this.colors);
    addForestsLayer(this.map, cityData, this.colors);
    addBuildingsLayer(this.map, cityData, this.colors);
    await addServiceIconsLayer(this.map);
    addRoadsLayer(this.map, cityData, this.colors);
    addTransitLayers(this.map, cityData);
    addDistrictsLayer(this.map, cityData, this.colors);
  }

  /**
   * Clears all city-specific data from the map, leaving only the base background.
   *
   * @remarks
   * Called when loading starts so the old map is not visible during the transition
   * to a new city. Removes all city-specific layers and sources, and resets the
   * grid pattern to a solid background color.
   */
  clearAll(): void {
    const allLayerIds = new Set(Object.values(LAYER_ID_MAP).flat());

    for (const id of allLayerIds) {
      if (this.map.getLayer(id)) {
        this.map.removeLayer(id);
      }
    }

    const sourceIds = [
      'base',
      'terrain',
      'coastline-source',
      'terrain-lines-source',
      'forests',
      'buildings',
      'roads',
      'transit',
      'transit-connectors',
      'transit-stops',
      'transit-stops-dots',
      'districts',
    ];

    for (const id of sourceIds) {
      if (this.map.getSource(id)) {
        this.map.removeSource(id);
      }
    }

    this.map.setPaintProperty('background', 'background-pattern', null);
  }
}
