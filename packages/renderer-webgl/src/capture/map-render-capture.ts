import type maplibregl from 'maplibre-gl';

/** Handle for a capture that can be cancelled during renderer disposal. */
export interface PendingMapCapture<T> {
  /** Resolves with the frame result or the configured fallback. */
  readonly promise: Promise<T>;
  /** Removes the pending MapLibre listener and settles with the fallback. */
  cancel(): void;
}

/** Waits for one MapLibre render event and captures the resulting frame. */
export function captureOnNextRender<T>(
  map: maplibregl.Map,
  timeoutMs: number,
  capture: () => T | Promise<T>,
  fallback: (cause?: unknown) => T,
): PendingMapCapture<T> {
  let finish: () => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = (): boolean => {
      if (settled) return false;
      settled = true;
      clearTimeout(timeout);
      try {
        map.off('render', handleRender);
      } catch {
        // MapLibre may have been removed while React is unmounting.
      }
      return true;
    };
    const complete = (value: T): void => {
      if (!cleanup()) return;
      resolve(value);
    };
    const completeFallback = (cause?: unknown): void => {
      try {
        complete(fallback(cause));
      } catch (error: unknown) {
        if (!cleanup()) return;
        reject(error);
      }
    };
    const handleRender = (): void => {
      void Promise.resolve(capture()).then(complete, completeFallback);
    };
    const timeout = setTimeout(() => completeFallback(), timeoutMs);
    finish = () => completeFallback();
    try {
      map.once('render', handleRender);
      map.triggerRepaint();
    } catch {
      completeFallback();
    }
  });
  return { promise, cancel: () => finish() };
}

/** Encodes the next rendered WebGL frame as PNG bytes. */
export function captureCanvasOnNextRender(
  map: maplibregl.Map,
  timeoutMs: number,
): Promise<Uint8Array> {
  return captureOnNextRender(
    map,
    timeoutMs,
    () => canvasToPngBytes(map.getCanvas()),
    (cause) => {
      if (cause instanceof Error) throw cause;
      throw new Error('PNG capture timed out');
    },
  ).promise;
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('PNG encoding failed'));
        return;
      }
      void blob.arrayBuffer().then(
        (buffer) => resolve(new Uint8Array(buffer)),
        () => reject(new Error('PNG encoding failed')),
      );
    }, 'image/png');
  });
}
