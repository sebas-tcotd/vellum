import React, { useMemo, useRef } from 'react';

/**
 * Component properties for {@link CanvasLayer}.
 */
export interface CanvasLayerProps {
  /**
   * The logical identifier for this rendering layer.
   * @remarks
   * Maps conceptually to `LayerName` from `@vellum/core`
   * (e.g., `'terrain'`, `'roads'`, `'transit'`).
   * This value also determines the DOM `id` attribute: `layer-{layerName}`.
   */
  layerName: string;
  /**
   * The CSS `z-index` value controlling the stacking order relative to other layers.
   */
  zIndex: number;
  /**
   * Whether the layer is visually active.
   * @remarks
   * Controls CSS `opacity` only. The canvas element is **never** unmounted when
   * `visible` is `false` — unmounting destroys the Canvas 2D / WebGL context.
   */
  visible: boolean;
  /**
   * Accessible label announced by screen readers (WCAG 2.1 AA).
   * @remarks
   * Required for non-decorative layers. Omit this prop when `decorative` is `true`.
   * Provided by the parent via `t('a11y.mapCanvas')`.
   */
  ariaLabel?: string;
  /**
   * When `true`, marks the layer as purely decorative and removes it from the
   * accessibility tree via `aria-hidden`. `role` and `aria-label` are ignored.
   * @default false
   */
  decorative?: boolean;
}

/** Static styles shared across all instances — defined outside the component to avoid re-allocation. */
const BASE_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  transition: 'opacity 200ms ease',
};

/**
 * An isolated HTML `<canvas>` element dedicated to rendering a specific map layer.
 *
 * @remarks
 * **CRITICAL INVARIANT:** Never conditionally unmount this component based on
 * `visible`. Unmounting destroys the underlying Canvas 2D / WebGL context.
 * Visibility transitions are handled exclusively via CSS `opacity`.
 *
 * **Future (Story 3.x):** `canvasRef` will be passed to
 * `canvas.transferControlToOffscreen()` and handed to the `@vellum/renderer-canvas`
 * worker port so rendering stays off the main thread.
 *
 * @param props - See {@link CanvasLayerProps}.
 * @returns A positioned `<canvas>` element with appropriate accessibility attributes.
 */
export const CanvasLayer = React.memo(function CanvasLayer({
  layerName,
  zIndex,
  visible,
  ariaLabel,
  decorative = false,
}: CanvasLayerProps) {
  // NOTE: Story 3.x — pass to canvas.transferControlToOffscreen() for off-main-thread rendering
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const style = useMemo<React.CSSProperties>(
    () => ({ ...BASE_STYLE, zIndex, opacity: visible ? 1 : 0 }),
    [zIndex, visible],
  );

  return (
    <canvas
      ref={canvasRef}
      id={`layer-${layerName}`}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : ariaLabel}
      aria-hidden={decorative ? true : undefined}
      style={style}
    />
  );
});
