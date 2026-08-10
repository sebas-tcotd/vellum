import maplibregl from 'maplibre-gl';
import type { CityData } from '@vellum/core';
import type { ResolvedColors } from '../style-adapter';
import {
  addBasemapLandLayer,
  addBasemapWaterLayers,
  addBuildingsLayer,
  addDistrictsLayer,
  addForestsLayer,
  addGridLayer,
  addMapFrameLayer,
  addParksLayer,
  addRoadsLayer,
  addServiceIconsLayer,
  addTerrainContourLayer,
  addTerrainReliefLayers,
  addTransitLayers,
  addWatermarkLayer,
} from '../layers';
import {
  FRAME_LAYER_IDS,
  LAYER_ID_MAP,
  WATERMARK_LAYER_ID,
} from '../constants/layer.constants';
import { registerDemProtocol } from '../sources/dem-protocol';

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

  /**
   * Adds every base source and its initial layers (grid, terrain, roads, transit, etc.)
   * for a freshly loaded city.
   *
   * @remarks
   * Every step is fault-isolated. Insertion order is the z-order, so an unguarded throw
   * used to drop every *later* layer as well — and, because the caller awaits this method
   * before fitting the camera, it also left the viewport at MapLibre's default world view.
   * A broken layer now costs only itself.
   *
   * @returns The names of the steps that failed, in execution order. Empty on a clean render.
   */
  async initializeSourcesAndLayers(cityData: CityData): Promise<string[]> {
    const failed: string[] = [];
    const step = async (
      name: string,
      run: () => void | Promise<void>,
    ): Promise<void> => {
      try {
        await run();
      } catch (err) {
        failed.push(name);
        console.error(`[MapSourceManager] layer step "${name}" failed:`, err);
      }
    };

    // Must precede addTerrainReliefLayers: the raster-dem source starts requesting tiles
    // the moment it is registered, and the protocol has to be able to answer them.
    await step('dem-protocol', () => registerDemProtocol(cityData.terrainDem));
    // The relief must sit between the two basemap passes: over the flat land fill,
    // under the water surface that masks the sea.
    await step('basemap-land', () =>
      addBasemapLandLayer(this.map, cityData, this.colors),
    );
    await step('terrain-relief', () =>
      addTerrainReliefLayers(this.map, cityData, this.colors),
    );
    await step('basemap-water', () =>
      addBasemapWaterLayers(this.map, cityData, this.colors),
    );
    await step('terrain-contour', () =>
      addTerrainContourLayer(this.map, cityData, this.colors),
    );
    await step('forests', () =>
      addForestsLayer(this.map, cityData, this.colors),
    );
    await step('buildings', () =>
      addBuildingsLayer(this.map, cityData, this.colors),
    );
    await step('service-icons', () => addServiceIconsLayer(this.map));
    await step('roads', () => addRoadsLayer(this.map, cityData, this.colors));
    await step('transit', () => addTransitLayers(this.map, cityData));
    // Sits above every other data layer but below districts/park-areas, per product request.
    await step('grid', () =>
      addGridLayer(this.map, cityData, this.colors.grid),
    );
    await step('districts', () =>
      addDistrictsLayer(this.map, cityData, this.colors),
    );
    await step('parks', () => addParksLayer(this.map, cityData, this.colors));
    await step('map-frame', () => addMapFrameLayer(this.map, this.colors));
    addWatermarkLayer(this.map).catch(() => {
      /* Image loading may fail in non-browser environments (tests) */
    });

    return failed;
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
    const allLayerIds = new Set([
      ...Object.values(LAYER_ID_MAP).flat(),
      ...FRAME_LAYER_IDS,
      WATERMARK_LAYER_ID,
    ]);

    for (const id of allLayerIds) {
      if (this.map.getLayer(id)) {
        this.map.removeLayer(id);
      }
    }

    const sourceIds = [
      'base-land-source',
      'base-water-source',
      'grid-source',
      'terrain-dem',
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
      'parks',
      'world-extent-source',
      'vellum-watermark-source',
    ];

    for (const id of sourceIds) {
      if (this.map.getSource(id)) {
        this.map.removeSource(id);
      }
    }
  }
}
