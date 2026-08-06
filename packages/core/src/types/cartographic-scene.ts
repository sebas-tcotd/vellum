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
  | 'empty-layer'
  /** Entities were skipped because the domain holds no text to label them with. */
  | 'label-source-missing'
  /** Labels were withheld because a higher-priority one already occupied the space. */
  | 'label-collision'
  /** A transit mode has no catalogue entry and fell back to the generic marker. */
  | 'symbol-fallback'
  /** No font was embedded; the document relies on a generic family stack. */
  | 'font-not-embedded';

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

/** Where a label's anchor point sits relative to its text box. */
export type SceneLabelAnchor = 'center' | 'left' | 'right' | 'top' | 'bottom';

/**
 * Resolved typographic style for a label.
 *
 * @remarks
 * `fontFamily` is a family *stack*, not a file: nothing here references a
 * font resource, so a document carrying it stays self-contained. Layout
 * determinism comes from the exporter's own metric table, never from whatever
 * the viewer resolves the stack to.
 */
export interface SceneLabelStyle {
  /** CSS font-family stack, resolved by the viewer. */
  readonly fontFamily: string;
  /** Font size in output pixels. */
  readonly fontSizePx: number;
  /** CSS font weight. */
  readonly fontWeight: number;
  /** Fill colour of the glyphs. */
  readonly color: string;
  /** Halo colour painted behind the glyphs, when one is wanted. */
  readonly haloColor?: string;
  /** Halo width in output pixels; drawn as a stroke, never rasterized. */
  readonly haloWidthPx?: number;
}

/**
 * One piece of map text, derived only from data the domain already holds.
 *
 * @remarks
 * Never fabricated: a label exists because `CityData` carried a name or an
 * identifier for that entity. Anything the domain does not know — street
 * names, for instance — produces an aggregated warning rather than invented
 * text.
 */
export interface SceneLabel {
  /** Stable identifier, unique within the scene. */
  readonly id: string;
  /** Layer this label belongs to, preserving its provenance. */
  readonly layer: SceneLayerId;
  /** Identifier of the domain entity this label describes. */
  readonly entityId: string;
  /** The text itself, unescaped; the serializer owns escaping. */
  readonly text: string;
  /** Anchor position in CS1 world coordinates. */
  readonly at: ScenePoint;
  /** How the text box sits around {@link SceneLabel.at}. */
  readonly anchor: SceneLabelAnchor;
  /**
   * Collision priority; lower wins when two labels overlap.
   *
   * @remarks
   * Ties break on `id`, so a layout never depends on iteration order.
   */
  readonly priority: number;
  /** Resolved typography. */
  readonly style: SceneLabelStyle;
}

/** Transit modes the symbol catalogue covers. */
export type SceneSymbolId =
  | 'transit-bus'
  | 'transit-tram'
  | 'transit-train'
  | 'transit-metro'
  | 'transit-cablecar'
  | 'transit-monorail'
  | 'transit-ferry'
  | 'transit-blimp'
  | 'transit-trolleybus'
  | 'transit-unknown';

/**
 * One placed instance of a reusable symbol.
 *
 * @remarks
 * A definition is emitted once and referenced many times, but every instance
 * keeps its own selectable group and id — editing one marker must never
 * change the others.
 */
export interface SceneSymbolInstance {
  /** Stable identifier for this instance's group. */
  readonly id: string;
  /** Catalogue entry to instantiate. */
  readonly symbol: SceneSymbolId;
  /** Layer this instance belongs to. */
  readonly layer: SceneLayerId;
  /** Identifier of the domain entity this instance marks. */
  readonly entityId: string;
  /** Placement in CS1 world coordinates. */
  readonly at: ScenePoint;
  /** Rendered size in output pixels; symbols are square. */
  readonly sizePx: number;
  /** Fill applied to the instance, overriding the definition. */
  readonly color: string;
}

/**
 * Vector artwork placed on the document without being map geometry.
 *
 * @remarks
 * The one place this model carries document-format content rather than
 * neutral primitives, and deliberately so: the Vellum mark is *authored* as
 * SVG paths with Bézier curves, and {@link ScenePathGeometry} is polyline
 * only — re-expressing it here would flatten those curves for no gain. The
 * markup is bundled, never user-supplied, so it is not an injection surface.
 *
 * A consumer that cannot host foreign markup can simply skip the emblem; it
 * is a watermark, not cartography.
 */
export interface SceneEmblem {
  /** Identifier for the emitted group. */
  readonly id: string;
  /** Inner SVG markup, without its own root element. */
  readonly svgMarkup: string;
  /** Width of the artwork's own coordinate system. */
  readonly sourceWidth: number;
  /** Height of the artwork's own coordinate system. */
  readonly sourceHeight: number;
  /** Left edge of the placed artwork, in output pixels. */
  readonly xPx: number;
  /** Top edge of the placed artwork, in output pixels. */
  readonly yPx: number;
  /** Rendered width in output pixels; height follows the source aspect. */
  readonly widthPx: number;
  /** Opacity in `[0, 1]`; omitted means fully opaque. */
  readonly opacity?: number;
}

/**
 * Human-readable description of the document, when safe data exists.
 *
 * @remarks
 * Feeds `<title>`/`<desc>`. Deliberately narrow: a city name is content the
 * user already published inside the map, whereas a file path or an output
 * directory is not, and must never reach the document.
 */
export interface SceneDocumentInfo {
  /** City name, when the domain has one. */
  readonly title: string;
  /** One-line description of what the document shows. */
  readonly description: string;
}

/** A complete, serializable scene ready for a vector document writer. */
export interface CartographicScene {
  /** Accessible title and description for the document. */
  readonly info: SceneDocumentInfo;
  /** Deterministic world-to-pixel mapping for every coordinate in the scene. */
  readonly projection: SceneProjection;
  /** Resolved background colour, or `null` for a transparent document. */
  readonly background: string | null;
  /** Colour ramps referenced by fills; empty when no layer uses one. */
  readonly gradients: readonly SceneGradient[];
  /** Layers in painting order; see {@link SCENE_LAYER_ORDER}. */
  readonly layers: readonly SceneLayer[];
  /**
   * Map text, in no particular order.
   *
   * @remarks
   * Kept beside the layers rather than inside them so a single deterministic
   * layout pass can see every label at once — collision is a document-wide
   * question, not a per-layer one. Each label still carries its
   * {@link SceneLabel.layer}, so provenance survives.
   */
  readonly labels: readonly SceneLabel[];
  /** Reusable-symbol instances, each with its own selectable identity. */
  readonly symbols: readonly SceneSymbolInstance[];
  /**
   * Watermark artwork drawn above every layer, or `null` when disabled.
   *
   * @remarks
   * Outside the layer stack on purpose: it is not cartography, so a user
   * deleting it in an editor must not have to hunt through a map layer, and
   * hiding every layer must still leave it visible.
   */
  readonly emblem: SceneEmblem | null;
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
