// packages/core/src/types/renderer.ts
import type { CityData } from './city-data';
import type { LayerVisibility } from './layer';

/**
 * Parámetros de renderizado pasados al renderer en cada frame.
 * `styleParams` se añade en Story 5.x cuando `theme-engine` esté listo.
 */
export interface RenderParams {
  activeLayers: LayerVisibility;
  // styleParams: RenderStyleParams — se añade cuando theme-engine está listo (Story 5.x)
}

/**
 * Puerto del renderer de canvas.
 *
 * `renderer-canvas` implementa esta interfaz; `@vellum/core` solo declara el contrato.
 * La UI depende de `IRenderer` (puerto), nunca de la implementación concreta.
 */
export interface IRenderer {
  /** Renderiza la ciudad completa con los parámetros dados. */
  render(cityData: CityData, params: RenderParams): void;
  /** Actualiza la posición del viewport sin re-renderizar datos. */
  updateViewport(zoom: number, panX: number, panY: number): void;
  /** Notifica al renderer que el canvas cambió de tamaño. */
  resize(width: number, height: number): void;
  /** Libera todos los recursos del renderer. Llamar al desmontar el componente. */
  dispose(): void;
}
