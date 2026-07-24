import maplibregl from 'maplibre-gl';
import type { LayerName, LayerOptions } from '@vellum/core';
import {
  LAYER_ID_MAP,
  NON_TRANSIT_OPACITY,
  TRANSIT_DIM_FACTOR,
} from '../constants/layer.constants';
import { buildBuildingColorExpression } from '../expressions/building-color';
import { buildRoadColorExpression } from '../expressions/road-color';
import type { ResolvedColors } from '../style-adapter';

/**
 * Manages the visibility, styling, and dynamic filtering of MapLibre layers.
 */
export class MapLayerManager {
  constructor(
    private readonly map: maplibregl.Map,
    private colors: ResolvedColors,
  ) {}

  updateColors(newColors: ResolvedColors): void {
    this.colors = newColors;
  }

  /**
   * Shows or hides a logical map layer.
   *
   * @param layer - The logical layer name (e.g. `'roads'`).
   * @param visible - `true` to show, `false` to hide.
   */
  setVisibility(layer: LayerName, visible: boolean): void {
    const ids = LAYER_ID_MAP[layer];
    for (const id of ids) {
      if (!this.map.getLayer(id)) continue;
      this.map.setLayoutProperty(
        id,
        'visibility',
        visible ? 'visible' : 'none',
      );
    }
  }

  /**
   * Dims every non-transit layer (`terrain`, `water`, `roads`, `buildings`,
   * `forests`, `districts`) to `TRANSIT_DIM_FACTOR` of its baseline opacity, or
   * restores normal opacity — used when the Transit theme is active/inactive.
   *
   * @remarks
   * Orthogonal to {@link setVisibility}: this only touches paint-property
   * opacity, never `visibility`. A hidden layer stays hidden regardless of its
   * dimmed opacity, and re-showing it restores the dimmed (not full) opacity
   * for free, since the paint property was never reset while hidden.
   */
  setTransitDimming(enabled: boolean): void {
    for (const [id, { prop, base }] of Object.entries(NON_TRANSIT_OPACITY)) {
      const value = enabled
        ? (['*', base, TRANSIT_DIM_FACTOR] as unknown)
        : base;
      this.setPaintIfExists(id, prop, value);
    }
  }

  /**
   * Updates the `transit` and `buildings` layer filters to only show features
   * whose `mode`/`category` is in the given visible set, and re-applies the
   * buildings color expression for the RICO "color by category" toggle — the
   * "advanced layer options" panel.
   *
   * @remarks
   * A multi-modal transit stop's marker carries only its first-serving line's
   * `mode` (`TransitStopFeatureProperties` in `geojson/index.ts`), so hiding
   * that mode hides the whole marker even if the stop also serves a
   * still-visible mode. Known limitation, not fixed here.
   */
  setOptions(options: LayerOptions): void {
    const transitFilter = [
      'in',
      ['get', 'mode'],
      ['literal', options.transit.visibleModes],
    ] as unknown as maplibregl.FilterSpecification;
    for (const id of LAYER_ID_MAP.transit) {
      this.setFilterIfExists(id, transitFilter);
    }

    const buildingsFilter = [
      'in',
      ['get', 'category'],
      ['literal', options.buildings.visibleCategories],
    ] as unknown as maplibregl.FilterSpecification;
    for (const id of LAYER_ID_MAP.buildings) {
      this.setFilterIfExists(id, buildingsFilter);
    }

    const { colorByCategory } = options.buildings;
    this.setPaintIfExists(
      'buildings-fill',
      'fill-color',
      buildBuildingColorExpression(this.colors, 'fill', colorByCategory),
    );
    this.setPaintIfExists(
      'buildings-outline',
      'line-color',
      buildBuildingColorExpression(this.colors, 'stroke', colorByCategory),
    );
  }

  /**
   * Applies a new set of theme colors to every currently-registered layer via
   * `map.setPaintProperty()` — no source re-processing, no renderer teardown.
   *
   * @remarks
   * Safe to call before a city is loaded (layers that don't exist yet are
   * skipped) and safe to call repeatedly. Road colors are re-derived as
   * data-driven `match` expressions since road color varies by tier.
   *
   * @param options - The currently active layer options, so the buildings
   * color expression is re-derived with the right `colorByCategory` state
   * instead of reverting to a default.
   */
  async applyTheme(options: LayerOptions): Promise<void> {
    const c = this.colors;

    this.setPaintIfExists('background', 'background-color', c.background);
    this.setPaintIfExists('base-water', 'fill-color', c.water);
    this.setPaintIfExists('base-land', 'fill-color', c.land);
    this.setPaintIfExists('coastline-layer', 'line-color', c.coastlineStroke);
    this.setPaintIfExists('forests-circles', 'circle-color', c.forests);

    const { colorByCategory } = options.buildings;
    this.setPaintIfExists(
      'buildings-fill',
      'fill-color',
      buildBuildingColorExpression(c, 'fill', colorByCategory),
    );
    this.setPaintIfExists(
      'buildings-outline',
      'line-color',
      buildBuildingColorExpression(c, 'stroke', colorByCategory),
    );

    this.setPaintIfExists('districts-points', 'circle-color', c.districtFill);
    this.setPaintIfExists(
      'districts-points',
      'circle-stroke-color',
      c.districtLabel,
    );

    const fillExpr = buildRoadColorExpression(c, 'fill');
    const casingExpr = buildRoadColorExpression(c, 'casing');
    this.setPaintIfExists('roads-fill', 'line-color', fillExpr);
    this.setPaintIfExists('roads-tunnel-bridge-fill', 'line-color', fillExpr);
    this.setPaintIfExists('roads-casing', 'line-color', casingExpr);
    this.setPaintIfExists(
      'roads-tunnel-bridge-casing',
      'line-color',
      casingExpr,
    );
    this.setPaintIfExists('roads-railway-casing', 'line-color', casingExpr);
    this.setPaintIfExists('roads-ferry', 'line-color', c.ferry);
  }

  /** Sets a paint property only if the layer currently exists (a theme may be applied before a city is loaded). */
  private setPaintIfExists(
    layerId: string,
    prop: string,
    value: unknown,
  ): void {
    if (!this.map.getLayer(layerId)) return;
    this.map.setPaintProperty(layerId, prop as never, value as never);
  }

  /** Sets a layer's `filter` only if the layer currently exists (a theme/options update may run before a city is loaded). */
  private setFilterIfExists(
    layerId: string,
    filter: maplibregl.FilterSpecification,
  ): void {
    if (!this.map.getLayer(layerId)) return;
    this.map.setFilter(layerId, filter);
  }
}
