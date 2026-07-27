/**
 * Converts Vellum `CityData` domain objects into GeoJSON FeatureCollections
 * suitable for ingestion by MapLibre GL JS.
 *
 * @remarks
 * All coordinate conversions go through `csToGeoArray`, which applies the
 * equatorial CS1→WGS-84 transform and produces [longitude, latitude] pairs
 * in the order required by RFC 7946 (GeoJSON spec) and MapLibre.
 *
 * This module is a pure data transformer — it has no side effects and does
 * not import MapLibre. It can be unit-tested in jsdom without WebGL. Each
 * domain (roads, transit, buildings, environment, terrain) has its own
 * builder under `builders/`, sharing types from `types/` and static config
 * from `config/`.
 */

export { buildBuildingsGeoJson } from './builders/buildings.builder';
export { buildGridGeoJson } from './builders/grid.builder';
export {
  buildDistrictsGeoJson,
  buildForestsGeoJson,
  buildWaterSurfaceGeoJson,
  buildWorldExtentGeoJson,
} from './builders/environment.builder';
export { buildRoadsGeoJson } from './builders/roads.builder';
export {
  buildCoastlineGeoJson,
  buildContourLinesGeoJson,
  buildLandPolygonGeoJson,
} from './builders/terrain.builder';
export {
  buildTransitGeoJson,
  buildTransitRenderData,
  buildTransitStopsGeoJson,
} from './builders/transit.builder';
export type {
  BuildingFeature,
  BuildingFeatureProperties,
  BuildingsFeatureCollection,
  BuildingZoning,
  ContourLineCollection,
  ContourLineFeature,
  ContourLineProperties,
  DistrictFeature,
  DistrictFeatureProperties,
  DistrictsFeatureCollection,
  Feature,
  FeatureCollection,
  ForestFeature,
  ForestFeatureProperties,
  ForestsFeatureCollection,
  LandFeature,
  LandPolygonFeatureCollection,
  LandPolygonProperties,
  LineStringGeometry,
  PointGeometry,
  PolygonGeometry,
  RoadFeature,
  RoadFeatureProperties,
  RoadsFeatureCollection,
  RoadTier,
  RoadWidthStyle,
  StationDotFeature,
  StationDotsFeatureCollection,
  TerrainBandProperties,
  TransitConnectorsFeatureCollection,
  TransitFeature,
  TransitFeatureCollection,
  TransitFeatureProperties,
  TransitRenderData,
  TransitStopFeature,
  TransitStopFeatureProperties,
  TransitStopsFeatureCollection,
  WaterFeature,
  WaterFeatureCollection,
} from './types';
