import maplibregl from 'maplibre-gl';
import type { CityData } from '@vellum/core';
import { getCityBoundsGeoJSON } from '../helpers';
import type { ViewportBounds } from '../types/renderer.types';

/**
 * Handles camera movements, bounds constraints, and viewport snap-back logic.
 *
 * @remarks
 * Strict mode: hard pan/zoom bounds. Soft mode: allows overpanning with
 * snap-back and underzooming down to 25% of fit-to-screen zoom.
 */
export class MapNavigationManager {
  private navigationMode: 'strict' | 'soft' = 'soft';
  private fitToScreenZoom = 0;
  private isSnappingBack = false;
  private currentCityData: CityData | null = null;
  private onMoveEndBound: () => void;

  /**
   * @remarks
   * Registers the `moveend` listener for soft-boundary snap-back once, for
   * the lifetime of the manager — it is a no-op via internal guards until a
   * city is loaded, so registering here (rather than per-render) avoids
   * stacking duplicate listeners across repeated `render()` calls.
   */
  constructor(private readonly map: maplibregl.Map) {
    this.onMoveEndBound = this.handleMoveEnd.bind(this);
    this.map.on('moveend', this.onMoveEndBound);
  }

  /** Fits the viewport to the city bounds, then derives and applies navigation constraints. */
  fitAndConstrain(cityData: CityData): void {
    this.currentCityData = cityData;
    this.fitToCityBounds(cityData);
    this.fitToScreenZoom = this.map.getZoom();
    this.applyConstraints(cityData);
  }

  /** Fits the MapLibre viewport to the city's geographic bounding box. */
  fitToCityBounds(cityData: CityData): void {
    this.map.fitBounds(getCityBoundsGeoJSON(cityData), {
      padding: 20,
      animate: false,
    });
  }

  /**
   * Applies pan and zoom constraints derived from the city's geographic bounds.
   *
   * @remarks
   * Must be called **after** {@link fitToCityBounds} so that `minZoom` reflects
   * the zoom level required to fit the entire city in the viewport.
   *
   * In strict mode: sets `maxBounds` to city bounds (hard pan limit) with a
   * small inset so the city never touches the viewport edge.
   * In soft mode: removes `maxBounds` (allows overpanning) and sets `minZoom`
   * to 25% of the fit-to-screen zoom.
   */
  applyConstraints(cityData: CityData): void {
    if (this.navigationMode === 'strict') {
      this.map.setMaxBounds(this.getPaddedStrictBounds(cityData));
      this.map.setMinZoom(Math.max(this.fitToScreenZoom * 0.25, 0));
    } else {
      this.map.setMaxBounds(undefined);
      this.map.setMinZoom(Math.max(this.fitToScreenZoom * 0.25, 0));
    }
  }

  private readonly BOUNDS_PADDING_PX = 20;

  private getPaddedStrictBounds(
    cityData: CityData,
  ): maplibregl.LngLatBoundsLike {
    try {
      const [[swLng, swLat], [neLng, neLat]] = getCityBoundsGeoJSON(cityData);

      const sw = this.map.project([swLng, swLat]);
      const ne = this.map.project([neLng, neLat]);

      const halfWidth = (ne.x - sw.x) / 2;
      const halfHeight = (sw.y - ne.y) / 2;
      const pad = Math.min(this.BOUNDS_PADDING_PX, halfWidth, halfHeight);

      const insetSW = this.map.unproject([sw.x + pad, sw.y - pad]);
      const insetNE = this.map.unproject([ne.x - pad, ne.y + pad]);

      return [
        [insetSW.lng, insetSW.lat],
        [insetNE.lng, insetNE.lat],
      ];
    } catch {
      return getCityBoundsGeoJSON(cityData);
    }
  }

  /** Recalculates the fit-to-screen zoom from the current camera position. */
  recalculateFitZoom(): void {
    this.fitToScreenZoom = this.map.getZoom();
  }

  /** Toggles between strict and soft navigation boundary modes. */
  toggleMode(): void {
    this.navigationMode = this.navigationMode === 'strict' ? 'soft' : 'strict';
  }

  /** Zooms the map in by one step. */
  zoomIn(): void {
    this.map.zoomIn();
  }

  /** Zooms the map out by one step. */
  zoomOut(): void {
    this.map.zoomOut();
  }

  /**
   * Pans the map to the given geographic coordinate without animation.
   *
   * @param lng - Longitude.
   * @param lat - Latitude.
   */
  navigateTo(lng: number, lat: number): void {
    this.map.flyTo({ center: [lng, lat], animate: false });
  }

  /** Returns the current viewport bounds, or `null` if the map is not ready. */
  getInitialBounds(): ViewportBounds | null {
    try {
      const b = this.map.getBounds();
      return {
        westLng: b.getWest(),
        eastLng: b.getEast(),
        northLat: b.getNorth(),
        southLat: b.getSouth(),
      };
    } catch {
      return null;
    }
  }

  /** Unregisters the `moveend` listener. */
  dispose(): void {
    this.map.off('moveend', this.onMoveEndBound);
  }

  /**
   * In soft mode, when the user releases the pan and the map center is outside
   * the city bounds, the map snaps back to fit the city at the current zoom.
   */
  private handleMoveEnd(): void {
    if (
      this.navigationMode !== 'soft' ||
      !this.currentCityData ||
      this.isSnappingBack
    )
      return;

    const center = this.map.getCenter();
    const [[swLng, swLat], [neLng, neLat]] = getCityBoundsGeoJSON(
      this.currentCityData,
    );

    const isOutside =
      center.lng < swLng ||
      center.lng > neLng ||
      center.lat < swLat ||
      center.lat > neLat;

    if (isOutside) {
      this.isSnappingBack = true;
      this.map.fitBounds(
        [
          [swLng, swLat],
          [neLng, neLat],
        ],
        { padding: 20, animate: true, duration: 300 },
      );
      this.map.once('moveend', () => {
        this.isSnappingBack = false;
      });
    }
  }
}
