import type { CityData } from './city-data';
import type { LayerVisibility } from './layer';
import type { RenderStyleParams } from './theme';

/**
 * Rendering parameters supplied to the renderer engine for each frame.
 * @remarks
 * This configuration controls what aspects of the `CityData` are visually processed.
 * Visual styling (colors) is supplied separately via `IRenderer.applyTheme()`.
 */
export interface RenderParams {
  /** Determines which logical map layers are actively processed and drawn onto the canvas. */
  activeLayers: LayerVisibility;
}

/**
 * Outbound port definition for the rendering engine.
 * @remarks
 * Following Clean Architecture principles, `@vellum/core` only declares this contract.
 * The concrete implementation resides in `@vellum/renderer-webgl` (`MapLibreRenderer`).
 * The React UI layer (`@vellum/ui`) must strictly depend on this interface and never
 * directly instantiate the concrete adapter.
 */
export interface IRenderer {
  /**
   * Renders the complete city model based on the provided configuration.
   * @remarks
   * This should operate as a pure function in terms of visual output: given the exact
   * same `cityData` and `params`, the resulting canvas state must be identical.
   *
   * @param cityData - The immutable domain model of the city to render.
   * @param params - The dynamic configuration dictating layer visibility and styling.
   */
  render(cityData: CityData, params: RenderParams): Promise<void>;

  /**
   * Updates the camera viewport transform without triggering a full geometry re-render.
   *
   * @param zoom - The scaling factor applied to the canvas projection.
   * @param panX - The horizontal translation offset.
   * @param panY - The vertical translation offset.
   */
  updateViewport(zoom: number, panX: number, panY: number): void;

  /**
   * Notifies the rendering engine that the underlying canvas dimensions have changed,
   * requiring an update to the internal projection matrix or coordinate mapping.
   *
   * @param width - The new logical width of the canvas in pixels.
   * @param height - The new logical height of the canvas in pixels.
   */
  resize(width: number, height: number): void;

  /**
   * Applies a new set of visual style colors to the already-rendered city, without
   * re-processing `CityData` or reconstructing the renderer.
   * @remarks
   * Must complete in under one frame (~16ms at 60fps) since it runs on theme switch,
   * a user-facing interaction that must feel instantaneous.
   *
   * @param style - The complete color configuration to apply.
   */
  applyTheme(style: RenderStyleParams): Promise<void>;

  /**
   * Releases all internal resources, offscreen buffers, or contexts held by the renderer.
   * @remarks
   * Must be explicitly invoked during the cleanup phase of the wrapping React component
   * (e.g., inside a `useEffect` cleanup function) to prevent memory leaks.
   */
  dispose(): void;
}
