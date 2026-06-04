import type { IRenderer, CityData, RenderParams } from '@vellum/core';
import { readTokensFromDOM, type RendererTokens } from './tokens';
import { overscanLayout } from './overscan';
import type { WorkerMessage, WorkerResponse } from './worker/messages';
// Vite ?worker syntax — bundled as a separate chunk by the app's bundler
import RenderWorker from './worker/renderer-worker?worker';

const EXPECTED_LAYERS = 7; // terrain + water + roads + transit + buildings + forests + districts

export class CanvasRenderer implements IRenderer {
  private tokens: RendererTokens;
  private worker: Worker | null = null;
  private offscreens = new Map<string, OffscreenCanvas>();
  private pendingRender: WorkerMessage | null = null;
  /** Queued resolve callbacks waiting for the next render-complete from the worker. */
  private renderResolvers: Array<() => void> = [];

  constructor() {
    this.tokens = readTokensFromDOM();
  }

  registerLayer(layerName: string, offscreen: OffscreenCanvas): void {
    this.offscreens.set(layerName, offscreen);
    const worker = this.getOrCreateWorker();
    if (!worker) return;
    const msg: WorkerMessage = { type: 'init-layer', layerName, offscreen };
    worker.postMessage(msg, [offscreen]);
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
        if (e.data.type === 'render-complete') {
          // Resolve all pending render promises — the canvas is fully painted.
          const resolvers = this.renderResolvers.splice(0);
          resolvers.forEach((resolve) => resolve());
        } else if (e.data.type === 'error') {
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

  render(cityData: CityData, params: RenderParams): Promise<void> {
    const worker = this.getOrCreateWorker();
    if (!worker) return Promise.resolve();

    const msg: WorkerMessage = {
      type: 'render',
      cityData,
      style: { tokens: this.tokens },
      layers: params.activeLayers,
    };

    if (this.offscreens.size < EXPECTED_LAYERS) {
      // Layers not yet registered — buffer and resolve immediately
      this.pendingRender = msg;
      return Promise.resolve();
    }

    worker.postMessage(msg);

    return new Promise<void>((resolve) => {
      this.renderResolvers.push(resolve);
    });
  }

  updateViewport(zoom: number, panX: number, panY: number): void {
    if (!this.worker) return;
    const dpr =
      typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const msg: WorkerMessage = {
      type: 'update-viewport',
      viewport: { zoom, panX: panX * dpr, panY: panY * dpr },
    };
    this.worker.postMessage(msg);
  }

  /**
   * Resizes the offscreen canvases to an overscan **buffer** larger than the
   * fit (viewport) size, so the worker paints a margin of map content around the
   * viewport. `width`/`height` are the fit dimensions (physical px); the buffer is
   * `round(fit · OVERSCAN_FACTOR)`. The worker derives the margin from the shared
   * factor — see `overscan.ts`.
   */
  resize(width: number, height: number): void {
    if (!this.worker) return;
    const msg: WorkerMessage = {
      type: 'resize',
      width: overscanLayout(width).buffer,
      height: overscanLayout(height).buffer,
    };
    this.worker.postMessage(msg);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.offscreens.clear();
    this.pendingRender = null;
    this.renderResolvers = [];
  }
}
