// Mock Path2D — jsdom does not implement the Canvas 2D geometry API
class MockPath2D {
  readonly calls: Array<{ method: string; args: number[] }> = [];
  moveTo(x: number, y: number) {
    this.calls.push({ method: 'moveTo', args: [x, y] });
  }
  lineTo(x: number, y: number) {
    this.calls.push({ method: 'lineTo', args: [x, y] });
  }
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
    this.calls.push({ method: 'quadraticCurveTo', args: [cpx, cpy, x, y] });
  }
  closePath() {
    this.calls.push({ method: 'closePath', args: [] });
  }
  rect(x: number, y: number, w: number, h: number) {
    this.calls.push({ method: 'rect', args: [x, y, w, h] });
  }
}
global.Path2D = MockPath2D as unknown as typeof Path2D;

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
