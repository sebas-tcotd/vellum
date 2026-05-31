import type { WorkerMessage, WorkerResponse } from './messages';
import { renderTerrainLayer } from '../layers/terrain-layer';
import { renderWaterLayer } from '../layers/water-layer';

interface LayerCanvas {
  offscreen: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
}

const layers = new Map<string, LayerCanvas>();
let canvasWidth = 800;
let canvasHeight = 600;

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  try {
    if (msg.type === 'render') {
      const { cityData, style, layers: layerVisibility } = msg;

      for (const [layerName, canvas] of layers) {
        const ctx = canvas.ctx;
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        if (layerName === 'terrain' && layerVisibility.terrain) {
          renderTerrainLayer(
            ctx,
            cityData.landTiles,
            cityData.bounds,
            style.tokens,
            canvasWidth,
            canvasHeight,
          );
        } else if (layerName === 'water' && layerVisibility.water) {
          renderWaterLayer(
            ctx,
            cityData.waterTiles,
            cityData.bounds,
            style.tokens,
            canvasWidth,
            canvasHeight,
          );
        }

        const response: WorkerResponse = { type: 'layer-ready', layerName };
        self.postMessage(response);
      }

      const done: WorkerResponse = { type: 'render-complete' };
      self.postMessage(done);
    } else if (msg.type === 'resize') {
      canvasWidth = msg.width;
      canvasHeight = msg.height;
      for (const [, layer] of layers) {
        layer.offscreen.width = msg.width;
        layer.offscreen.height = msg.height;
      }
    } else if (msg.type === 'update-viewport') {
      // Viewport updates will be used for pan/zoom in Story 4.4
    }
  } catch (err) {
    const error: WorkerResponse = {
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(error);
  }
};

// Register an offscreen canvas for a layer
self.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.type === 'init-layer') {
    const { layerName, offscreen } = event.data as {
      type: 'init-layer';
      layerName: string;
      offscreen: OffscreenCanvas;
    };
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      layers.set(layerName, { offscreen, ctx });
    }
  }
});

export {};
