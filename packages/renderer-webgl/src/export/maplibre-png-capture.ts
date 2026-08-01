import type {
  CityData,
  ExportCamera,
  ExportSnapshot,
  LayerOptions,
  RenderParams,
  RenderStyleParams,
} from '@vellum/core';
import type { PngExportOptions } from './export-types';

/** Timeout used while waiting for an isolated MapLibre surface to become idle. */
export const EXPORT_CAPTURE_TIMEOUT_MS = 8_000;
const MAX_EXPORT_PIXELS = 64_000_000;

interface PngCaptureInput {
  cityData: CityData;
  activeLayers: RenderParams['activeLayers'];
  style: RenderStyleParams;
  layerOptions: LayerOptions;
  transitDimming: boolean;
  sourceWidth: number;
  sourceHeight: number;
  sourceCamera: ExportCamera;
}

interface PngExportRenderer {
  render(cityData: CityData, params: RenderParams): Promise<void>;
  setTransitDimming(enabled: boolean): void;
  setLayerOptions(options: LayerOptions): void;
  setWatermarkVisibility(visible: boolean): void;
  setCamera(camera: ExportCamera): void;
  applyExportBackground(background: PngExportOptions['background']): void;
  waitForIdle(): Promise<void>;
  captureCanvasBytes(): Promise<Uint8Array>;
  dispose(): void;
}

type PngExportRendererFactory = (
  container: HTMLDivElement,
  style: RenderStyleParams,
) => PngExportRenderer;

/** Captures the current renderer state on an isolated MapLibre surface. */
export async function capturePng(
  input: PngCaptureInput,
  options: PngExportOptions,
  createRenderer: PngExportRendererFactory,
): Promise<Uint8Array> {
  const width = input.sourceWidth * options.scale;
  const height = input.sourceHeight * options.scale;
  validateExportDimensions(width, height);

  const container = createHiddenContainer(width, height);
  const exportRenderer = createRenderer(container, input.style);
  try {
    await exportRenderer.render(input.cityData, {
      activeLayers: input.activeLayers,
    });
    exportRenderer.setTransitDimming(input.transitDimming);
    exportRenderer.setLayerOptions(input.layerOptions);
    if (options.area === 'viewport') {
      exportRenderer.setCamera({ ...input.sourceCamera, pitch: 0 });
    }
    exportRenderer.applyExportBackground(options.background);
    await exportRenderer.waitForIdle();
    return await exportRenderer.captureCanvasBytes();
  } finally {
    exportRenderer.dispose();
    container.remove();
  }
}

/** Captures an immutable export snapshot on an isolated MapLibre surface. */
export async function captureSnapshotPng(
  snapshot: ExportSnapshot,
  options: PngExportOptions,
  signal: AbortSignal,
  createRenderer: PngExportRendererFactory,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  const { width, height } = snapshot.surface;
  validateExportDimensions(width, height, true);

  const container = createHiddenContainer(width, height);
  const exportRenderer = createRenderer(container, snapshot.style);
  try {
    await exportRenderer.render(snapshot.cityData, {
      activeLayers: snapshot.activeLayers,
    });
    throwIfAborted(signal);
    exportRenderer.setTransitDimming(snapshot.transitDimming);
    exportRenderer.setLayerOptions(snapshot.layerOptions);
    exportRenderer.setWatermarkVisibility(snapshot.watermarkVisible);
    if (options.area === 'viewport') {
      exportRenderer.setCamera(snapshot.camera);
    }
    exportRenderer.applyExportBackground(options.background);
    throwIfAborted(signal);
    await exportRenderer.waitForIdle();
    throwIfAborted(signal);
    return await exportRenderer.captureCanvasBytes();
  } finally {
    exportRenderer.dispose();
    container.remove();
  }
}

/** Captures a snapshot through the isolated MapLibre export surface. */
export function captureExportSnapshotPng(
  snapshot: ExportSnapshot,
  options: PngExportOptions,
  signal: AbortSignal,
  createRenderer: PngExportRendererFactory,
): Promise<Uint8Array> {
  return captureSnapshotPng(snapshot, options, signal, createRenderer);
}

function createHiddenContainer(width: number, height: number): HTMLDivElement {
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;`;
  document.body.append(container);
  return container;
}

function validateExportDimensions(
  width: number,
  height: number,
  requirePositive = false,
): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    (requirePositive && (width <= 0 || height <= 0)) ||
    width * height > MAX_EXPORT_PIXELS
  ) {
    throw new Error('Requested export dimensions exceed the safe limit');
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error('Export aborted');
  error.name = 'AbortError';
  throw error;
}
