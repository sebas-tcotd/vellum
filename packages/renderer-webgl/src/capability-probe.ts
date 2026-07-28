import {
  evaluateTiledCapability,
  type CapabilityReport,
  type ExportSurface,
  type TiledCapabilityDecision,
} from '@vellum/core';

/** Optional dependencies used to make the capability probe deterministic in tests. */
export interface CapabilityProbeOptions {
  /** Creates the disposable canvas used by the probe. */
  readonly createSurface?: () => HTMLCanvasElement;
  /** Supplies an optional platform memory measurement. */
  readonly readMemory?: () => number | 'unknown';
  /** Minimum time allowed for the asynchronous PNG encoder. */
  readonly toBlobTimeoutMs?: number;
}

interface PerformanceMemory {
  jsHeapSizeLimit: number;
  usedJSHeapSize: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

function readAvailableMemory(): number | 'unknown' {
  const memory = (globalThis.performance as PerformanceWithMemory | undefined)
    ?.memory;
  if (!memory) return 'unknown';
  const available = memory.jsHeapSizeLimit - memory.usedJSHeapSize;
  return Number.isFinite(available) && available >= 0 ? available : 'unknown';
}

function readLimits(
  context: WebGLRenderingContext | null,
): Pick<
  CapabilityReport,
  'maxTextureSize' | 'maxRenderbufferSize' | 'maxViewportDims' | 'maxCanvasSize'
> {
  if (!context) {
    return {
      maxTextureSize: 'unknown',
      maxRenderbufferSize: 'unknown',
      maxViewportDims: 'unknown',
      maxCanvasSize: 'unknown',
    };
  }
  const texture = context.getParameter(context.MAX_TEXTURE_SIZE);
  const renderbuffer = context.getParameter(context.MAX_RENDERBUFFER_SIZE);
  const viewport = context.getParameter(context.MAX_VIEWPORT_DIMS);
  const maxTextureSize = typeof texture === 'number' ? texture : 'unknown';
  const maxRenderbufferSize =
    typeof renderbuffer === 'number' ? renderbuffer : 'unknown';
  const maxViewportDims =
    viewport instanceof Int32Array && viewport.length >= 2
      ? ([viewport[0], viewport[1]] as const)
      : 'unknown';
  const candidates = [
    maxTextureSize,
    maxRenderbufferSize,
    ...(maxViewportDims === 'unknown' ? [] : maxViewportDims),
  ].filter((value): value is number => typeof value === 'number' && value > 0);
  return {
    maxTextureSize,
    maxRenderbufferSize,
    maxViewportDims,
    maxCanvasSize: candidates.length > 0 ? Math.min(...candidates) : 'unknown',
  };
}

function canEncodePng(
  surface: HTMLCanvasElement,
  probeSize: number,
  timeoutMs: number,
): Promise<boolean | 'unknown'> {
  if (typeof surface.toBlob !== 'function') return Promise.resolve('unknown');
  surface.width = probeSize;
  surface.height = probeSize;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean | 'unknown'): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      surface.toBlob((blob) => finish(blob !== null), 'image/png');
    } catch {
      finish(false);
    }
    setTimeout(() => finish('unknown'), timeoutMs);
  });
}

/** Measures real WebGL limits on a temporary surface and always releases it. */
export async function probeCapabilities(
  options: CapabilityProbeOptions = {},
): Promise<CapabilityReport> {
  if (typeof document === 'undefined' && !options.createSurface) {
    return {
      contextType: 'unknown',
      webgl2: false,
      maxTextureSize: 'unknown',
      maxRenderbufferSize: 'unknown',
      maxViewportDims: 'unknown',
      maxCanvasSize: 'unknown',
      toBlob: 'unknown',
      memoryAvailableBytes: options.readMemory?.() ?? 'unknown',
      unknownReason: 'document-unavailable',
    };
  }

  const surface = options.createSurface?.() ?? document.createElement('canvas');
  surface.width = 1;
  surface.height = 1;
  if (typeof document !== 'undefined') document.body?.append(surface);
  let context: WebGLRenderingContext | null = null;
  let contextType: CapabilityReport['contextType'] = 'unknown';
  try {
    const webgl2 = surface.getContext('webgl2');
    if (webgl2) {
      context = webgl2;
      contextType = 'webgl2';
    } else {
      const webgl = surface.getContext('webgl');
      if (webgl) {
        context = webgl;
        contextType = 'webgl';
      }
    }
    const limits = readLimits(context);
    const probeSize =
      typeof limits.maxCanvasSize === 'number'
        ? Math.min(limits.maxCanvasSize, 2048)
        : 2048;
    return {
      contextType,
      webgl2: contextType === 'webgl2',
      ...limits,
      toBlob: await canEncodePng(
        surface,
        Math.max(1, probeSize),
        Math.max(2000, options.toBlobTimeoutMs ?? 2000),
      ),
      memoryAvailableBytes: options.readMemory?.() ?? readAvailableMemory(),
      ...(context ? {} : { unknownReason: 'webgl-context-unavailable' }),
    };
  } finally {
    try {
      const loseContext = context?.getExtension('WEBGL_lose_context');
      loseContext?.loseContext();
    } catch {
      // A driver may reject context loss during teardown; surface cleanup still runs.
    } finally {
      try {
        surface.remove();
      } catch {
        // A detached or test-provided surface may reject removal during teardown.
      }
    }
  }
}

/** Stateless capability probe facade used by the composition root. */
export class CapabilityProbe {
  private readonly options: CapabilityProbeOptions;

  /** Creates a probe with optional injectable surface and memory readers. */
  constructor(options: CapabilityProbeOptions = {}) {
    this.options = options;
  }

  /** Measures a disposable WebGL surface. */
  measure(): Promise<CapabilityReport> {
    return probeCapabilities(this.options);
  }

  /** Evaluates a measured report for a requested output surface. */
  decide(
    report: CapabilityReport,
    surface: ExportSurface,
    enabled = true,
  ): TiledCapabilityDecision {
    return evaluateTiledCapability(report, surface, enabled);
  }
}
