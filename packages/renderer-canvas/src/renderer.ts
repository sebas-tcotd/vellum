import type { IRenderer, CityData, RenderParams } from '@vellum/core';
import { readTokensFromDOM, type RendererTokens } from './tokens';
import type { WorkerMessage, WorkerResponse } from './worker/messages';
// Vite ?worker syntax — bundled as a separate chunk by the app's bundler
import RenderWorker from './worker/renderer-worker?worker';

const EXPECTED_LAYERS = 7; // terrain + water + roads + transit + buildings + forests + districts

export class CanvasRenderer implements IRenderer {
  private tokens: RendererTokens;
  private worker: Worker | null = null;
  private offscreens = new Map<string, OffscreenCanvas>();
  private pendingRender: WorkerMessage | null = null;

  constructor() {
    this.tokens = readTokensFromDOM();
  }

  registerLayer(layerName: string, offscreen: OffscreenCanvas): void {
    this.offscreens.set(layerName, offscreen);
    const worker = this.getOrCreateWorker();
    if (!worker) return;
    worker.postMessage({ type: 'init-layer', layerName, offscreen }, [
      offscreen,
    ]);
    // Flush buffered render only after ALL layers are registered
    if (this.pendingRender && this.offscreens.size >= EXPECTED_LAYERS) {
      worker.postMessage(this.pendingRender);
      this.pendingRender = null;
    }
  }

  private getOrCreateWorker(): Worker | null {
    if (!this.worker) {
      if (typeof Worker === 'undefined') return null;
      const w = new RenderWorker();
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.type === 'error') {
          console.error('[RendererWorker]', e.data.error);
        }
      };
      w.onerror = (e) => {
        console.error('[RendererWorker] worker error', e);
      };
      this.worker = w;
    }
    return this.worker;
  }

  render(cityData: CityData, params: RenderParams): void {
    const worker = this.getOrCreateWorker();
    if (!worker) return;
    const msg: WorkerMessage = {
      type: 'render',
      cityData,
      style: { tokens: this.tokens },
      layers: params.activeLayers,
    };
    if (this.offscreens.size < EXPECTED_LAYERS) {
      this.pendingRender = msg;
      return;
    }
    worker.postMessage(msg);
  }

  updateViewport(zoom: number, panX: number, panY: number): void {
    if (!this.worker) return;
    const msg: WorkerMessage = {
      type: 'update-viewport',
      viewport: { zoom, panX, panY },
    };
    this.worker.postMessage(msg);
  }

  resize(width: number, height: number): void {
    if (!this.worker) return;
    const msg: WorkerMessage = { type: 'resize', width, height };
    this.worker.postMessage(msg);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.offscreens.clear();
    this.pendingRender = null;
  }
}
