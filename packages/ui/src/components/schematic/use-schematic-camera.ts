import {
  SCHEMATIC_PRESENTATION_SCALE_MAX,
  SCHEMATIC_PRESENTATION_SCALE_MIN,
} from '@vellum/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SchematicCamera {
  /**
   * The last *committed* camera: updated when a gesture ends, never while it
   * runs. The box on screen during a drag or a wheel burst lives in a ref and
   * is written to the SVG directly — see {@link SchematicCamera.svgRef}.
   */
  readonly viewBox: { x: number; y: number; width: number; height: number };
  /**
   * Quantized inverse zoom for presentation metrics, bounded to avoid extremes.
   * Committed with the camera: it changes once per zoom gesture, after the
   * wheel rests, not on every tick.
   */
  readonly visualScale: number;
  /**
   * Attach to the diagram's `<svg>`. The camera owns its `viewBox` attribute:
   * React must not render one, or a re-render during a gesture would snap the
   * diagram back to the committed box.
   */
  readonly svgRef: (node: SVGSVGElement | null) => void;
  readonly onWheel: (event: React.WheelEvent<SVGSVGElement>) => void;
  readonly onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
  readonly onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
  readonly onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
  readonly onPointerCancel: (event: React.PointerEvent<SVGSVGElement>) => void;
  readonly fit: () => void;
}

type Box = SchematicCamera['viewBox'];
// Matches the wheel's own limits (4 % of the diagram to 4× it), so type and
// strokes keep their screen size across the whole zoom range instead of
// growing once a clamp is hit.
// The redraw honours the same range (`renderSchematic`), so geometry and stroke
// never part ways at one end of the zoom.
const VISUAL_SCALE_MIN = SCHEMATIC_PRESENTATION_SCALE_MIN;
const VISUAL_SCALE_MAX = SCHEMATIC_PRESENTATION_SCALE_MAX;
/**
 * How long the wheel has to rest before a zoom gesture is considered over and
 * the diagram is rematerialized at the new scale. Long enough to bridge the gap
 * between ticks of a continuous scroll, short enough to read as immediate.
 */
export const ZOOM_SETTLE_MS = 160;
/** Quarter-octave steps: every zoom step is one label pass, at any depth. */
const quantizeVisualScale = (base: Box, current: Box): number => {
  const raw = Math.sqrt(
    (current.width * current.height) / (base.width * base.height),
  );
  const bounded = Math.min(VISUAL_SCALE_MAX, Math.max(VISUAL_SCALE_MIN, raw));
  return 2 ** (Math.round(Math.log2(bounded) * 4) / 4);
};
const padded = (width: number, height: number): Box => ({
  x: -width * 0.05,
  y: -height * 0.05,
  width: width * 1.1,
  height: height * 1.1,
});
const sameBox = (a: Box, b: Box): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const toAttribute = (box: Box): string =>
  `${box.x} ${box.y} ${box.width} ${box.height}`;

/**
 * SVG-native camera: all diagram metrics scale together with its viewBox.
 *
 * @remarks
 * Story 4.5: interaction never goes through React. The live box is a ref,
 * written to the SVG at most once per animation frame; React state (`viewBox`,
 * `visualScale`) is committed only when a gesture ends — on pointer release, or
 * {@link ZOOM_SETTLE_MS} after the last wheel tick. During a zoom, strokes and
 * labels therefore scale with the viewBox (they are diagram units) and return
 * to their screen size when the scale is committed and the layout
 * rematerialized, once per gesture rather than once per quantum crossed.
 */
export function useSchematicCamera(
  width: number,
  height: number,
): SchematicCamera {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const [viewBox, setViewBox] = useState<Box>(() =>
    padded(safeWidth, safeHeight),
  );
  const [visualScale, setVisualScale] = useState(1);
  /** The truth while a gesture runs; what the SVG shows. */
  const live = useRef<Box>(viewBox);
  /** What React last received, so a no-op commit is skipped outright. */
  const committed = useRef({ box: viewBox, scale: visualScale });
  const svg = useRef<SVGSVGElement | null>(null);
  const frame = useRef<number | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * A zoom settled while a drag was running: its scale is committed on release
   * instead, so a pan never re-renders the layers halfway through.
   */
  const settlePending = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; box: Box } | null>(
    null,
  );

  const write = useCallback(() => {
    svg.current?.setAttribute('viewBox', toAttribute(live.current));
  }, []);
  const cancelFrame = useCallback(() => {
    if (frame.current === null) return;
    cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const cancelSettle = useCallback(() => {
    if (settle.current === null) return;
    clearTimeout(settle.current);
    settle.current = null;
  }, []);
  /** Several events in one frame collapse into one write of the latest box. */
  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      write();
    });
  }, [write]);
  /** Draws what is pending now, so the committed box is the one on screen. */
  const flush = useCallback(() => {
    cancelFrame();
    write();
  }, [cancelFrame, write]);
  /**
   * Hands the live box (and, when given, a new scale) to React. Values React
   * already has are skipped here rather than left to `setState`'s bail-out,
   * which can still schedule a render — and a fit on mount, or a click without
   * a drag, would otherwise cost one.
   */
  const commit = useCallback((scale?: number) => {
    const box = live.current;
    if (!sameBox(committed.current.box, box)) {
      committed.current.box = box;
      setViewBox(box);
    }
    if (scale !== undefined && committed.current.scale !== scale) {
      committed.current.scale = scale;
      setVisualScale(scale);
    }
  }, []);

  const svgRef = useCallback(
    (node: SVGSVGElement | null) => {
      svg.current = node;
      // A (re)mounted SVG starts from the live box, not from an empty viewBox.
      if (node) write();
    },
    [write],
  );

  const fit = useCallback(() => {
    cancelSettle();
    settlePending.current = false;
    live.current = padded(safeWidth, safeHeight);
    flush();
    commit(1);
  }, [cancelSettle, commit, flush, safeHeight, safeWidth]);
  useEffect(fit, [fit]);
  // Nothing may touch a node after the view is gone.
  useEffect(
    () => () => {
      cancelFrame();
      cancelSettle();
    },
    [cancelFrame, cancelSettle],
  );

  const onWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const box = live.current;
      const pointX =
        ((event.clientX - rect.left) / rect.width) * box.width + box.x;
      const pointY =
        ((event.clientY - rect.top) / rect.height) * box.height + box.y;
      const factor = event.deltaY > 0 ? 1.18 : 1 / 1.18;
      const min = Math.min(width, height) * 0.04;
      const max = Math.max(width, height) * 4;
      const nextWidth = Math.min(max, Math.max(min, box.width * factor));
      const nextHeight = Math.min(max, Math.max(min, box.height * factor));
      live.current = {
        x: pointX - ((pointX - box.x) / box.width) * nextWidth,
        y: pointY - ((pointY - box.y) / box.height) * nextHeight,
        width: nextWidth,
        height: nextHeight,
      };
      schedule();
      cancelSettle();
      settle.current = setTimeout(() => {
        settle.current = null;
        if (drag.current) {
          settlePending.current = true;
          return;
        }
        flush();
        commit(
          quantizeVisualScale(padded(safeWidth, safeHeight), live.current),
        );
      }, ZOOM_SETTLE_MS);
    },
    [
      cancelSettle,
      commit,
      flush,
      height,
      safeHeight,
      safeWidth,
      schedule,
      width,
    ],
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
        box: live.current,
      };
    },
    [],
  );
  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      live.current = {
        ...current.box,
        x:
          current.box.x -
          ((event.clientX - current.x) / rect.width) * current.box.width,
        y:
          current.box.y -
          ((event.clientY - current.y) / rect.height) * current.box.height,
      };
      schedule();
    },
    [schedule],
  );
  const onPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (drag.current?.id !== event.pointerId) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      drag.current = null;
      flush();
      if (settlePending.current) {
        settlePending.current = false;
        commit(
          quantizeVisualScale(padded(safeWidth, safeHeight), live.current),
        );
      } else {
        commit();
      }
    },
    [commit, flush, safeHeight, safeWidth],
  );
  return {
    viewBox,
    visualScale,
    svgRef,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    fit,
  };
}
