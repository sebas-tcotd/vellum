import { useCallback, useEffect, useRef, useState } from 'react';

export interface SchematicCamera {
  readonly viewBox: { x: number; y: number; width: number; height: number };
  /** Quantized inverse zoom for presentation metrics, bounded to avoid extremes. */
  readonly visualScale: number;
  readonly onWheel: (event: React.WheelEvent<SVGSVGElement>) => void;
  readonly onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
  readonly onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
  readonly onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
  readonly onPointerCancel: (event: React.PointerEvent<SVGSVGElement>) => void;
  readonly fit: () => void;
}

type Box = SchematicCamera['viewBox'];
const VISUAL_SCALE_MIN = 0.35;
const VISUAL_SCALE_MAX = 3;
const quantizeVisualScale = (base: Box, current: Box): number => {
  const raw = Math.sqrt(
    (current.width * current.height) / (base.width * base.height),
  );
  return (
    Math.round(
      Math.min(VISUAL_SCALE_MAX, Math.max(VISUAL_SCALE_MIN, raw)) * 8,
    ) / 8
  );
};
const padded = (width: number, height: number): Box => ({
  x: -width * 0.05,
  y: -height * 0.05,
  width: width * 1.1,
  height: height * 1.1,
});

/** SVG-native camera: all diagram metrics scale together with its viewBox. */
export function useSchematicCamera(
  width: number,
  height: number,
): SchematicCamera {
  const initial = padded(Math.max(width, 1), Math.max(height, 1));
  const [viewBox, setViewBox] = useState<Box>(initial);
  const drag = useRef<{ id: number; x: number; y: number; box: Box } | null>(
    null,
  );
  const fit = useCallback(
    () => setViewBox(padded(Math.max(width, 1), Math.max(height, 1))),
    [width, height],
  );
  useEffect(fit, [fit]);
  const onWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const pointX =
        ((event.clientX - rect.left) / rect.width) * viewBox.width + viewBox.x;
      const pointY =
        ((event.clientY - rect.top) / rect.height) * viewBox.height + viewBox.y;
      const factor = event.deltaY > 0 ? 1.18 : 1 / 1.18;
      const min = Math.min(width, height) * 0.04;
      const max = Math.max(width, height) * 4;
      const nextWidth = Math.min(max, Math.max(min, viewBox.width * factor));
      const nextHeight = Math.min(max, Math.max(min, viewBox.height * factor));
      setViewBox({
        x: pointX - ((pointX - viewBox.x) / viewBox.width) * nextWidth,
        y: pointY - ((pointY - viewBox.y) / viewBox.height) * nextHeight,
        width: nextWidth,
        height: nextHeight,
      });
    },
    [height, viewBox, width],
  );
  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      // jsdom and a few embedded WebViews omit Pointer Events capture; dragging
      // still works because move events remain on the SVG in those environments.
      if (drag.current) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      drag.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        box: viewBox,
      };
    },
    [viewBox],
  );
  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setViewBox({
        ...current.box,
        x:
          current.box.x -
          ((event.clientX - current.x) / rect.width) * current.box.width,
        y:
          current.box.y -
          ((event.clientY - current.y) / rect.height) * current.box.height,
      });
    },
    [],
  );
  const onPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (drag.current?.id !== event.pointerId) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      drag.current = null;
    },
    [],
  );
  return {
    viewBox,
    visualScale: quantizeVisualScale(initial, viewBox),
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    fit,
  };
}
