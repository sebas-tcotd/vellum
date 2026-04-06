// Stubs — full implementation will be completed in Story 5.x (theme-engine)

/**
 * Describes the structural definition of a `.vellumstyle` file.
 * @remarks
 * Currently a stub. The complete style field schema will be defined in Story 5.x.
 */
export interface VellumStyle {
  /** Schema version for backward compatibility and validation.
   * Guaranteed to be present starting from v1. */
  schemaVersion: number;
  /** The human-readable display name of the theme. */
  name: string;
}

/**
 * Defines the visual appearance of a stroked path or line using the `fixed + scaled` sizing model.
 * * @remarks
 * **CRITICAL INVARIANT:** Never precalculate or flatten the width into a single value.
 * The rendering engine must dynamically compute the final width on every frame using the formula:
 * `totalWidth = fixedWidth + (scaledWidth * zoomFactor)`
 */
export interface LineStyle {
  /** Hexadecimal color string (e.g., '#FFFFFF'). */
  colorHex: string;
  /** The baseline width in canvas pixels that remains constant regardless of the camera's zoom level.
   * Ensures the line remains visible even when fully zoomed out. */
  fixedWidth: number;
  /** The proportional width component that scales linearly with the camera's zoom factor. */
  scaledWidth: number;
  /** Alpha transparency level, ranging from 0.0 (fully transparent) to 1.0 (fully opaque). */
  opacity: number;
}

/** A mapping dictionary that associates specific `WayType` string keys to their visual representation. */
export interface RoadStyleParams {
  [wayType: string]: LineStyle;
}

/**
 * The comprehensive styling configuration produced by the `@vellum/theme-engine`.
 * @remarks
 * Passed directly to the rendering engine to dictate visual output independently of the immutable `CityData`.
 * Additional style groupings (transit, buildings, etc.) will be added in Story 5.x.
 */
export interface RenderStyleParams {
  /** Style mappings specifically for the road network. */
  roads: RoadStyleParams;
}
