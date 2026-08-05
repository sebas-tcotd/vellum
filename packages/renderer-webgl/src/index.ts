// @vellum/renderer-webgl — barrel export
export * from './coordinate-transform';
export * from './geojson';
export {
  CapabilityProbe,
  probeCapabilities,
  type CapabilityProbeOptions,
} from './capability-probe';
export { vellumLogoDataUri } from './assets/vellum-logo';
export { LegacyRasterExporter } from './export/legacy-raster-exporter';
export {
  buildCartographicScene,
  type CartographicSceneInput,
} from './export/cartographic-scene-builder';
export {
  resolveRoadWidthPx,
  roadWidthFactorAtZoom,
  ROAD_WIDTH_FACTOR_STOPS,
} from './expressions/road-width-curve';
export { zoomForWorldUnitsPerPixel } from './export/output-density';
export { resolveFullMapOutputSurface } from './export/export-snapshot-builder';
export { planTiles } from './export/tile-planner';
export {
  captureQualityBenchmarkCase,
  type QualityBenchmarkArtifact,
  type QualityBenchmarkCase,
  type QualityBenchmarkWriter,
} from './export/benchmark-capture';
export {
  applyBoxFilter,
  createBrowserPngCodec,
  downsampleRgba,
  MAX_SESSION_BYTES,
  MAX_TILE_RGBA_BYTES,
  preflightQuality,
  processQualityPng,
  QualityVariantError,
  type ExportQualityConfig,
  type QualityPreflight,
  type RasterImage,
  type RasterQualityCodec,
} from './export/export-quality';
export {
  TiledExportCapabilityError,
  TiledRasterExporter,
} from './export/tiled-raster-exporter';
export {
  MapLibreRenderer,
  ServiceIconLegendState,
  TooltipInfo,
  ViewportBounds,
} from './map-libre-renderer';
export type { MapLibreRendererOptions } from './map-libre-renderer-options';
export type { PngExportOptions } from './export/export-types';
export {
  buildServiceIconSvg,
  resolveServiceGroup,
  serviceIconDataUri,
  SERVICE_GROUPS,
  SERVICE_ICONS_MIN_ZOOM,
  ServiceGroup,
} from './service-icons';
