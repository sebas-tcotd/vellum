export type LayerName = 'terrain' | 'water' | 'roads' | 'transit';

const LAYER_Z_INDEX: Record<LayerName, number> = {
  terrain: 1,
  water: 2,
  roads: 3,
  transit: 4,
};

const LAYERS: LayerName[] = ['terrain', 'water', 'roads', 'transit'];

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
    const size = Math.max(
      this.container.clientWidth || window.innerWidth,
      this.container.clientHeight || window.innerHeight,
    );

    for (const layer of LAYERS) {
      const canvas = document.createElement('canvas');
      canvas.id = `layer-${layer}`;
      canvas.className =
        'absolute top-0 left-0 transition-opacity duration-200';
      canvas.style.zIndex = String(LAYER_Z_INDEX[layer]);
      canvas.style.opacity = '1';
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
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
  resizeDisplay(size: number): void {
    for (const [, canvas] of this.canvases) {
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
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
