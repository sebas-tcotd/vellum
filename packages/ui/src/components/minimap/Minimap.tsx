import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { CityData } from '@vellum/core';
import { csToGeoArray } from '@vellum/renderer-webgl';
import type { ViewportBounds } from '@vellum/renderer-webgl';

const CANVAS_SIZE = 160;

/** Props for the Minimap component. */
export interface MinimapProps {
  /** City data used to compute the geographic bounding box. */
  cityData: CityData;
  /** Subscribes to viewport changes; returns a cleanup function. */
  subscribeViewport: (callback: (bounds: ViewportBounds) => void) => () => void;
  /** Returns the current viewport bounds, or null if not ready. */
  getInitialViewportBounds: () => ViewportBounds | null;
  /** Pans the main map to the given LngLat. */
  navigateTo: (lng: number, lat: number) => void;
}

/**
 * Minimap navigation widget rendered as a 160×160 Canvas 2D element.
 *
 * @remarks
 * Viewport updates are applied directly to the canvas without going through
 * React state, keeping re-render count at zero during pan/zoom.
 * Supports both click-to-navigate and drag-to-navigate via Pointer Events.
 */
export function Minimap({
  cityData,
  subscribeViewport,
  getInitialViewportBounds,
  navigateTo,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<ViewportBounds | null>(null);
  /** Tracks whether the user is currently dragging — no React state to avoid re-renders. */
  const isDraggingRef = useRef(false);

  const { swLng, swLat, neLng, neLat } = useMemo(() => {
    const { bounds } = cityData;
    const [swLng, swLat] = csToGeoArray({ x: bounds.minX, z: bounds.minZ });
    const [neLng, neLat] = csToGeoArray({ x: bounds.maxX, z: bounds.maxZ });
    return { swLng, swLat, neLng, neLat };
  }, [cityData]);

  const toCanvasX = useCallback(
    (lng: number) => ((lng - swLng) / (neLng - swLng)) * CANVAS_SIZE,
    [swLng, neLng],
  );

  const toCanvasY = useCallback(
    (lat: number) => ((neLat - lat) / (neLat - swLat)) * CANVAS_SIZE,
    [neLat, swLat],
  );

  const drawFrame = useCallback(
    (vb: ViewportBounds) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // Terrain background
      ctx.fillStyle = '#f2efe9';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // Viewport rect
      const rx1 = toCanvasX(vb.westLng);
      const ry1 = toCanvasY(vb.northLat);
      const rw = toCanvasX(vb.eastLng) - rx1;
      const rh = toCanvasY(vb.southLat) - ry1;

      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(rx1, ry1, rw, rh);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx1, ry1, rw, rh);
    },
    [toCanvasX, toCanvasY],
  );

  useEffect(() => {
    const initial = getInitialViewportBounds();
    if (initial) {
      viewportRef.current = initial;
      drawFrame(initial);
    }
    const unsub = subscribeViewport((bounds) => {
      viewportRef.current = bounds;
      drawFrame(bounds);
    });
    return unsub;
  }, [subscribeViewport, getInitialViewportBounds, drawFrame]);

  /** Converts a pointer event position to LngLat and calls navigateTo. */
  const navigateFromEvent = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, CANVAS_SIZE));
      const y = Math.max(0, Math.min(e.clientY - rect.top, CANVAS_SIZE));
      const lng = swLng + (x / CANVAS_SIZE) * (neLng - swLng);
      const lat = neLat - (y / CANVAS_SIZE) * (neLat - swLat);
      navigateTo(lng, lat);
    },
    [swLng, neLng, swLat, neLat, navigateTo],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      isDraggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      navigateFromEvent(e);
    },
    [navigateFromEvent],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDraggingRef.current) return;
      navigateFromEvent(e);
    },
    [navigateFromEvent],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      isDraggingRef.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [],
  );

  return (
    <div
      className="absolute bottom-4 right-4 rounded-md overflow-hidden border border-white/20 shadow-lg z-40 bg-[#f2efe9]"
      style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ display: 'block', cursor: 'crosshair', touchAction: 'none' }}
        aria-label="Minimap de navegación"
        role="img"
      />
    </div>
  );
}
