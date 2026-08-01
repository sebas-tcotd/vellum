/**
 * Construction options for a MapLibre renderer surface.
 *
 * Interactive renderers use the defaults. Export surfaces opt into pixel
 * readback and can override the navigation limits without positional flags.
 */
export interface MapLibreRendererOptions {
  /** Enables WebGL pixel readback for disposable export surfaces. */
  preserveDrawingBuffer?: boolean;
  /** Whether disposal may unregister the shared DEM protocol. */
  releasesDemProtocol?: boolean;
  /** Pins the canvas backing-store ratio for deterministic raster captures. */
  pixelRatio?: number;
  /** Maximum MapLibre zoom allowed by this surface. */
  maxZoom?: number;
}
