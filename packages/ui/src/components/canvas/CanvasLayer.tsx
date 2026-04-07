import { useRef } from 'react';

/**
 * Component properties for {@link CanvasLayer}.
 */
export interface CanvasLayerProps {
  /**
   * The logical identifier for this rendering layer.
   * @remarks
   * Maps conceptually to `LayerName` from `@vellum/core` (e.g., 'terrain', 'roads', 'transit').
   */
  layerName: string;
  /**
   * The CSS z-index dictating the absolute stacking order of this canvas relative to others.
   */
  zIndex: number;
  /**
   * Determines if the layer should be visually active.
   * @remarks
   * Controls CSS `opacity` exclusively. It does NOT govern the React DOM mounting state.
   */
  visible: boolean;
  /**
   * Accessible label for the canvas element (WCAG 2.1 AA — AC Task 7).
   * Provided by the parent via `t('a11y.mapCanvas')`.
   * @default ""
   */
  ariaLabel?: string;
}

/**
 * An isolated HTML `<canvas>` element dedicated to rendering a specific map layer.
 * @remarks
 * **CRITICAL INVARIANT:** This component must NEVER be conditionally unmounted from the DOM
 * based on its visibility state. Unmounting destroys the underlying Canvas 2D / WebGL context.
 * Visibility transitions are strictly handled via CSS `opacity`.
 * **Future Implementation (Story 3.x):** The internal `canvasRef` will be utilized to extract the offscreen context
 * (via `transferControlToOffscreen()`) and passed down to the `@vellum/renderer-canvas`
 * port to ensure rendering operations remain off the main React thread.
 */
export function CanvasLayer({
  layerName,
  zIndex,
  visible,
  ariaLabel = '',
}: CanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // canvasRef will be utilized in Story 3.x to acquire the rendering context
  void canvasRef;

  return (
    <canvas
      ref={canvasRef}
      id={`layer-${layerName}`}
      role="img"
      aria-label={ariaLabel}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex,
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease',
      }}
    />
  );
}
