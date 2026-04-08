import { useEffect, useRef } from 'react';

/**
 * Manages a `requestAnimationFrame` loop that invokes `onTick` on every frame.
 *
 * @remarks
 * The loop starts on mount and is automatically cancelled when the host component
 * unmounts. An `isActiveRef` guard prevents stale-closure callbacks from firing
 * after cleanup (e.g., during React strict-mode double-invoke or fast-refresh).
 *
 * The latest `onTick` reference is captured into a ref on every render, so callers
 * do **not** need to stabilise the callback with `useCallback` — though doing so
 * is still recommended to avoid unnecessary closure allocations.
 *
 * @param onTick - Callback invoked once per animation frame. Receives no arguments.
 *
 * @example
 * ```tsx
 * const viewportRef = useRef<ViewportState>({ zoom: 1, panX: 0, panY: 0 });
 *
 * useRenderLoop(useCallback(() => {
 *   renderer.updateViewport(viewportRef.current);
 * }, [renderer]));
 * ```
 */
export function useRenderLoop(onTick: () => void): void {
  const isActiveRef = useRef(true);
  // Store the latest onTick in a ref so the RAF closure never goes stale
  // without restarting the loop.
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    isActiveRef.current = true;
    let rafId: number;

    const tick = () => {
      if (!isActiveRef.current) return;
      onTickRef.current();
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      isActiveRef.current = false;
      cancelAnimationFrame(rafId);
    };
  }, []);
}
