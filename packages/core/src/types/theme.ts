// packages/core/src/types/theme.ts
// Stubs — implementación completa en Story 5.x (theme-engine)

export interface VellumStyle {
  schemaVersion: number; // siempre presente desde v1; comienza en 1
  name: string;
  // campos de estilo se definen en Story 5.x
}

// Modelo fixed + scaled — NUNCA un único valor precalculado
export interface LineStyle {
  colorHex: string;
  fixedWidth: number; // ancho mínimo visible a cualquier zoom
  scaledWidth: number; // ancho proporcional: totalWidth = fixed + scaled × zoomFactor
  opacity: number; // 0.0–1.0
}

export interface RoadStyleParams {
  [wayType: string]: LineStyle;
}

export interface RenderStyleParams {
  roads: RoadStyleParams;
  // otros grupos de estilos se añaden en Story 5.x
}
