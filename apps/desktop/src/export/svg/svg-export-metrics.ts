/**
 * Aggregated, privacy-safe measurements for one SVG export run.
 *
 * @remarks
 * AC 10 asks for duration, final size and peak memory, and is explicit about
 * what must *not* be recorded: no path, no city name, no `CityData` content.
 * Every field here is a number for exactly that reason — there is nothing in
 * this shape that could carry a user's data even by accident.
 */
export interface SvgExportMetrics {
  /** Wall-clock duration of the operation, in milliseconds. */
  readonly durationMs: number;
  /** Size of the published document, in UTF-8 bytes. */
  readonly byteLength: number;
  /** Number of chunks streamed across the IPC boundary. */
  readonly chunks: number;
  /** Peak JS heap in bytes while the export ran, or `unknown` off Chromium. */
  readonly peakMemoryBytes: number | 'unknown';
}

/** Chromium's non-standard heap counter; absent everywhere else. */
interface PerformanceMemory {
  readonly usedJSHeapSize?: number;
}

/**
 * Reads the current JS heap size when the platform exposes it.
 *
 * @remarks
 * `performance.memory` is Chromium-only and unspecified. The WebView Tauri
 * ships on macOS is WebKit, where this is simply absent — hence `'unknown'`
 * rather than a fabricated zero, which would read as "no memory used".
 *
 * @returns Bytes currently allocated, or `'unknown'` when unobservable.
 */
export function readPeakMemoryBytes(): number | 'unknown' {
  const memory = (performance as Performance & { memory?: PerformanceMemory })
    .memory;
  const used = memory?.usedJSHeapSize;
  return typeof used === 'number' && Number.isFinite(used) ? used : 'unknown';
}

/**
 * Picks the larger of two possibly-unobservable readings.
 *
 * @param a - First reading.
 * @param b - Second reading.
 * @returns The peak, or `'unknown'` when neither could be observed.
 */
export function peakOf(
  a: number | 'unknown',
  b: number | 'unknown',
): number | 'unknown' {
  if (a === 'unknown') return b;
  if (b === 'unknown') return a;
  return Math.max(a, b);
}
