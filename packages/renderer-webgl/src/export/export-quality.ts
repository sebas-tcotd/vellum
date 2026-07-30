import type { CapabilityReport, TilePlanTile } from '@vellum/core';

/** Hard ceiling for one decoded RGBA tile, matching the TS and Rust composers. */
export const MAX_TILE_RGBA_BYTES = 32 * 1024 * 1024;

/** Hard ceiling for buffers retained by one Rust export session. */
export const MAX_SESSION_BYTES = 256 * 1024 * 1024;

/** Quality post-processing options used only by benchmark and test callers. */
export interface ExportQualityConfig {
  /** Enables the experimental quality path; omitted means disabled. */
  readonly enabled?: boolean;
  /** Fixed supersampling factor. The factor is never silently reduced. */
  readonly ssaa?: 1 | 2 | 4;
  /** Deterministic filter applied after decoding/downsampling. */
  readonly filter?: 'box-3x3';
  /** Browser codec override used by tests and benchmark adapters. */
  readonly codec?: RasterQualityCodec;
  /** Optional phase hook used by benchmark/test adapters to observe quality work. */
  readonly onPhase?: (phase: ExportQualityPhase) => void;
}

/** Cooperative phases exposed by the quality benchmark path. */
export type ExportQualityPhase =
  | 'decoding'
  | 'downsampling'
  | 'filtering'
  | 'encoding';

/** RGBA image exchanged by browser-safe quality processing stages. */
export interface RasterImage {
  /** Image width in pixels. */
  readonly width: number;
  /** Image height in pixels. */
  readonly height: number;
  /** Row-major, unpremultiplied RGBA bytes. */
  readonly pixels: Uint8Array;
}

/** Browser codec boundary, injectable so unit tests never require WebGL or PNG libraries. */
export interface RasterQualityCodec {
  /** Decodes PNG bytes to measured RGBA dimensions and pixels. */
  decode(encodedPng: Uint8Array, signal: AbortSignal): Promise<RasterImage>;
  /** Encodes an exact RGBA image to PNG bytes. */
  encode(image: RasterImage, signal: AbortSignal): Promise<Uint8Array>;
}

/** Result of checking a fixed quality variant before allocating a capture surface. */
export interface QualityPreflight {
  /** Whether the requested variant may run for this tile. */
  readonly eligible: boolean;
  /** Explicit reason when the variant is not eligible. */
  readonly reason?: QualityRejectionReason;
  /** Fixed factor reported to benchmark callers. */
  readonly factor: number;
  /** Physical width requested from the hidden renderer. */
  readonly physicalWidth: number;
  /** Physical height requested from the hidden renderer. */
  readonly physicalHeight: number;
}

/** Reasons a quality variant must fall back to the unchanged base capture. */
export type QualityRejectionReason =
  | 'flag'
  | 'configuration'
  | 'capability'
  | 'gpu-limit'
  | 'tile-budget'
  | 'session-budget';

/** Error raised when a quality capture cannot be trusted as the requested variant. */
export class QualityVariantError extends Error {
  /** Creates a typed quality-variant failure. */
  constructor(message: string) {
    super(message);
    this.name = 'QualityVariantError';
  }
}

/** Computes physical dimensions and checks every measured GPU and memory limit. */
export function preflightQuality(
  tile: TilePlanTile,
  capability: CapabilityReport,
  config: ExportQualityConfig,
): QualityPreflight {
  const factor = config.ssaa ?? 1;
  const dimensions = scaledDimensions(tile, factor);
  if (config.enabled !== true) return rejected('flag', dimensions, factor);
  if (factor !== 1 && factor !== 2 && factor !== 4)
    return rejected('configuration', dimensions, factor);
  if (factor === 1 && config.filter === undefined)
    return rejected('configuration', dimensions, factor);
  if (factor > 1) {
    if (!hasMeasuredLimits(capability))
      return rejected('capability', dimensions, factor);
    if (
      !fitsGpuLimits(
        dimensions.physicalWidth,
        dimensions.physicalHeight,
        capability,
      )
    )
      return rejected('gpu-limit', dimensions, factor);
  }
  const physicalBytes =
    dimensions.physicalWidth * dimensions.physicalHeight * 4;
  if (physicalBytes > MAX_TILE_RGBA_BYTES)
    return rejected('tile-budget', dimensions, factor);
  // This is a conservative JS/WebView footprint guard. Rust receives only
  // the final logical tile, so it does not double-count the physical buffer.
  const qualityBufferFootprintBytes = physicalBytes + tileBytes(tile);
  if (qualityBufferFootprintBytes > MAX_SESSION_BYTES)
    return rejected('session-budget', dimensions, factor);
  return { eligible: true, ...dimensions, factor };
}

/** Decodes, optionally downsamples, filters, and re-encodes one quality tile. */
export async function processQualityPng(
  encodedPng: Uint8Array,
  tile: TilePlanTile,
  config: ExportQualityConfig,
  codec: RasterQualityCodec,
  signal: AbortSignal,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  announcePhase(config, 'decoding', signal);
  const decoded = await codec.decode(encodedPng, signal);
  throwIfAborted(signal);
  const factor = config.ssaa ?? 1;
  assertDimensions(decoded, tile, factor);
  let processed = decoded;
  if (factor > 1) {
    announcePhase(config, 'downsampling', signal);
    processed = await downsampleRgba(decoded, factor, signal);
  }
  if (config.filter !== undefined) {
    announcePhase(config, 'filtering', signal);
    processed = await applyBoxFilter(processed, signal);
  }
  assertFinalDimensions(processed, tile);
  throwIfAborted(signal);
  announcePhase(config, 'encoding', signal);
  return codec.encode(processed, signal);
}

/** Downsamples an integer-factor image with premultiplied-alpha averaging. */
export async function downsampleRgba(
  source: RasterImage,
  factor: number,
  signal: AbortSignal,
): Promise<RasterImage> {
  if (!Number.isInteger(factor) || factor < 1)
    throw new QualityVariantError('SSAA factor must be a positive integer');
  if (source.width % factor !== 0 || source.height % factor !== 0)
    throw new QualityVariantError(
      'SSAA source dimensions must be divisible by the factor',
    );
  const width = Math.floor(source.width / factor);
  const height = Math.floor(source.height / factor);
  if (width < 1 || height < 1)
    throw new QualityVariantError('SSAA output dimensions are empty');
  const output = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    throwIfAborted(signal);
    downsampleRow(source, output, factor, y, width);
    if (y % 32 === 0) await Promise.resolve();
  }
  throwIfAborted(signal);
  return { width, height, pixels: output };
}

/** Applies a deterministic 3×3 premultiplied-alpha box filter in place logically. */
export async function applyBoxFilter(
  source: RasterImage,
  signal: AbortSignal,
): Promise<RasterImage> {
  const output = new Uint8Array(source.pixels.length);
  for (let y = 0; y < source.height; y += 1) {
    throwIfAborted(signal);
    filterRow(source, output, y);
    if (y % 32 === 0) await Promise.resolve();
  }
  throwIfAborted(signal);
  return { ...source, pixels: output };
}

/** Creates the production WebView codec without importing Node-only PNG modules. */
export function createBrowserPngCodec(): RasterQualityCodec {
  return { decode: decodeBrowserPng, encode: encodeBrowserPng };
}

function scaledDimensions(
  tile: TilePlanTile,
  factor: number,
): {
  physicalWidth: number;
  physicalHeight: number;
} {
  return {
    physicalWidth: tile.renderRect.width * factor,
    physicalHeight: tile.renderRect.height * factor,
  };
}

function rejected(
  reason: QualityRejectionReason,
  dimensions: { physicalWidth: number; physicalHeight: number },
  factor: number,
): QualityPreflight {
  return {
    eligible: false,
    reason,
    factor,
    physicalWidth: dimensions.physicalWidth,
    physicalHeight: dimensions.physicalHeight,
  };
}

function hasMeasuredLimits(capability: CapabilityReport): boolean {
  return (
    capability.maxTextureSize !== 'unknown' &&
    capability.maxRenderbufferSize !== 'unknown' &&
    capability.maxCanvasSize !== 'unknown' &&
    capability.maxViewportDims !== 'unknown'
  );
}

function fitsGpuLimits(
  width: number,
  height: number,
  capability: CapabilityReport,
): boolean {
  if (!hasMeasuredLimits(capability)) return false;
  const maxTextureSize = capability.maxTextureSize;
  const maxRenderbufferSize = capability.maxRenderbufferSize;
  const maxCanvasSize = capability.maxCanvasSize;
  const maxViewportDims = capability.maxViewportDims;
  if (
    maxTextureSize === 'unknown' ||
    maxRenderbufferSize === 'unknown' ||
    maxCanvasSize === 'unknown' ||
    maxViewportDims === 'unknown'
  )
    return false;
  const limits = [maxTextureSize, maxRenderbufferSize, maxCanvasSize];
  return (
    limits.every((limit) => width <= limit && height <= limit) &&
    width <= maxViewportDims[0] &&
    height <= maxViewportDims[1]
  );
}

function tileBytes(tile: TilePlanTile): number {
  return tile.renderRect.width * tile.renderRect.height * 4;
}

function assertDimensions(
  image: RasterImage,
  tile: TilePlanTile,
  factor: number,
): void {
  const expected = scaledDimensions(tile, factor);
  if (
    image.width !== expected.physicalWidth ||
    image.height !== expected.physicalHeight
  )
    throw new QualityVariantError(
      'Physical capture measured ' +
        image.width +
        'x' +
        image.height +
        '; expected ' +
        expected.physicalWidth +
        'x' +
        expected.physicalHeight,
    );
  const expectedPixelBytes = image.width * image.height * 4;
  if (image.pixels.length < expectedPixelBytes)
    throw new QualityVariantError(
      'Physical capture pixel buffer is shorter than its dimensions',
    );
}

function assertFinalDimensions(image: RasterImage, tile: TilePlanTile): void {
  if (
    image.width !== tile.renderRect.width ||
    image.height !== tile.renderRect.height
  )
    throw new QualityVariantError(
      'Quality capture changed planned tile dimensions',
    );
}

function downsampleRow(
  source: RasterImage,
  output: Uint8Array,
  factor: number,
  y: number,
  width: number,
): void {
  for (let x = 0; x < width; x += 1) {
    let alpha = 0;
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let sy = y * factor; sy < (y + 1) * factor; sy += 1)
      for (let sx = x * factor; sx < (x + 1) * factor; sx += 1) {
        const offset = (sy * source.width + sx) * 4;
        const weight = source.pixels[offset + 3];
        alpha += weight;
        red += source.pixels[offset] * weight;
        green += source.pixels[offset + 1] * weight;
        blue += source.pixels[offset + 2] * weight;
      }
    const outputOffset = (y * width + x) * 4;
    writePremultiplied(
      output,
      outputOffset,
      red,
      green,
      blue,
      alpha,
      factor * factor,
    );
  }
}

function filterRow(source: RasterImage, output: Uint8Array, y: number): void {
  for (let x = 0; x < source.width; x += 1) {
    let alpha = 0;
    let red = 0;
    let green = 0;
    let blue = 0;
    let samples = 0;
    for (
      let sy = Math.max(0, y - 1);
      sy <= Math.min(source.height - 1, y + 1);
      sy += 1
    )
      for (
        let sx = Math.max(0, x - 1);
        sx <= Math.min(source.width - 1, x + 1);
        sx += 1
      ) {
        samples += 1;
        const offset = (sy * source.width + sx) * 4;
        const weight = source.pixels[offset + 3];
        alpha += weight;
        red += source.pixels[offset] * weight;
        green += source.pixels[offset + 1] * weight;
        blue += source.pixels[offset + 2] * weight;
      }
    writePremultiplied(
      output,
      (y * source.width + x) * 4,
      red,
      green,
      blue,
      alpha,
      samples,
    );
  }
}

function writePremultiplied(
  output: Uint8Array,
  offset: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
  samples: number,
): void {
  const averageAlpha = Math.round(alpha / samples);
  output[offset] = alpha === 0 ? 0 : Math.round(red / alpha);
  output[offset + 1] = alpha === 0 ? 0 : Math.round(green / alpha);
  output[offset + 2] = alpha === 0 ? 0 : Math.round(blue / alpha);
  output[offset + 3] = averageAlpha;
}

async function decodeBrowserPng(
  encodedPng: Uint8Array,
  signal: AbortSignal,
): Promise<RasterImage> {
  throwIfAborted(signal);
  if (typeof createImageBitmap !== 'function')
    throw new QualityVariantError('createImageBitmap is unavailable');
  const bitmap = await createImageBitmap(new Blob([encodedPng]));
  try {
    throwIfAborted(signal);
    const canvas = createCanvas(bitmap.width, bitmap.height);
    const context = get2dContext(canvas);
    context.clearRect(0, 0, bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: new Uint8Array(data.data),
    };
  } finally {
    bitmap.close();
  }
}

async function encodeBrowserPng(
  image: RasterImage,
  signal: AbortSignal,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  const canvas = createCanvas(image.width, image.height);
  const context = get2dContext(canvas);
  context.putImageData(
    new ImageData(
      new Uint8ClampedArray(image.pixels),
      image.width,
      image.height,
    ),
    0,
    0,
  );
  throwIfAborted(signal);
  const blob = await canvasToBlob(canvas);
  throwIfAborted(signal);
  return new Uint8Array(await blob.arrayBuffer());
}

function createCanvas(
  width: number,
  height: number,
): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined')
    return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function get2dContext(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !('getImageData' in context))
    throw new QualityVariantError('2D canvas context is unavailable');
  return context;
}

function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<Blob> {
  if ('convertToBlob' in canvas)
    return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new QualityVariantError('PNG encoding returned no blob'));
    }, 'image/png');
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error('Export aborted');
  error.name = 'AbortError';
  throw error;
}

function announcePhase(
  config: ExportQualityConfig,
  phase: ExportQualityPhase,
  signal: AbortSignal,
): void {
  throwIfAborted(signal);
  config.onPhase?.(phase);
  throwIfAborted(signal);
}
