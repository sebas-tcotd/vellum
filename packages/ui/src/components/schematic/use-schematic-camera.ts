import {
  SCHEMATIC_PRESENTATION_SCALE_MAX,
  SCHEMATIC_PRESENTATION_SCALE_MIN,
  type MapZoomState,
} from '@vellum/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * What the shell reaches the schematic camera through: the same three actions
 * the map's camera answers (`view.zoomIn`, `view.zoomOut`, `view.fitCity`) plus
 * the zoom state the shared control group needs to disable + and − at the ends.
 * Identity is stable for the life of the camera, so it is registered once.
 */
export interface SchematicCameraControls {
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly fit: () => void;
  /**
   * Synthetic zoom state in octaves of the room the wheel still has: `zoom` is
   * the room left to zoom *out*, `max` the whole range and `min` 0. So
   * `zoom === max` is exactly "the wheel would no longer zoom in".
   */
  readonly getZoomState: () => MapZoomState | null;
  /** Called once per written frame and on every fit. Returns the unsubscribe. */
  readonly subscribe: (callback: () => void) => () => void;
}

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
  readonly controls: SchematicCameraControls;
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
/** Step of the zoom buttons and shortcuts; the wheel keeps its finer 1.18. */
const BUTTON_ZOOM_FACTOR = 1.5;
const WHEEL_ZOOM_FACTOR = 1.18;
/** The wheel's own zoom limits, per dimension: 4 % of the diagram to 4× it. */
const zoomLimits = (width: number, height: number) => ({
  min: Math.min(width, height) * 0.04,
  max: Math.max(width, height) * 4,
});
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

  /** Latest diagram size, so the stable controls never close over a stale one. */
  const dims = useRef({ width, height, safeWidth, safeHeight });
  dims.current = { width, height, safeWidth, safeHeight };
  const listeners = useRef(new Set<() => void>());
  const notify = useCallback(() => {
    for (const listener of [...listeners.current]) listener();
  }, []);

  const write = useCallback(() => {
    svg.current?.setAttribute('viewBox', toAttribute(live.current));
    notify();
  }, [notify]);
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

  /**
   * One zoom for the wheel, the buttons and the shortcuts: scales the live box
   * by `factor` (< 1 zooms in) keeping the diagram point `(pointX, pointY)`
   * fixed, within the wheel's limits. A step that moves nothing — already at
   * the limit — is dropped, so it neither writes nor arms a settle.
   */
  const applyZoom = useCallback(
    (factor: number, pointX: number, pointY: number) => {
      const box = live.current;
      const { min, max } = zoomLimits(dims.current.width, dims.current.height);
      const nextWidth = Math.min(max, Math.max(min, box.width * factor));
      const nextHeight = Math.min(max, Math.max(min, box.height * factor));
      const next = {
        x: pointX - ((pointX - box.x) / box.width) * nextWidth,
        y: pointY - ((pointY - box.y) / box.height) * nextHeight,
        width: nextWidth,
        height: nextHeight,
      };
      // Size alone decides: at a limit the anchored position can still drift by
      // a float ulp, and that is not a zoom.
      if (next.width === box.width && next.height === box.height) return;
      live.current = next;
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
          quantizeVisualScale(
            padded(dims.current.safeWidth, dims.current.safeHeight),
            live.current,
          ),
        );
      }, ZOOM_SETTLE_MS);
    },
    [cancelSettle, commit, flush, schedule],
  );
  const onWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const box = live.current;
      applyZoom(
        event.deltaY > 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR,
        ((event.clientX - rect.left) / rect.width) * box.width + box.x,
        ((event.clientY - rect.top) / rect.height) * box.height + box.y,
      );
    },
    [applyZoom],
  );
  /** Buttons and shortcuts zoom about the centre of what is on screen. */
  const zoomAboutCenter = useCallback(
    (factor: number) => {
      // Without a mounted diagram (empty or filtered network) there is nothing
      // to zoom; the command must not move a camera no one can see.
      if (!svg.current) return;
      const box = live.current;
      applyZoom(factor, box.x + box.width / 2, box.y + box.height / 2);
    },
    [applyZoom],
  );
  const zoomIn = useCallback(
    () => zoomAboutCenter(1 / BUTTON_ZOOM_FACTOR),
    [zoomAboutCenter],
  );
  const zoomOut = useCallback(
    () => zoomAboutCenter(BUTTON_ZOOM_FACTOR),
    [zoomAboutCenter],
  );
  const getZoomState = useCallback((): MapZoomState | null => {
    if (!svg.current) return null;
    const box = live.current;
    const { min, max } = zoomLimits(dims.current.width, dims.current.height);
    // The wheel clamps each dimension on its own, so it stops only once both
    // have: the room left either way is that of the freer dimension.
    const out = Math.max(
      0,
      Math.log2(max / box.width),
      Math.log2(max / box.height),
    );
    const inward = Math.max(
      0,
      Math.log2(box.width / min),
      Math.log2(box.height / min),
    );
    return { zoom: out, min: 0, max: out + inward };
  }, []);
  const subscribe = useCallback((callback: () => void) => {
    listeners.current.add(callback);
    return () => {
      listeners.current.delete(callback);
    };
  }, []);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const controls = useMemo<SchematicCameraControls>(
    () => ({
      zoomIn,
      zoomOut,
      fit: () => fitRef.current(),
      getZoomState,
      subscribe,
    }),
    [getZoomState, subscribe, zoomIn, zoomOut],
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
    controls,
  };
}
