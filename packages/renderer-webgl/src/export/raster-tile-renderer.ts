import type {
  ExportSnapshot,
  RenderStyleParams,
  TilePlanTile,
} from '@vellum/core';
import { MapLibreRenderer } from '../map-libre-renderer';

/** Fixed physical pixel ratio every tiled capture requires — matches `TilePlan.pixelRatio`. */
const TILE_PIXEL_RATIO = 1;
const TILE_MAX_ZOOM = 24;

/**
 * Captures one raster tile at a time from a single reusable, hidden MapLibre surface.
 *
 * @remarks
 * Owns exactly one temporary `MapLibreRenderer` (`preserveDrawingBuffer: true`,
 * `releasesDemProtocol: false`) for the lifetime of one tiled export operation —
 * {@link configure} loads the snapshot once, then {@link captureTile} is called once per
 * plan tile, sequentially. The interactive renderer, its camera, layers, canvas, and
 * container are never touched, and the underlying MapLibre `Map` is never exposed outside
 * this adapter.
 */
export class RasterTileRenderer {
  private readonly container: HTMLDivElement;
  private readonly renderer: MapLibreRenderer;
  private configured = false;
  private disposed = false;

  /**
   * Creates the hidden container and temporary renderer. No city is loaded yet.
   * @param style - Theme applied to the temporary surface; must match the snapshot passed to {@link configure}.
   */
  constructor(style: RenderStyleParams) {
    this.container = document.createElement('div');
    this.container.style.cssText =
      'position:fixed;left:-100000px;top:0;width:1px;height:1px;';
    document.body.append(this.container);
    this.renderer = new MapLibreRenderer(
      this.container,
      style,
      true,
      false,
      TILE_PIXEL_RATIO,
      TILE_MAX_ZOOM,
    );
  }

  /**
   * Loads the snapshot's city once and applies its layers, dimming, watermark, and background.
   *
   * @remarks
   * Safe to call only once per instance — a tiled operation serves tiles from a single
   * immutable snapshot, so a second call is a no-op. Also removes the soft-boundary
   * snap-back and fit-derived zoom/pan clamps, which would otherwise silently reproject
   * a tile's exact camera.
   */
  async configure(
    snapshot: ExportSnapshot,
    signal: AbortSignal,
  ): Promise<void> {
    if (this.configured) return;
    throwIfAborted(signal);
    await this.renderer.render(snapshot.cityData, {
      activeLayers: snapshot.activeLayers,
    });
    throwIfAborted(signal);
    this.renderer.disableNavigationConstraints();
    this.renderer.setTransitDimming(snapshot.transitDimming);
    this.renderer.setLayerOptions(snapshot.layerOptions);
    this.renderer.setWatermarkVisibility(snapshot.watermarkVisible);
    this.renderer.applyExportBackground(snapshot.request.background);
    this.configured = true;
  }

  /**
   * Captures exactly one tile: resizes the hidden surface to `renderRect`, jumps to the
   * tile's exact camera, waits for readiness, and encodes the frame as PNG bytes.
   *
   * @remarks
   * Bearing and pitch are rejected before anything is assigned or rendered. The plan
   * always produces `0` for both, but this is checked explicitly rather than trusted,
   * since the interactive map's camera must never be reachable from a tile plan.
   * @returns Full `renderRect` PNG bytes, uncropped — overscan trimming is 6.2F/Rust's job.
   */
  async captureTile(
    tile: TilePlanTile,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    if (!this.configured) {
      throw new Error('RasterTileRenderer captured a tile before configure()');
    }
    assertSupportedCamera(tile.camera);
    throwIfAborted(signal);
    this.container.style.width = `${tile.renderRect.width}px`;
    this.container.style.height = `${tile.renderRect.height}px`;
    this.renderer.syncCanvasSize();
    this.renderer.setCamera(tile.camera);
    throwIfAborted(signal);
    await this.renderer.waitForIdle();
    throwIfAborted(signal);
    const encodedPng = await this.renderer.captureCanvasBytes();
    throwIfAborted(signal);
    return encodedPng;
  }

  /** Disposes the temporary renderer and removes the hidden container. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.dispose();
    this.container.remove();
  }
}

function assertSupportedCamera(camera: TilePlanTile['camera']): void {
  if (camera.bearing !== 0 || camera.pitch !== 0) {
    const error = new Error(
      'Tiled raster capture only supports bearing 0 and pitch 0',
    );
    error.name = 'UnsupportedCameraError';
    throw error;
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error('Export aborted');
  error.name = 'AbortError';
  throw error;
}
