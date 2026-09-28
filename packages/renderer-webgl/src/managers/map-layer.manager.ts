import * as maplibregl from 'maplibre-gl';
import type { LayerName, LayerOptions, TerrainDem } from '@vellum/core';
import {
  CONTOUR_LINE_OPACITY,
  HILLSHADE_EXAGGERATION,
  LAYER_ID_MAP,
  NON_TRANSIT_OPACITY,
  TRANSIT_DIM_FACTOR,
  WATERMARK_LAYER_ID,
} from '../constants/layer.constants';
import { buildBuildingColorExpression } from '../expressions/building-color';
import {
  buildRoadColorExpression,
  BRIDGE_CASING_DARKEN_PERCENT,
} from '../expressions/road-color';
import { buildParkColorExpression } from '../expressions/park-color';
import {
  buildColorReliefRamp,
  buildContourColorRamp,
} from '../expressions/terrain-relief';
import type { ResolvedColors } from '../style-adapter';
import { retintForests } from '../layers/layer-forests';
import {
  districtFillColor,
  selectedDistrictFilter,
} from '../layers/layer-area-boundaries';
import { resolveAirshipColor } from '../expressions/transit-color';

/**
 * Manages the visibility, styling, and dynamic filtering of MapLibre layers.
 */
export class MapLayerManager {
  /** Whether the `districts` layer is currently toggled on via `setVisibility`. */
  private districtsVisible = false;
  /** Current `LayerOptions.districts.showAsMarker` — mirrors `DEFAULT_LAYER_OPTIONS`. */
  private districtsShowAsMarker = false;
  /** Current `LayerOptions.districts.showFill` — mirrors its default. */
  private districtsShowFill = false;
  private districtsColorBySpecialization = false;
  /** Current `LayerOptions.districts.showParkAreas` — mirrors its default. */
  private districtsShowParkAreas = false;
  /** District whose area carries the selection tint, or `null`. */
  private selectedDistrictId: string | null = null;
  /** Whether the `roads` layer is toggled on; street names follow it. */
  private roadsVisible = true;
  /** Current `LayerOptions.roads.showStreetNames` — mirrors its default. */
  private roadsShowStreetNames = true;

  /**
   * Mirrors the last `setTransitDimming` call, so `setOptions` (fired whenever
   * any layer option changes, e.g. toggling the hypsometric relief itself)
   * can keep `terrain-color-relief` dimmed instead of resetting it back to
   * full opacity.
   */
  private transitDimmingEnabled = false;

  /**
   * Elevation domain of the loaded city, needed to rebuild the hypsometric ramp on a
   * theme switch. `null` until a city is rendered.
   */
  private terrainDem: TerrainDem | null = null;

  constructor(
    private readonly map: maplibregl.Map,
    private colors: ResolvedColors,
  ) {}

  updateColors(newColors: ResolvedColors): void {
    this.colors = newColors;
  }

  /** Records the elevation domain of the city currently on screen. */
  setTerrainDem(dem: TerrainDem | null): void {
    this.terrainDem = dem;
  }

  /**
   * Shows or hides a logical map layer.
   *
   * @param layer - The logical layer name (e.g. `'roads'`).
   * @param visible - `true` to show, `false` to hide.
   */
  setVisibility(layer: LayerName, visible: boolean): void {
    if (layer === 'districts') {
      this.districtsVisible = visible;
      this.applyDistrictsVisibility();
      return;
    }

    const ids = LAYER_ID_MAP[layer];
    for (const id of ids) {
      if (!this.map.getLayer(id)) continue;
      this.map.setLayoutProperty(
        id,
        'visibility',
        visible ? 'visible' : 'none',
      );
    }

    if (layer === 'roads') {
      this.roadsVisible = visible;
      this.applyStreetNamesVisibility();
    }
  }

  /** Street names show only while both the roads layer and the option are on. */
  private applyStreetNamesVisibility(): void {
    this.setLayoutIfExists(
      'roads-labels',
      'visibility',
      this.roadsVisible && this.roadsShowStreetNames ? 'visible' : 'none',
    );
  }

  /**
   * Tints one district area as the current selection, or clears the tint.
   *
   * @remarks
   * Visible regardless of `showFill`, but only while the districts layer is
   * on — hiding the layer hides the place it marks.
   *
   * @param id - District id to tint, or `null` to clear it.
   */
  setSelectedDistrict(id: string | null): void {
    this.selectedDistrictId = id;
    this.applySelectedDistrict();
  }

  private applySelectedDistrict(): void {
    const visibility =
      this.districtsVisible && this.selectedDistrictId !== null
        ? 'visible'
        : 'none';
    for (const id of ['district-selected', 'district-selected-outline']) {
      this.setFilterIfExists(
        id,
        selectedDistrictFilter(this.selectedDistrictId),
      );
      this.setLayoutIfExists(id, 'visibility', visibility);
    }
  }

  /**
   * Reconciles districts display mode and the independent park-area sublayer.
   */
  private applyDistrictsVisibility(): void {
    this.applySelectedDistrict();
    this.setLayoutIfExists(
      'district-fill',
      'visibility',
      this.districtsVisible &&
        (this.districtsShowFill || this.districtsColorBySpecialization)
        ? 'visible'
        : 'none',
    );
    // Outlines are independent of the point/label display mode.
    this.setLayoutIfExists(
      'district-boundaries',
      'visibility',
      this.districtsVisible ? 'visible' : 'none',
    );
    const showPoints = this.districtsVisible && this.districtsShowAsMarker;
    const showLabels = this.districtsVisible && !this.districtsShowAsMarker;
    this.setLayoutIfExists(
      'districts-points',
      'visibility',
      showPoints ? 'visible' : 'none',
    );
    this.setLayoutIfExists(
      'districts-labels',
      'visibility',
      showLabels ? 'visible' : 'none',
    );
    const showParkAreas = this.districtsVisible && this.districtsShowParkAreas;
    this.setLayoutIfExists(
      'park-areas-points',
      'visibility',
      showParkAreas ? 'visible' : 'none',
    );
    this.setLayoutIfExists(
      'park-areas-labels',
      'visibility',
      showParkAreas ? 'visible' : 'none',
    );
    this.setLayoutIfExists(
      'park-boundaries',
      'visibility',
      showParkAreas ? 'visible' : 'none',
    );
  }

  /**
   * Dims every non-transit layer (`terrain`, `basemap`, `roads`, `buildings`,
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
    this.transitDimmingEnabled = enabled;
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
    this.setLayoutIfExists(
      'transit-transfer-marker',
      'visibility',
      options.transit.showConfirmedTransfers ? 'visible' : 'none',
    );

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

    const { terrain } = options;
    this.applyContourColor(terrain.showColorRelief);
    this.setPaintIfExists(
      'terrain-lines-layer',
      'line-opacity',
      this.contourLineOpacity(terrain.showContourLines),
    );
    this.setPaintIfExists(
      'terrain-color-relief',
      'color-relief-opacity',
      this.terrainColorReliefOpacity(terrain.showColorRelief),
    );
    this.setPaintIfExists(
      'terrain-hillshade',
      'hillshade-exaggeration',
      terrain.showHillshade ? HILLSHADE_EXAGGERATION : 0,
    );

    const { basemap } = options;
    this.setPaintIfExists(
      'grid-layer',
      'line-opacity',
      basemap.showGrid ? this.colors.grid.opacity : 0,
    );

    this.roadsShowStreetNames = options.roads.showStreetNames;
    this.applyStreetNamesVisibility();

    this.districtsShowAsMarker = options.districts.showAsMarker;
    this.districtsShowFill = options.districts.showFill;
    this.districtsColorBySpecialization =
      options.districts.colorBySpecialization;
    this.setPaintIfExists(
      'district-fill',
      'fill-color',
      districtFillColor(this.colors, this.districtsColorBySpecialization),
    );
    this.districtsShowParkAreas = options.districts.showParkAreas;
    this.applyDistrictsVisibility();
  }

  /**
   * Shows or hides the Vellum watermark logo.
   *
   * @param visible - `true` to show, `false` to hide.
   */
  setWatermarkVisibility(visible: boolean): void {
    this.setLayoutIfExists(
      WATERMARK_LAYER_ID,
      'visibility',
      visible ? 'visible' : 'none',
    );
  }

  /**
   * The hypsometric relief's `color-relief-opacity`, honoring both the
   * terrain switch and the current transit-dimming state.
   *
   * @remarks
   * Shared by `setOptions` and `applyTheme` — both re-assert this paint
   * property on every call (guarding the user's `showColorRelief` switch
   * against whatever else each method just changed), and either one
   * hardcoding `1` instead of consulting `transitDimmingEnabled` would silently
   * undo `setTransitDimming`'s fade the next time it ran.
   */
  private contourLineOpacity(showContourLines: boolean): number {
    if (!showContourLines) return 0;
    return this.transitDimmingEnabled
      ? CONTOUR_LINE_OPACITY * TRANSIT_DIM_FACTOR
      : CONTOUR_LINE_OPACITY;
  }

  private terrainColorReliefOpacity(showColorRelief: boolean): number {
    if (!showColorRelief) return 0;
    return this.transitDimmingEnabled ? TRANSIT_DIM_FACTOR : 1;
  }

  /**
   * Colours the contour lines, hypsometrically or flat.
   *
   * @remarks
   * With the relief switched off the user asked for a plain contour map, so
   * tinting the isolines by altitude would be applying an option they turned
   * off. The DEM is also required for the ramp's domain — without it there is
   * no altitude scale to colour against, and the flat theme colour is the only
   * honest answer.
   *
   * @param useRelief - Whether the hypsometric relief is currently enabled.
   */
  private applyContourColor(useRelief: boolean): void {
    const dem = this.terrainDem;
    this.setPaintIfExists(
      'terrain-lines-layer',
      'line-color',
      useRelief && dem
        ? buildContourColorRamp(this.colors.terrain, dem)
        : this.colors.contourLine,
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

    // The hypsometric ramp is the whole reason the elevation gradient moved off the
    // baked PNG: retinting the terrain is now one paint property, not a re-parse.
    if (this.terrainDem) {
      this.setPaintIfExists(
        'terrain-color-relief',
        'color-relief-color',
        buildColorReliefRamp(c.terrain, this.terrainDem),
      );
    }
    this.applyContourColor(options.terrain.showColorRelief);
    retintForests(this.map, c.forests);

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

    this.setPaintIfExists('district-boundaries', 'line-color', c.districtLabel);
    this.setPaintIfExists(
      'district-fill',
      'fill-color',
      districtFillColor(c, options.districts.colorBySpecialization),
    );
    this.setPaintIfExists('district-selected', 'fill-color', c.districtFill);
    this.setPaintIfExists(
      'park-boundaries',
      'line-color',
      buildParkColorExpression(c),
    );
    this.setPaintIfExists('districts-points', 'circle-color', c.districtFill);
    this.setPaintIfExists(
      'districts-points',
      'circle-stroke-color',
      c.districtLabel,
    );
    this.setPaintIfExists('districts-labels', 'text-color', c.districtLabel);
    this.setPaintIfExists('districts-labels', 'text-halo-color', c.background);
    this.setPaintIfExists(
      'park-areas-points',
      'circle-color',
      buildParkColorExpression(c),
    );
    this.setPaintIfExists(
      'park-areas-points',
      'circle-stroke-color',
      c.districtLabel,
    );
    this.setPaintIfExists('park-areas-labels', 'text-color', c.districtLabel);
    this.setPaintIfExists('park-areas-labels', 'text-halo-color', c.background);
    this.setPaintIfExists(
      'transit-transfer-marker',
      'circle-color',
      c.transferMarker.fill,
    );
    this.setPaintIfExists(
      'transit-transfer-marker',
      'circle-stroke-color',
      c.transferMarker.stroke,
    );

    this.setPaintIfExists('map-frame', 'line-color', c.mapFrame);
    this.setPaintIfExists('grid-layer', 'line-color', c.grid.line);
    this.setPaintIfExists('grid-layer', 'line-opacity', c.grid.opacity);
    this.setPaintIfExists('grid-layer', 'line-width', c.grid.width);
    this.setPaintIfExists('grid-layer', 'line-dasharray', c.grid.dasharray);

    const fillExpr = buildRoadColorExpression(c, 'fill');
    const casingExpr = buildRoadColorExpression(c, 'casing');
    this.setPaintIfExists('roads-fill', 'line-color', fillExpr);
    this.setPaintIfExists('roads-tunnel-fill', 'line-color', fillExpr);
    this.setPaintIfExists('roads-bridge-fill', 'line-color', fillExpr);
    this.setPaintIfExists('roads-casing', 'line-color', casingExpr);
    this.setPaintIfExists('roads-tunnel-casing', 'line-color', casingExpr);
    this.setPaintIfExists(
      'roads-bridge-casing',
      'line-color',
      buildRoadColorExpression(c, 'casing', BRIDGE_CASING_DARKEN_PERCENT),
    );
    this.setPaintIfExists(
      'roads-railway-surface-casing',
      'line-color',
      casingExpr,
    );
    this.setPaintIfExists('roads-railway-surface-fill', 'line-color', fillExpr);
    this.setPaintIfExists(
      'roads-railway-elevated-casing',
      'line-color',
      casingExpr,
    );
    this.setPaintIfExists(
      'roads-railway-elevated-fill',
      'line-color',
      fillExpr,
    );
    this.setPaintIfExists(
      'roads-railway-underground-casing',
      'line-color',
      casingExpr,
    );
    this.setPaintIfExists(
      'roads-railway-underground-fill',
      'line-color',
      fillExpr,
    );
    this.setPaintIfExists(
      'roads-labels',
      'text-color',
      buildRoadColorExpression(c, 'label'),
    );
    this.setPaintIfExists('roads-labels', 'text-halo-color', fillExpr);
    this.setPaintIfExists('roads-ferry', 'line-color', c.ferry);
    this.setPaintIfExists(
      'roads-blimp',
      'line-color',
      resolveAirshipColor(c.ferry),
    );
    this.setPaintIfExists('roads-flight', 'line-color', c.districtLabel);
    this.setPaintIfExists(
      'roads-connection',
      'line-color',
      c.roadCasing.pedestrianWay,
    );

    // Re-apply terrain sub-element visibility — setTransitDimming() above resets
    // their opacities/exaggeration to defaults, which would override the user's
    // advanced-options switches (showContourLines, showColorRelief, showHillshade).
    const terrainOpts = options.terrain;
    this.setPaintIfExists(
      'terrain-lines-layer',
      'line-opacity',
      this.contourLineOpacity(terrainOpts.showContourLines),
    );
    this.setPaintIfExists(
      'terrain-color-relief',
      'color-relief-opacity',
      this.terrainColorReliefOpacity(terrainOpts.showColorRelief),
    );
    this.setPaintIfExists(
      'terrain-hillshade',
      'hillshade-exaggeration',
      terrainOpts.showHillshade ? HILLSHADE_EXAGGERATION : 0,
    );

    const basemapOpts = options.basemap;
    this.setPaintIfExists(
      'grid-layer',
      'line-opacity',
      basemapOpts.showGrid ? c.grid.opacity : 0,
    );
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

  /** Sets a layout property only if the layer currently exists (a visibility/options update may run before a city is loaded). */
  private setLayoutIfExists(
    layerId: string,
    prop: string,
    value: unknown,
  ): void {
    if (!this.map.getLayer(layerId)) return;
    this.map.setLayoutProperty(layerId, prop as never, value as never);
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
