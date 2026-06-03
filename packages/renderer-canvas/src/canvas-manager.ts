export type LayerName =
  | 'terrain'
  | 'water'
  | 'roads'
  | 'transit'
  | 'buildings'
  | 'forests'
  | 'districts';

const LAYER_Z_INDEX: Record<LayerName, number> = {
  terrain: 1,
  forests: 2,
  water: 3,
  buildings: 4,
  roads: 5,
  transit: 6,
  districts: 7,
};

const LAYERS: LayerName[] = [
  'terrain',
  'forests',
  'water',
  'buildings',
  'roads',
  'transit',
  'districts',
];

export class CanvasManager {
  private canvases = new Map<LayerName, HTMLCanvasElement>();
  private offscreens = new Map<LayerName, OffscreenCanvas>();
  private pendingTimeouts = new Map<LayerName, ReturnType<typeof setTimeout>>();
  private container: HTMLElement;
  private initialVisibility: Partial<Record<LayerName, boolean>> | undefined;

  constructor(
    container: HTMLElement,
    initialVisibility?: Partial<Record<LayerName, boolean>>,
  ) {
    this.container = container;
    this.initialVisibility = initialVisibility;
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
      canvas.className = 'absolute top-0 left-0';
      canvas.style.transition = 'opacity var(--transition-layer, 200ms ease)';
      canvas.style.zIndex = String(LAYER_Z_INDEX[layer]);
      canvas.style.opacity =
        (this.initialVisibility?.[layer] ?? true) ? '1' : '0';
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

  /**
   * Controls the CSS opacity of a single canvas layer.
   * Supports delayed application for staggered fade animations.
   * @remarks
   * This method only mutates `style.opacity` — it does NOT trigger a worker re-render.
   * If `layer` is not registered in this manager, the call is a silent no-op.
   * Any pending timeout for the same layer is cancelled before scheduling a new one.
   * @param layer - The layer whose visibility to change.
   * @param visible - `true` fades the canvas in (opacity 1), `false` fades it out (opacity 0).
   * @param delayMs - Optional delay in milliseconds before applying the change. Defaults to 0.
   *   Negative or NaN values are treated as 0 (immediate).
   */
  setLayerVisibility(layer: LayerName, visible: boolean, delayMs = 0): void {
    const canvas = this.canvases.get(layer);
    if (!canvas) return;

    const existing = this.pendingTimeouts.get(layer);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.pendingTimeouts.delete(layer);
    }

    const safeDelay = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
    const apply = (): void => {
      this.pendingTimeouts.delete(layer);
      const c = this.canvases.get(layer);
      if (c) c.style.opacity = visible ? '1' : '0';
    };

    if (safeDelay > 0) {
      this.pendingTimeouts.set(layer, setTimeout(apply, safeDelay));
    } else {
      apply();
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
    for (const timeoutId of this.pendingTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.pendingTimeouts.clear();
    for (const [, canvas] of this.canvases) {
      canvas.remove();
    }
    this.canvases.clear();
    this.offscreens.clear();
  }
}
