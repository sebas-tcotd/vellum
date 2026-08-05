/**
 * Derives the renderer-neutral {@link CartographicScene} from an export
 * snapshot.
 *
 * @remarks
 * This is the *only* place the neutral model is produced, and it is built on
 * the exact same `geojson/` builders the interactive map consumes — so the
 * `Bus Line` exclusion, the `ItemClass` building filters, the
 * `ITEM_CLASS_TIER` road classification and the `resolveColors` theme
 * resolution exist once, not twice. Nothing is re-implemented here; the only
 * new work is unprojecting the builders' equatorial WGS-84 coordinates back to
 * CS1 world units (the exact inverse `geoToCs`, so no precision is invented)
 * and baking zoom-dependent widths into literals.
 *
 * It lives in `renderer-webgl` rather than `@vellum/core` because it needs
 * those builders. Its *output* is core-only data, which is what lets the SVG
 * adapter depend on `@vellum/core` alone and never import this package
 * (ARCHITECTURE-SPINE AD-16) — the desktop composition root wires the two.
 */

import {
  SCENE_LAYER_ORDER,
  type CartographicScene,
  type ExportBackground,
  type ExportExtent,
  type ExportSnapshotBase,
  type LayerVisibility,
  type RenderStyleParams,
  type SceneEmblem,
  type SceneEntity,
  type SceneLayer,
  type SceneLayerId,
  type ScenePoint,
  type SceneWarning,
  type SceneWarningCode,
  type TransitMode,
} from '@vellum/core';
import { VELLUM_LOGO_SIZE, vellumLogoInnerSvg } from '../assets/vellum-logo';
import { geoToCs } from '../coordinate-transform';
import { resolveBuildingColor } from '../expressions/building-color';
import { resolveRoadWidthPx } from '../expressions/road-width-curve';
import { resolveElevationColor } from '../expressions/terrain-relief';
import {
  buildBuildingsGeoJson,
  buildCoastlineGeoJson,
  buildContourLinesGeoJson,
  buildDistrictsGeoJson,
  buildForestsGeoJson,
  buildLandPolygonGeoJson,
  buildRoadsGeoJson,
  buildTransitRenderData,
  buildWaterSurfaceGeoJson,
} from '../geojson';
import {
  STATION_DOT_MIN_PX,
  STATION_FILL,
  STATION_STROKE,
  STATION_STROKE_MIN_PX,
  TRANSIT_LINE_MIN_PX,
} from '../layers/layer-transit';
import { TRANSIT_DIM_FACTOR } from '../constants/layer.constants';
import { buildSceneAnnotations } from './scene-annotations';
import { resolveColors, type ResolvedColors } from '../style-adapter';
import { LINE_WIDTH_M, SLOT_M } from '../transit/render-geometry';

/** Everything the scene builder needs, plus the caller's cartographic policy. */
export interface CartographicSceneInput {
  /** Snapshot fields shared by every export route. */
  readonly snapshot: ExportSnapshotBase;
  /** Background treatment selected by the user. */
  readonly background: ExportBackground;
  /**
   * Multiplier applied to each road tier's `scaledWidth`.
   *
   * @remarks
   * Supplied by the *caller's* export policy, never derived here: an exporter
   * decides what a local road should measure in its own output, and that
   * decision must not leak into `CityData`, `RenderStyleParams`, or the
   * interactive renderer. Pass `roadWidthFactorAtZoom(zoom)` to match the live
   * map at a given zoom instead.
   */
  readonly roadWidthFactor: number;
  /**
   * Casing border added to each road's fill width, in output pixels.
   *
   * @remarks
   * Also the caller's, and for the same reason: MapLibre grows the border
   * along its own zoom curve, so only the exporter knows which point of that
   * curve its document sits at. Deriving it from the fill width here would
   * make the border scale with the tier instead of with the scale.
   */
  readonly roadCasingAddPx: number;
}

/** Identifier prefix per layer, keeping generated ids collision-free. */
const ID_PREFIX: Readonly<Record<SceneLayerId, string>> = Object.freeze({
  terrain: 'terrain',
  water: 'water',
  roads: 'road',
  transit: 'transit',
  buildings: 'building',
  forests: 'forest',
  districts: 'district',
});

// Stroke and marker sizes the interactive layers bind into MapLibre paint
// objects as plain literals. A static document cannot consume a paint object,
// so the numbers are restated here — but the *station* styling is imported
// from `layer-transit.ts` rather than copied, because those values are a fixed
// cartographic convention (black-on-white, deliberately theme-independent) and
// two copies of a convention is how they stop matching.
const CONTOUR_WIDTH_PX = 0.5;
const CONTOUR_OPACITY = 0.5;
const COASTLINE_WIDTH_PX = 4;
const COASTLINE_OPACITY = 0.8;
const BUILDING_STROKE_PX = 0.5;
const BUILDING_FILL_OPACITY = 0.85;
const FOREST_MIN_RADIUS_PX = 1;
const FOREST_MAX_RADIUS_PX = 4;
const FOREST_MIN_OPACITY = 0.3;
const FOREST_MAX_OPACITY = 0.7;
const DISTRICT_RADIUS_PX = 6;

/**
 * Builds the neutral scene for one snapshot.
 *
 * @param input - Snapshot plus the caller's cartographic policy.
 * @returns An immutable scene in world coordinates, in painting order.
 */
export function buildCartographicScene(
  input: CartographicSceneInput,
): CartographicScene {
  const { snapshot } = input;
  const colors = resolveColors(snapshot.style);
  const warnings = new WarningTally();
  const pixelsPerWorldUnit = resolvePixelsPerWorldUnit(
    snapshot.extent,
    snapshot.surface.width,
  );

  const layers = SCENE_LAYER_ORDER.map((id) =>
    buildLayer(id, {
      snapshot,
      colors,
      warnings,
      pixelsPerWorldUnit,
      roadWidthFactor: input.roadWidthFactor,
      roadCasingAddPx: input.roadCasingAddPx,
      // The transit theme dims everything that is not transit. It is a
      // renderer effect (`MapLayerManager.setTransitDimming` scales each
      // non-transit layer's opacity), not UI chrome, so an export captured
      // with it on has to reproduce it or it silently loses the emphasis the
      // user was looking at.
      dimFactor: snapshot.transitDimming ? TRANSIT_DIM_FACTOR : 1,
    }),
  );

  const background = resolveBackground(input.background, snapshot.style);
  const annotations = buildSceneAnnotations({
    cityData: snapshot.cityData,
    activeLayers: snapshot.activeLayers,
    layerOptions: snapshot.layerOptions,
    colors,
    background,
  });
  if (annotations.missingLabelSources > 0) {
    warnings.add('label-source-missing', annotations.missingLabelSources);
  }
  if (annotations.symbolFallbacks > 0) {
    warnings.add('symbol-fallback', annotations.symbolFallbacks);
  }
  // AC 4/13: the document names a font stack but embeds no font file, and
  // says so rather than letting the reader assume otherwise.
  warnings.add('font-not-embedded');

  return {
    info: {
      title: snapshot.cityData.cityName.trim() || 'Vellum map',
      description: `Cartographic export of ${
        snapshot.cityData.cityName.trim() || 'a Cities: Skylines map'
      }.`,
    },
    projection: {
      extent: snapshot.extent,
      width: snapshot.surface.width,
      height: snapshot.surface.height,
    },
    background,
    // No colour ramp is emitted in the MVP; see buildTerrainEntities.
    gradients: [],
    layers,
    labels: annotations.labels,
    symbols: annotations.symbols,
    emblem: snapshot.watermarkVisible
      ? buildEmblem(snapshot.surface.width, snapshot.surface.height)
      : null,
    warnings: warnings.collect(),
  };
}

/** Shared state threaded through every per-layer builder. */
interface LayerContext {
  readonly snapshot: ExportSnapshotBase;
  readonly colors: ResolvedColors;
  readonly warnings: WarningTally;
  readonly pixelsPerWorldUnit: number;
  readonly roadWidthFactor: number;
  readonly roadCasingAddPx: number;
  /** Multiplier applied to every non-transit opacity; 1 when dimming is off. */
  readonly dimFactor: number;
}

function buildLayer(id: SceneLayerId, context: LayerContext): SceneLayer {
  const visible = isLayerVisible(id, context.snapshot.activeLayers);
  // Hidden layers still appear as empty groups, so a user re-enabling one in
  // an editor finds the group where the z-order says it should be.
  const entities = visible ? LAYER_BUILDERS[id](context) : [];
  if (visible && entities.length === 0) context.warnings.add('empty-layer');
  // Transit is the layer the dimming exists to emphasise, so it keeps its own
  // opacity while everything around it is knocked back.
  const dimmed =
    id === 'transit' || context.dimFactor === 1
      ? entities
      : entities.map((entity) => dimEntity(entity, context.dimFactor));
  return { id, visible, entities: dimmed };
}

/** Maps the neutral layer ids onto the domain's `LayerVisibility` keys. */
function isLayerVisible(
  id: SceneLayerId,
  activeLayers: Readonly<LayerVisibility>,
): boolean {
  return id === 'water' ? activeLayers.basemap : activeLayers[id];
}

const LAYER_BUILDERS: Readonly<
  Record<SceneLayerId, (context: LayerContext) => SceneEntity[]>
> = Object.freeze({
  terrain: buildTerrainEntities,
  water: buildWaterEntities,
  roads: buildRoadEntities,
  transit: buildTransitEntities,
  buildings: buildBuildingEntities,
  forests: buildForestEntities,
  districts: buildDistrictEntities,
});

// ─── Layers ──────────────────────────────────────────────────────────────────

function buildTerrainEntities(context: LayerContext): SceneEntity[] {
  const { snapshot, colors, warnings } = context;
  const entities: SceneEntity[] = [];

  buildLandPolygonGeoJson(snapshot.cityData).features.forEach(
    (feature, index) => {
      const rings = toWorldRings(feature.geometry.coordinates, warnings);
      if (rings.length === 0) return;
      entities.push({
        id: `${ID_PREFIX.terrain}-land-${index}`,
        geometry: { kind: 'polygon', rings },
        // Flat, on purpose. The interactive relief is a `color-relief` ramp
        // sampled per DEM texel; there is no vector primitive that carries
        // that, and a document-wide gradient only *looks* like elevation —
        // it is a top-to-bottom fade that says nothing about the terrain
        // underneath it. Contour lines below carry the real relief until
        // 6.3B vectorizes hypsometric bands.
        fill: { color: colors.land, fillRule: 'evenodd' },
      });
    },
  );

  if (snapshot.layerOptions.terrain.showContourLines) {
    // Hypsometric contours: each isoline is tinted by the altitude it actually
    // sits at, using the theme's own `terrain.{low,mid,high}` ramp — the same
    // one the GPU paints the relief with. This is what carries elevation in a
    // vector document now that the meaningless document-wide gradient is gone,
    // and unlike that gradient it cannot lie: a line's colour and its position
    // both come from the same measured elevation.
    const relief = snapshot.layerOptions.terrain.showColorRelief;
    buildContourLinesGeoJson(snapshot.cityData).features.forEach(
      (feature, index) => {
        const points = toWorldPath(feature.geometry.coordinates, warnings);
        if (!points) return;
        entities.push({
          id: `${ID_PREFIX.terrain}-contour-${index}`,
          geometry: { kind: 'path', points },
          stroke: {
            // With relief switched off the user asked for a plain contour map,
            // so the flat theme colour is the honest answer there.
            color: relief
              ? resolveElevationColor(
                  colors.terrain,
                  snapshot.cityData.terrainDem,
                  feature.properties.elevation,
                )
              : colors.contourLine,
            widthPx: CONTOUR_WIDTH_PX,
            opacity: CONTOUR_OPACITY,
          },
        });
      },
    );
  }

  return entities;
}

function buildWaterEntities(context: LayerContext): SceneEntity[] {
  const { snapshot, colors, warnings } = context;
  const entities: SceneEntity[] = [];

  buildWaterSurfaceGeoJson(snapshot.cityData).features.forEach(
    (feature, index) => {
      const rings = toWorldRings(feature.geometry.coordinates, warnings);
      if (rings.length === 0) return;
      entities.push({
        id: `${ID_PREFIX.water}-surface-${index}`,
        geometry: { kind: 'polygon', rings },
        // The sea is the world extent with every landmass punched out as a
        // hole, so it only reads correctly under an even-odd rule.
        fill: { color: colors.water, fillRule: 'evenodd' },
      });
    },
  );

  buildCoastlineGeoJson(snapshot.cityData).features.forEach(
    (feature, index) => {
      const points = toWorldPath(feature.geometry.coordinates, warnings);
      if (!points) return;
      entities.push({
        id: `${ID_PREFIX.water}-coastline-${index}`,
        geometry: { kind: 'path', points },
        stroke: {
          color: colors.coastlineStroke,
          widthPx: COASTLINE_WIDTH_PX,
          opacity: COASTLINE_OPACITY,
          lineJoin: 'round',
        },
      });
    },
  );

  return entities;
}

function buildRoadEntities(context: LayerContext): SceneEntity[] {
  const { snapshot, colors, warnings, roadWidthFactor, roadCasingAddPx } =
    context;
  const casings: SceneEntity[] = [];
  const fills: SceneEntity[] = [];

  for (const feature of buildRoadsGeoJson(snapshot.cityData).features) {
    const points = toWorldPath(feature.geometry.coordinates, warnings);
    if (!points) continue;
    const { id, tier, fixedWidth, scaledWidth, capEnds } = feature.properties;
    const widthPx = resolveRoadWidthPx(
      fixedWidth,
      scaledWidth,
      roadWidthFactor,
    );
    const cap = capEnds ? ('round' as const) : ('butt' as const);
    const geometry = { kind: 'path', points } as const;

    // Casing under fill, exactly as the interactive layers stack them —
    // emitted as two independent paths so either can be restyled on its own.
    casings.push({
      id: `${ID_PREFIX.roads}-${id}-casing`,
      geometry,
      stroke: {
        color: colors.roadCasing[tier],
        widthPx: widthPx + roadCasingAddPx,
        lineCap: cap,
        lineJoin: 'round',
      },
    });
    fills.push({
      id: `${ID_PREFIX.roads}-${id}`,
      geometry,
      stroke: {
        color: colors.roadFill[tier],
        widthPx,
        lineCap: cap,
        lineJoin: 'round',
      },
    });
  }

  return [...casings, ...fills];
}

function buildTransitEntities(context: LayerContext): SceneEntity[] {
  const { snapshot, colors, warnings, pixelsPerWorldUnit } = context;
  const visibleModes = new Set<string>(
    snapshot.layerOptions.transit.visibleModes as readonly TransitMode[],
  );
  const data = buildTransitRenderData(snapshot.cityData);
  const widthPx = Math.max(
    TRANSIT_LINE_MIN_PX,
    LINE_WIDTH_M * pixelsPerWorldUnit,
  );
  const slotWorld = SLOT_M;
  const entities: SceneEntity[] = [];

  for (const collection of [data.lines, data.connectors]) {
    for (const feature of collection.features) {
      if (!visibleModes.has(feature.properties.mode)) continue;
      const points = toWorldPath(feature.geometry.coordinates, warnings);
      if (!points) continue;
      entities.push({
        id: `${ID_PREFIX.transit}-${feature.properties.id}-${entities.length}`,
        geometry: {
          kind: 'path',
          points: offsetPath(points, feature.properties.offsetIdx * slotWorld),
        },
        stroke: {
          color: feature.properties.color || colors.ferry,
          widthPx,
          lineCap: 'round',
          lineJoin: 'round',
        },
      });
    }
  }

  for (const feature of data.stationDots.features) {
    if (!visibleModes.has(feature.properties.mode)) continue;
    const [lng, lat] = feature.geometry.coordinates;
    entities.push({
      id: `${ID_PREFIX.transit}-station-${feature.properties.id}`,
      geometry: {
        kind: 'circle',
        center: geoToCs({ lng, lat }),
        radiusPx: STATION_DOT_MIN_PX,
      },
      fill: { color: STATION_FILL },
      stroke: { color: STATION_STROKE, widthPx: STATION_STROKE_MIN_PX },
    });
  }

  return entities;
}

function buildBuildingEntities(context: LayerContext): SceneEntity[] {
  const { snapshot, colors, warnings } = context;
  const { visibleCategories, colorByCategory } =
    snapshot.layerOptions.buildings;
  const visible = new Set<string>(visibleCategories);
  const entities: SceneEntity[] = [];

  for (const feature of buildBuildingsGeoJson(snapshot.cityData).features) {
    const { id, category, civicKind } = feature.properties;
    if (!visible.has(category)) continue;
    const rings = toWorldRings(feature.geometry.coordinates, warnings);
    if (rings.length === 0) continue;
    entities.push({
      id: `${ID_PREFIX.buildings}-${id}`,
      geometry: { kind: 'polygon', rings },
      fill: {
        color: resolveBuildingColor(
          colors,
          'fill',
          category,
          civicKind,
          colorByCategory,
        ),
        opacity: BUILDING_FILL_OPACITY,
      },
      stroke: {
        color: resolveBuildingColor(
          colors,
          'stroke',
          category,
          civicKind,
          colorByCategory,
        ),
        widthPx: BUILDING_STROKE_PX,
      },
    });
  }

  return entities;
}

function buildForestEntities(context: LayerContext): SceneEntity[] {
  const { snapshot, colors } = context;
  return buildForestsGeoJson(snapshot.cityData).features.map(
    (feature, index) => {
      const [lng, lat] = feature.geometry.coordinates;
      const density = clamp01(feature.properties.density);
      return {
        id: `${ID_PREFIX.forests}-${index}`,
        geometry: {
          kind: 'circle' as const,
          center: geoToCs({ lng, lat }),
          radiusPx: lerp(FOREST_MIN_RADIUS_PX, FOREST_MAX_RADIUS_PX, density),
        },
        fill: {
          color: colors.forests,
          opacity: lerp(FOREST_MIN_OPACITY, FOREST_MAX_OPACITY, density),
        },
      };
    },
  );
}

function buildDistrictEntities(context: LayerContext): SceneEntity[] {
  const { snapshot, colors } = context;
  return buildDistrictsGeoJson(snapshot.cityData).features.map((feature) => {
    const [lng, lat] = feature.geometry.coordinates;
    return {
      id: `${ID_PREFIX.districts}-${feature.properties.id}`,
      geometry: {
        kind: 'circle' as const,
        center: geoToCs({ lng, lat }),
        radiusPx: DISTRICT_RADIUS_PX,
      },
      fill: { color: colors.districtFill },
    };
  });
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** Fraction of the document's shorter edge the watermark occupies. */
const EMBLEM_SIZE_RATIO = 0.12;

/**
 * Places the Vellum mark at the centre of the document.
 *
 * @remarks
 * Centred to match `layer-watermark.ts`, which anchors it at world origin.
 * Its *size*, though, cannot be matched: the interactive mark is driven by a
 * zoom-interpolated `icon-size`, and a static document has no zoom. A fixed
 * fraction of the shorter edge is the export's own choice — the same kind of
 * documented policy decision as the road-width scale — so the mark keeps its
 * proportion whatever resolution was requested.
 */
function buildEmblem(width: number, height: number): SceneEmblem {
  const size = Math.min(width, height) * EMBLEM_SIZE_RATIO;
  return {
    id: 'vellum-watermark',
    svgMarkup: vellumLogoInnerSvg(),
    sourceWidth: VELLUM_LOGO_SIZE,
    sourceHeight: VELLUM_LOGO_SIZE,
    xPx: (width - size) / 2,
    yPx: (height - size) / 2,
    widthPx: size,
  };
}

function resolveBackground(
  background: ExportBackground,
  style: Readonly<RenderStyleParams>,
): string | null {
  if (background === 'transparent') return null;
  return background === 'dark' ? style.transitBackground : style.mapBackground;
}

/**
 * Output pixels per CS1 world unit along X.
 *
 * @remarks
 * The document's *geometric* scale, deliberately distinct from any road-width
 * policy: it sizes world-locked features (transit corridors), never the
 * stylistic weight of a road tier.
 */
function resolvePixelsPerWorldUnit(
  extent: ExportExtent,
  width: number,
): number {
  const span = extent.maxX - extent.minX;
  return span > 0 ? width / span : 0;
}

/** Unprojects one builder coordinate pair back to CS1 world space. */
function toWorldPoint(coordinate: readonly number[]): ScenePoint | null {
  const [lng, lat] = coordinate;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return geoToCs({ lng: lng as number, lat: lat as number });
}

/** Unprojects a line, rejecting anything with fewer than two distinct points. */
function toWorldPath(
  coordinates: readonly (readonly number[])[],
  warnings: WarningTally,
): ScenePoint[] | null {
  const points: ScenePoint[] = [];
  for (const coordinate of coordinates) {
    const point = toWorldPoint(coordinate);
    if (point) points.push(point);
  }
  if (countDistinct(points) < 2) {
    warnings.add('degenerate-geometry');
    return null;
  }
  return points;
}

/** Unprojects polygon rings, dropping any ring too small to enclose an area. */
function toWorldRings(
  coordinates: readonly (readonly (readonly number[])[])[],
  warnings: WarningTally,
): ScenePoint[][] {
  const rings: ScenePoint[][] = [];
  for (const [index, ring] of coordinates.entries()) {
    const points: ScenePoint[] = [];
    for (const coordinate of ring) {
      const point = toWorldPoint(coordinate);
      if (point) points.push(point);
    }
    if (countDistinct(points) < 3) {
      warnings.add('degenerate-geometry');
      // GeoJSON puts the exterior ring first. Dropping it and keeping the
      // rest would promote the first surviving *hole* to exterior, painting a
      // lake as solid land. There is nothing to reconstruct the outline from,
      // so the whole feature goes.
      if (index === 0) return [];
      continue;
    }
    rings.push(points);
  }
  return rings;
}

/** Scales an entity's fill and stroke opacity, leaving its geometry alone. */
function dimEntity(entity: SceneEntity, factor: number): SceneEntity {
  return {
    ...entity,
    ...(entity.fill
      ? {
          fill: {
            ...entity.fill,
            opacity: (entity.fill.opacity ?? 1) * factor,
          },
        }
      : {}),
    ...(entity.stroke
      ? {
          stroke: {
            ...entity.stroke,
            opacity: (entity.stroke.opacity ?? 1) * factor,
          },
        }
      : {}),
  };
}

function countDistinct(points: readonly ScenePoint[]): number {
  const seen = new Set<string>();
  for (const point of points) seen.add(`${point.x},${point.z}`);
  return seen.size;
}

/**
 * Displaces a polyline perpendicular to its own direction.
 *
 * @remarks
 * Reproduces MapLibre's `line-offset`, which bundles parallel transit lines
 * into a corridor. Each vertex moves along the normal of its local direction
 * (previous → next), so the offset copy stays parallel through curves. Tight
 * hairpins can pinch slightly; that is the accepted MVP trade for not running
 * a full offset-curve algorithm, and it is invisible at corridor spacing.
 */
function offsetPath(
  points: readonly ScenePoint[],
  offsetWorld: number,
): ScenePoint[] {
  if (offsetWorld === 0) return [...points];
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz);
    if (length === 0) return point;
    // Left-hand normal of the direction vector, matching MapLibre's positive
    // `line-offset` convention.
    return {
      x: point.x + (dz / length) * offsetWorld,
      z: point.z - (dx / length) * offsetWorld,
    };
  });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Counts fallbacks by code so a scene reports totals, never per-entity noise. */
class WarningTally {
  private readonly counts = new Map<SceneWarningCode, number>();

  add(code: SceneWarningCode, count = 1): void {
    this.counts.set(code, (this.counts.get(code) ?? 0) + count);
  }

  collect(): SceneWarning[] {
    return [...this.counts].map(([code, count]) => ({ code, count }));
  }
}
