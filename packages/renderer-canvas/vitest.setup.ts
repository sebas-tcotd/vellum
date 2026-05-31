// Mock OffscreenCanvas — jsdom does not implement this API
global.OffscreenCanvas = class MockOffscreenCanvas {
  width = 0;
  height = 0;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return {
      scale: () => {},
      clearRect: () => {},
      fillRect: () => {},
      fillStyle: '',
      canvas: this,
    };
  }
} as unknown as typeof OffscreenCanvas;

// Mock transferControlToOffscreen on HTMLCanvasElement
HTMLCanvasElement.prototype.transferControlToOffscreen = function () {
  return new (global.OffscreenCanvas as unknown as new (
    w: number,
    h: number,
  ) => OffscreenCanvas)(this.width, this.height);
};
