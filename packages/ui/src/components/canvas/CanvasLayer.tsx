import React, { useMemo, useRef } from 'react';

export interface CanvasLayerProps {
  layerName: string;
  zIndex: number;
  visible: boolean;
  ariaLabel?: string;
  decorative?: boolean;
}

/**
 * An isolated HTML `<canvas>` element dedicated to rendering a specific map layer.
 *
 * @remarks
 * **CRITICAL INVARIANT:** Never conditionally unmount this component based on
 * `visible`. Unmounting destroys the underlying Canvas 2D / WebGL context.
 * Visibility transitions are handled exclusively via CSS `opacity`.
 *
 * `canvasRef` is exposed so the parent can call `transferControlToOffscreen()`
 * and hand the OffscreenCanvas to the renderer worker.
 */
export const CanvasLayer = React.memo(function CanvasLayer({
  layerName,
  zIndex,
  visible,
  ariaLabel,
  decorative = false,
}: CanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const style = useMemo<React.CSSProperties>(
    () => ({ zIndex, opacity: visible ? 1 : 0 }),
    [zIndex, visible],
  );

  return (
    <canvas
      ref={canvasRef}
      id={`layer-${layerName}`}
      className="absolute inset-0 transition-opacity duration-200"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : ariaLabel}
      aria-hidden={decorative ? true : undefined}
      style={style}
    />
  );
});
