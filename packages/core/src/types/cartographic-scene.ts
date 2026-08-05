/**
 * Renderer-neutral cartographic scene — the single hand-off between whatever
 * builds map geometry from `CityData` and whatever serializes it to a vector
 * document.
 *
 * @remarks
 * Deliberately *not* GeoJSON and *not* SVG: coordinates stay in CS1 world
 * units (`x` east-west, `z` north-south) and the projection to output pixels
 * is carried alongside as data, so a consumer never re-derives it. Nothing
 * here references MapLibre, WGS-84, the DOM, or a document format — that is
 * what makes an SVG adapter able to depend on `@vellum/core` alone
 * (ARCHITECTURE-SPINE AD-16).
 *
 * `CityData` is never mutated to produce a scene, and `LandArray`/`WaterArray`
 * remain separate upstream — a scene only ever reads already-derived geometry.
 */

import type { ExportExtent } from './export-pipeline';

/** A point in CS1 world space; `z` grows southward, as in the domain model. */
export interface ScenePoint {
  /** East-west world coordinate. */
  readonly x: number;
  /** North-south world coordinate; positive is south. */
  readonly z: number;
}

/**
 * Deterministic top-down mapping from world coordinates to output pixels.
 *
 * @remarks
 * `pixelX = (x - extent.minX) / (extent.maxX - extent.minX) * width` and
 * `pixelY = (extent.maxZ - z) / (extent.maxZ - minZ) * height`.
 *
 * **Output Y descends from `maxZ`, not up from `minZ`.** With
 * `CS1_LAT_SIGN = 1` the interactive renderer maps increasing Z to increasing
 * latitude, and MapLibre draws increasing latitude at the *top* of the
 * screen — so the highest Z is the topmost output row. Deriving Y the other
 * way produces a document that is a vertical mirror of what the user was
 * looking at. The tiled raster planner resolves its own tile extents the same
 * way, for the same reason.
 *
 * No pitch or bearing is representable, which is exactly why a rotated or
 * tilted camera must be rejected before a scene is ever built.
 */
export interface SceneProjection {
  /** World extent covered by the output surface. */
  readonly extent: ExportExtent;
  /** Output width in pixels. */
  readonly width: number;
  /** Output height in pixels. */
  readonly height: number;
}

/** An open or closed polyline in world coordinates. */
export interface ScenePathGeometry {
  /** Discriminator. */
  readonly kind: 'path';
  /** Ordered vertices; at least two are required to be renderable. */
  readonly points: readonly ScenePoint[];
}

/** A filled area with an exterior ring and any number of holes. */
export interface ScenePolygonGeometry {
  /** Discriminator. */
  readonly kind: 'polygon';
  /** Exterior ring first, holes after; each needs at least three vertices. */
  readonly rings: readonly (readonly ScenePoint[])[];
}

/** A point marker whose radius is expressed directly in output pixels. */
export interface SceneCircleGeometry {
  /** Discriminator. */
  readonly kind: 'circle';
  /** Marker centre in world coordinates. */
  readonly center: ScenePoint;
  /** Marker radius in output pixels — markers do not scale with the extent. */
  readonly radiusPx: number;
}

/** Every geometry a scene entity may carry. */
export type SceneGeometry =
  | ScenePathGeometry
  | ScenePolygonGeometry
  | SceneCircleGeometry;

/** Resolved stroke styling; all widths are already in output pixels. */
export interface SceneStroke {
  /** CSS colour string resolved from `RenderStyleParams`. */
  readonly color: string;
  /** Stroke width in output pixels. */
  readonly widthPx: number;
  /** Stroke opacity in `[0, 1]`; omitted means fully opaque. */
  readonly opacity?: number;
  /** Line cap; omitted means `butt`. */
  readonly lineCap?: 'butt' | 'round';
  /** Line join; omitted means `round`. */
  readonly lineJoin?: 'round' | 'miter';
  /** Dash pattern in output pixels; omitted means a solid stroke. */
  readonly dashPx?: readonly number[];
}

/** One colour stop of a scene gradient. */
export interface SceneGradientStop {
  /** Position along the gradient in `[0, 1]`. */
  readonly offset: number;
  /** CSS colour string at this position. */
  readonly color: string;
}

/**
 * A named colour ramp referenced by fills.
 *
 * @remarks
 * Cartographic, not a document-format detail: a hypsometric elevation ramp is
 * how the theme expresses terrain, and a consumer that cannot render gradients
 * still has {@link SceneFill.color} as the flat fallback.
 */
export interface SceneGradient {
  /** Identifier referenced by {@link SceneFill.gradientId}. */
  readonly id: string;
  /** Only linear ramps are representable in the MVP. */
  readonly kind: 'linear';
  /** Stops in ascending `offset` order. */
  readonly stops: readonly SceneGradientStop[];
}

/** Resolved fill styling. */
export interface SceneFill {
  /**
   * CSS colour string resolved from `RenderStyleParams`.
   *
   * @remarks
   * Always present, even when `gradientId` is set — it is the flat fallback a
   * consumer without gradient support falls back to, so a fill is never
   * absent.
   */
  readonly color: string;
  /** Gradient to paint with instead of `color`, when the consumer supports it. */
  readonly gradientId?: string;
  /** Fill opacity in `[0, 1]`; omitted means fully opaque. */
  readonly opacity?: number;
  /** Winding rule; omitted means `nonzero`. */
  readonly fillRule?: 'evenodd' | 'nonzero';
}

/** One drawable entity, carrying the stable identity of its domain object. */
export interface SceneEntity {
  /**
   * Stable identifier, unique within the scene.
   *
   * @remarks
   * Derived from the domain identity that already exists (`Building.id`,
   * `RoadSegment.id`, `District.id`, …) so a user editing the exported
   * document can correlate a shape with the city it came from. Entities with
   * no domain identity (terrain bands, the sea polygon) get a deterministic
   * positional id instead — never a random one, so exports stay reproducible.
   */
  readonly id: string;
  /** Geometry in world coordinates. */
  readonly geometry: SceneGeometry;
  /** Resolved fill, when the entity is filled. */
  readonly fill?: SceneFill;
  /** Resolved stroke, when the entity is stroked. */
  readonly stroke?: SceneStroke;
}

/**
 * Logical layer of a scene, in the z-order the interactive renderer registers.
 *
 * @remarks
 * `water` corresponds to the domain's `basemap` layer (sea, inland water,
 * coastline); the name is the cartographic one because a scene describes
 * cartography, not MapLibre layer registration.
 */
export type SceneLayerId =
  | 'terrain'
  | 'water'
  | 'roads'
  | 'transit'
  | 'buildings'
  | 'forests'
  | 'districts';

/**
 * Scene layers in painting order, bottom first.
 *
 * @remarks
 * Forests sit low in the stack, under everything built — the interactive
 * renderer registers them right after the basemap for the same reason. Drawn
 * on top instead, a whole-map export turns into a green speckle that swallows
 * the roads and buildings underneath it.
 *
 * One deliberate divergence from the interactive renderer: it registers roads
 * *after* buildings, so streets paint over footprints. A printed map reads
 * better the other way round — building blocks stay legible and roads behave
 * like the gaps between them — so buildings paint last here. Everything else
 * matches the registration order in `managers/map-source.manager.ts`.
 */
export const SCENE_LAYER_ORDER: readonly SceneLayerId[] = Object.freeze([
  'terrain',
  'water',
  'forests',
  'roads',
  'buildings',
  'transit',
  'districts',
]);

/** One layer's entities plus the visibility captured at export time. */
export interface SceneLayer {
  /** Layer identity and z-order position. */
  readonly id: SceneLayerId;
  /** Whether the layer was visible when the snapshot was captured. */
  readonly visible: boolean;
  /** Entities in painting order within the layer. */
  readonly entities: readonly SceneEntity[];
}

/** Why a scene had to fall back rather than represent something faithfully. */
export type SceneWarningCode =
  /** One or more geometries had too few distinct vertices to draw. */
  | 'degenerate-geometry'
  /** A presentation option has no MVP representation and was not applied. */
  | 'unsupported-presentation'
  /** A visible layer produced no entities at all. */
  | 'empty-layer';

/**
 * An aggregated, localizable fallback notice.
 *
 * @remarks
 * Carries a code and a count only — never a path, city name, or any
 * `CityData` content — so it is safe to log alongside export metrics. The UI
 * maps `code` to an i18n key; there is no human-readable string here to leak.
 */
export interface SceneWarning {
  /** Machine-readable reason, mapped to an i18n key by the UI. */
  readonly code: SceneWarningCode;
  /** How many entities or options were affected. */
  readonly count: number;
}

/** A complete, serializable scene ready for a vector document writer. */
export interface CartographicScene {
  /** Deterministic world-to-pixel mapping for every coordinate in the scene. */
  readonly projection: SceneProjection;
  /** Resolved background colour, or `null` for a transparent document. */
  readonly background: string | null;
  /** Colour ramps referenced by fills; empty when no layer uses one. */
  readonly gradients: readonly SceneGradient[];
  /** Layers in painting order; see {@link SCENE_LAYER_ORDER}. */
  readonly layers: readonly SceneLayer[];
  /** Aggregated fallbacks applied while building the scene. */
  readonly warnings: readonly SceneWarning[];
}

/** Projects a world point into output pixels using a scene's projection. */
export function projectScenePoint(
  projection: SceneProjection,
  point: ScenePoint,
): { readonly x: number; readonly y: number } {
  const { extent, width, height } = projection;
  const spanX = extent.maxX - extent.minX;
  const spanZ = extent.maxZ - extent.minZ;
  return {
    x: spanX === 0 ? 0 : ((point.x - extent.minX) / spanX) * width,
    // Descends from maxZ — see the note on SceneProjection.
    y: spanZ === 0 ? 0 : ((extent.maxZ - point.z) / spanZ) * height,
  };
}
