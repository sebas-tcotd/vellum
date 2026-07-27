/** Barrel of all GeoJSON output types produced by the `geojson/` builders. */

export type {
  BuildingFeature,
  BuildingFeatureProperties,
  BuildingsFeatureCollection,
  BuildingZoning,
} from './buildings.types';
export type {
  DistrictFeature,
  DistrictFeatureProperties,
  DistrictsFeatureCollection,
  ForestFeature,
  ForestFeatureProperties,
  ForestsFeatureCollection,
  ParkAreaFeature,
  ParkAreaFeatureProperties,
  ParkAreasFeatureCollection,
  WaterFeature,
  WaterFeatureCollection,
} from './environment.types';
export type {
  Feature,
  FeatureCollection,
  LineStringGeometry,
  PointGeometry,
  PolygonGeometry,
} from './geojson-primitives';
export type {
  RoadFeature,
  RoadFeatureProperties,
  RoadsFeatureCollection,
  RoadTier,
  RoadWidthStyle,
} from './roads.types';
export type {
  ContourLineCollection,
  ContourLineFeature,
  ContourLineProperties,
  LandFeature,
  LandPolygonFeatureCollection,
  LandPolygonProperties,
  TerrainBandProperties,
} from './terrain.types';
export type {
  StationDotFeature,
  StationDotsFeatureCollection,
  TransitConnectorsFeatureCollection,
  TransitFeature,
  TransitFeatureCollection,
  TransitFeatureProperties,
  TransitRenderData,
  TransitStopFeature,
  TransitStopFeatureProperties,
  TransitStopsFeatureCollection,
} from './transit.types';
