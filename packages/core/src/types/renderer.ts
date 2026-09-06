import type { CityData } from './city-data';
import type { ExportPreviewSnapshot } from './export-presentation';
import type {
  ExportRequest,
  ExportSnapshot,
  SvgExportRequest,
  SvgExportSnapshot,
} from './export-pipeline';
import type { LayerName, LayerOptions, LayerVisibility } from './layer';
import type {
  ServiceIconLegendState,
  TooltipInfo,
  ViewportBounds,
} from './renderer.types';
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
 *
 * @remarks
 * Following Clean Architecture principles, `@vellum/core` only declares this contract.
 *
 * **Admissible adapters.** `MapLibreRenderer` (`@vellum/renderer-webgl`) is the
 * only production adapter. `@vellum/renderer-canvas` was retired by ADR-0001 and
 * must not be reinstated; a replacement adapter is admissible only if it
 * satisfies {@link MapRendererPort} structurally without leaking its rendering
 * technology into `@vellum/core` or `@vellum/ui`.
 *
 * **Who assembles it.** `apps/desktop` is the single composition root: it is the
 * only place allowed to construct a concrete adapter, and it hands the UI a
 * {@link MapRendererFactory}. The React UI layer (`@vellum/ui`) depends on the
 * ports declared here and never imports the adapter — a rule enforced by the
 * `no-restricted-imports` scope for `packages/ui/src/**` in `eslint.config.mjs`.
 *
 * **Export stays out.** This interface keeps its five interactive methods.
 * Export concerns live in segregated ports ({@link MapCapturePort} here,
 * `RasterExportPort` / `ExportSink` / `SvgExportPort` in the export pipeline),
 * per AD-1 of the export architecture spine.
 *
 * @see {@link MapRendererPort} for the full surface the map host consumes.
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

/**
 * Camera control the interactive map exposes to the shell.
 *
 * @remarks
 * Segregated per concern (ISP) so a consumer that only frames the map — the
 * keyboard shortcuts, the native menu — never sees the layer or capture
 * surface. The camera itself stays owned by the adapter (AD-5): callers
 * request movements, they never write map state directly.
 */
export interface MapCameraPort {
  /** Frames the whole city inside the visible area, honouring the current padding. */
  fitToScreen(): void;
  /** Zooms one step in. */
  zoomIn(): void;
  /** Zooms one step out. */
  zoomOut(): void;
  /**
   * Rotates the map by a relative amount.
   * @param deltaDegrees - Signed rotation to add to the current bearing, in degrees.
   */
  rotateBy(deltaDegrees: number): void;
  /** Returns the bearing to north (0°). */
  resetBearing(): void;
  /** Switches between the free and bounded navigation modes. */
  toggleNavigationMode(): void;
  /**
   * Pans the map to a geographic coordinate without animation.
   * @param lng - Longitude.
   * @param lat - Latitude.
   */
  navigateTo(lng: number, lat: number): void;
  /** Current map bearing in degrees (0 = north up). */
  getBearing(): number;
  /** Current viewport bounds, or `null` while the map is not ready. */
  getInitialViewportBounds(): ViewportBounds | null;
  /**
   * Declares how much of the canvas the shell chrome covers, so framing avoids it.
   * @param padding - Per-edge inset in CSS pixels; omitted edges keep their value.
   */
  setViewportPadding(
    padding: Partial<{
      top: number;
      right: number;
      bottom: number;
      left: number;
    }>,
  ): void;
}

/**
 * Layer composition the sidebar and the layer commands drive.
 *
 * @remarks
 * Everything here is a declarative statement of what should be visible; none
 * of it re-processes `CityData`, so a toggle stays inside the 500 ms budget.
 */
export interface MapLayersPort {
  /** Tears down every source and layer, leaving the map ready for a new city. */
  clear(): void;
  /**
   * Shows or hides a logical map layer.
   * @param layer - The logical layer name (e.g. `'roads'`).
   * @param visible - `true` to show, `false` to hide.
   */
  setLayerVisibility(layer: LayerName, visible: boolean): void;
  /** Applies the transit-mode and buildings filters plus the buildings color expression. */
  setLayerOptions(options: LayerOptions): void;
  /** Dims every non-transit layer to a fraction of its baseline opacity, or restores it. */
  setTransitDimming(enabled: boolean): void;
  /** Shows or hides the Vellum watermark logo. */
  setWatermarkVisibility(visible: boolean): void;
}

/**
 * Read-only observation of the live map, for the overlays that orient the user.
 *
 * @remarks
 * Every method returns its own unsubscribe function; the caller owns the
 * lifetime. Overlays observe — they never render, configure or dispose.
 */
export interface MapSubscriptionsPort {
  /**
   * Observes the geographic viewport, for the minimap's frame.
   * @param callback - Called with the current bounds on every camera change.
   * @returns Cleanup function that unregisters the listener.
   */
  subscribeViewport(callback: (bounds: ViewportBounds) => void): () => void;
  /**
   * Observes the feature under the cursor, for the map tooltip.
   * @param callback - Called with the hovered feature, or `null` when the cursor leaves it.
   * @returns Cleanup function that unregisters the listener.
   */
  subscribeHover(callback: (info: TooltipInfo | null) => void): () => void;
  /**
   * Observes which service-icon groups are relevant to the current viewport.
   * @param callback - Called with the current legend state on every pan/zoom.
   * @returns Cleanup function that unregisters the listener.
   */
  subscribeServiceIconLegend(
    callback: (state: ServiceIconLegendState) => void,
  ): () => void;
}

/**
 * Immutable captures taken from the live map, consumed by the export pipeline.
 *
 * @remarks
 * Deliberately **not** part of {@link IRenderer}: AD-1 of the export spine
 * keeps the interactive rendering contract free of export concerns, and only
 * `apps/desktop` assembles the exporters that consume these snapshots. The
 * snapshot itself is pure data — capturing one neither mutates the map nor
 * depends on the export destination.
 */
export interface MapCapturePort {
  /** Captures a low-resolution preview of the current viewport, or `null` if the surface is unusable. */
  capturePreview(): Promise<ExportPreviewSnapshot | null>;
  /**
   * Captures an immutable raster export snapshot.
   * @param request - The requested area, density and presentation options.
   * @returns The snapshot, or `null` if the map cannot currently produce one.
   */
  createExportSnapshot(request: ExportRequest): ExportSnapshot | null;
  /**
   * Captures the vector counterpart of {@link MapCapturePort.createExportSnapshot}.
   * @param request - The requested area and presentation options.
   * @returns The snapshot, or `null` if the map cannot currently produce one.
   */
  createSvgExportSnapshot(request: SvgExportRequest): SvgExportSnapshot | null;
}

/**
 * The whole of what the interactive map host (`MapLibreRoot`) consumes.
 *
 * @remarks
 * A composition of the segregated ports above rather than a flat mirror of the
 * adapter's ~20 public methods — future consumers depend on the slice they
 * actually use. `MapLibreRenderer` satisfies this structurally and does not
 * declare `implements`: the adapter's public API is its own, and the port is
 * what the domain asks of it (ADR-0001).
 */
export interface MapRendererPort
  extends
    IRenderer,
    MapCameraPort,
    MapLayersPort,
    MapSubscriptionsPort,
    MapCapturePort {}

/**
 * Creates a renderer bound to a DOM container.
 *
 * @remarks
 * The only thing `@vellum/ui` ever receives about rendering technology.
 * `apps/desktop` — the single composition root — is what closes over the
 * concrete adapter and injects this (ADR-0001).
 *
 * @param container - The already-mounted `<div>` the map attaches to. Typed as
 *   a div, not a generic element, because that is what the map host owns and
 *   what every admissible adapter takes.
 * @param style - The style the renderer starts with, before themes resolve.
 * @returns A live renderer; the caller owns it and must `dispose()` it.
 */
export type MapRendererFactory = (
  container: HTMLDivElement,
  style: RenderStyleParams,
) => MapRendererPort;
