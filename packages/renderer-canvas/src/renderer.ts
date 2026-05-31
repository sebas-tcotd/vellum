import type { IRenderer, CityData, RenderParams } from '@vellum/core';
import { readTokensFromDOM, type RendererTokens } from './tokens';
import type { WorkerMessage, WorkerResponse } from './worker/messages';

export class CanvasRenderer implements IRenderer {
  private tokens: RendererTokens;
  private worker: Worker | null = null;
  private offscreens = new Map<string, OffscreenCanvas>();

  constructor() {
    this.tokens = readTokensFromDOM();
  }

  /**
   * Register an OffscreenCanvas for a named layer.
   * Must be called before render() for each layer.
   */
  registerLayer(layerName: string, offscreen: OffscreenCanvas): void {
    this.offscreens.set(layerName, offscreen);
    if (this.worker) {
      this.worker.postMessage({ type: 'init-layer', layerName, offscreen }, [
        offscreen,
      ]);
    }
  }

  private getOrCreateWorker(): Worker | null {
    if (!this.worker) {
      if (typeof Worker === 'undefined') return null;
      // Dynamic import with Vite worker syntax — bundled as a separate chunk
      this.worker = new Worker(
        new URL('./worker/renderer-worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.type === 'error') {
          console.error('[RendererWorker]', e.data.error);
        }
      };
      // Send any already-registered offscreens
      for (const [layerName, offscreen] of this.offscreens) {
        this.worker.postMessage({ type: 'init-layer', layerName, offscreen }, [
          offscreen,
        ]);
      }
      this.offscreens.clear();
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
  }
}
