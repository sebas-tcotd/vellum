import type { IRenderer, CityData, RenderParams } from '@vellum/core';
import { readTokensFromDOM, type RendererTokens } from './tokens';

export class CanvasRenderer implements IRenderer {
  private tokens: RendererTokens;

  constructor() {
    this.tokens = readTokensFromDOM();
  }

  render(_cityData: CityData, _params: RenderParams): void {
    // Story 3.2+ implementa capas reales.
    // tokens disponibles como this.tokens — sin hardcoding de colores.
    // void evita el error no-unused-private-class-members hasta que render tenga implementación real.
    void this.tokens;
  }

  updateViewport(_zoom: number, _panX: number, _panY: number): void {}

  resize(_width: number, _height: number): void {}

  dispose(): void {}
}
