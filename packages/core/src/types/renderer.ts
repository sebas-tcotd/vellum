// packages/core/src/types/renderer.ts
import type { CityData } from './city-data';
import type { LayerVisibility } from './layer';

// RenderStyleParams se define en theme.ts — aquí solo la referencia
export interface RenderParams {
  activeLayers: LayerVisibility;
  // styleParams: RenderStyleParams — se añade cuando theme-engine está listo (Story 5.x)
}

// Puerto que implementa renderer-canvas — core no conoce la implementación
export interface IRenderer {
  render(cityData: CityData, params: RenderParams): void;
  updateViewport(zoom: number, panX: number, panY: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
