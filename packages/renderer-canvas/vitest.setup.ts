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
(globalThis as any).Path2D = MockPath2D;

// Mock ImageData
(globalThis as any).ImageData = class MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
};

// Mock OffscreenCanvas — jsdom does not implement this API
(globalThis as any).OffscreenCanvas = class MockOffscreenCanvas {
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
      putImageData: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      fillStyle: '',
      filter: '',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      canvas: this,
    };
  }
};

// Mock transferControlToOffscreen on HTMLCanvasElement
HTMLCanvasElement.prototype.transferControlToOffscreen = function () {
  return new (globalThis as any).OffscreenCanvas(this.width, this.height);
};
