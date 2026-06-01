export type LayerName = 'terrain' | 'water';

const LAYER_Z_INDEX: Record<LayerName, number> = {
  terrain: 1,
  water: 2,
};

const LAYERS: LayerName[] = ['terrain', 'water'];

export class CanvasManager {
  private canvases = new Map<LayerName, HTMLCanvasElement>();
  private offscreens = new Map<LayerName, OffscreenCanvas>();
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.create();
  }

  private create(): void {
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = this.container.clientWidth || 800;
    const logicalHeight = this.container.clientHeight || 600;

    for (const layer of LAYERS) {
      const canvas = document.createElement('canvas');
      canvas.id = `layer-${layer}`;
      canvas.className = 'absolute inset-0 transition-opacity duration-200';
      canvas.style.zIndex = String(LAYER_Z_INDEX[layer]);
      canvas.style.opacity = '1';
      canvas.style.width = `${logicalWidth}px`;
      canvas.style.height = `${logicalHeight}px`;
      canvas.width = logicalWidth * dpr;
      canvas.height = logicalHeight * dpr;
      this.container.appendChild(canvas);
      this.canvases.set(layer, canvas);

      const offscreen = canvas.transferControlToOffscreen();
      this.offscreens.set(layer, offscreen);
    }
  }

  getOffscreen(layer: LayerName): OffscreenCanvas | undefined {
    return this.offscreens.get(layer);
  }

  getCanvas(layer: LayerName): HTMLCanvasElement | undefined {
    return this.canvases.get(layer);
  }

  // Updates only the CSS display size. Physical dimensions are owned by the
  // worker after transferControlToOffscreen() — use renderer.resize() for those.
  resizeDisplay(logicalWidth: number, logicalHeight: number): void {
    for (const [, canvas] of this.canvases) {
      canvas.style.width = `${logicalWidth}px`;
      canvas.style.height = `${logicalHeight}px`;
    }
  }

  destroy(): void {
    for (const [, canvas] of this.canvases) {
      canvas.remove();
    }
    this.canvases.clear();
    this.offscreens.clear();
  }
}
