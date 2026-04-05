// packages/core/src/types/theme.ts
// Stubs — implementación completa en Story 5.x (theme-engine)

/** Descriptor de un archivo `.vellumstyle`. Los campos de estilo se definen en Story 5.x. */
export interface VellumStyle {
  schemaVersion: number; // siempre presente desde v1; comienza en 1
  name: string;
  // campos de estilo se definen en Story 5.x
}

/**
 * Estilo visual de una línea con modelo `fixed + scaled`.
 *
 * `totalWidth = fixedWidth + scaledWidth × zoomFactor`
 *
 * Nunca precalcular un único valor de ancho — siempre exponer ambos componentes por separado.
 */
export interface LineStyle {
  colorHex: string;
  fixedWidth: number; // ancho mínimo visible a cualquier zoom
  scaledWidth: number; // ancho proporcional: totalWidth = fixed + scaled × zoomFactor
  opacity: number; // 0.0–1.0
}

/** Mapa de estilos de vía, indexado por `WayType` string. */
export interface RoadStyleParams {
  [wayType: string]: LineStyle;
}

/** Parámetros de estilo de renderizado completos, producidos por `theme-engine`. */
export interface RenderStyleParams {
  roads: RoadStyleParams;
  // otros grupos de estilos se añaden en Story 5.x
}
