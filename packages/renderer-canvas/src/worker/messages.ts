import type { CityData, LayerVisibility } from '@vellum/core';
import type { RendererTokens } from '../tokens';

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface RenderStyleParams {
  tokens: RendererTokens;
}

export type WorkerMessage =
  | {
      type: 'render';
      cityData: CityData;
      style: RenderStyleParams;
      layers: LayerVisibility;
    }
  | { type: 'resize'; width: number; height: number }
  | { type: 'update-viewport'; viewport: ViewportState };

export type WorkerResponse =
  | { type: 'render-complete' }
  | { type: 'layer-ready'; layerName: string }
  | { type: 'error'; error: string };
