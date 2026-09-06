import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { CityData } from '@vellum/core';
import { csToGeoArray } from '@vellum/renderer-webgl';
import type { ViewportBounds } from '@vellum/renderer-webgl';

const CANVAS_SIZE = 160;

/** How far one arrow-key press pans, as a fraction of the city's extent. */
const PAN_STEP_FRACTION = 0.1;

/** Props for the Minimap component. */
export interface MinimapProps {
  /** City data used to compute the geographic bounding box and render city geometry. */
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
 * Uses an **offscreen canvas** to pre-render static city geometry (water tiles
 * and highway roads) once when `cityData` changes. The interactive `drawFrame`
 * function then stamps this pre-rendered image with a single `drawImage` call
 * and draws the live viewport rect on top — keeping the hot path at near-zero
 * CPU cost during pan/zoom.
 *
 * Viewport updates bypass React state entirely, so there are zero re-renders
 * during navigation.
 */
export function Minimap({
  cityData,
  subscribeViewport,
  getInitialViewportBounds,
  navigateTo,
}: MinimapProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The minimap owns the lower-right corner; everything else stacks around it.
  const viewportRef = useRef<ViewportBounds | null>(null);
  const isDraggingRef = useRef(false);
  /** Holds the pre-rendered static city image; rebuilt only when `cityData` changes. */
  const staticMapRef = useRef<HTMLCanvasElement | null>(null);

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

  // ── Pre-render static city geometry ──────────────────────────────────────────
  // Runs once per cityData change. Draws terrain, water and major roads onto
  // an offscreen canvas so drawFrame can use a single cheap drawImage call.
  useEffect(() => {
    const offscreen = document.createElement('canvas');
    offscreen.width = CANVAS_SIZE;
    offscreen.height = CANVAS_SIZE;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    // 1. Fondo de Agua Global (cubre absolutamente todo)
    ctx.fillStyle = '#6db8b7'; // El color de tu token de agua
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 2. Terreno — renderizado vectorial con Path2D desde landPolygon (WGS-84).
    // Los huecos (ríos, lagos) se manejan con la regla evenodd.
    if (cityData.landPolygon.length > 0) {
      ctx.fillStyle = '#e2dbcb';
      const path = new Path2D();

      const drawRing = (ring: [number, number][]) => {
        if (ring.length === 0) return;
        path.moveTo(toCanvasX(ring[0][0]), toCanvasY(ring[0][1]));
        for (let i = 1; i < ring.length; i++) {
          path.lineTo(toCanvasX(ring[i][0]), toCanvasY(ring[i][1]));
        }
        path.closePath();
      };

      for (const polygon of cityData.landPolygon) {
        drawRing(polygon.exterior);
        for (const hole of polygon.holes) drawRing(hole);
      }

      ctx.fill(path, 'evenodd');
    }

    // 3. Highway roads — draw using node position lookup
    const nodeMap = new Map(cityData.roadNodes.map((n) => [n.id, n]));
    const highways = cityData.roadSegments.filter(
      (s) => s.itemClass === 'Highway',
    );
    if (highways.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(160, 152, 176, 0.55)'; // muted highway purple
      ctx.lineWidth = 1;
      for (const seg of highways) {
        const start = nodeMap.get(seg.startNodeId);
        const end = nodeMap.get(seg.endNodeId);
        if (!start || !end) continue;
        const [sLng, sLat] = csToGeoArray({
          x: start.position.x,
          z: start.position.z,
        });
        const [eLng, eLat] = csToGeoArray({
          x: end.position.x,
          z: end.position.z,
        });
        ctx.moveTo(toCanvasX(sLng), toCanvasY(sLat));
        ctx.lineTo(toCanvasX(eLng), toCanvasY(eLat));
      }
      ctx.stroke();
    }

    staticMapRef.current = offscreen;
  }, [cityData, toCanvasX, toCanvasY]);

  // ── Live drawFrame ────────────────────────────────────────────────────────────
  // Called on every move/moveend/idle event. Stamps the pre-rendered city image
  // then overlays the viewport rectangle. No React state touched.
  const drawFrame = useCallback(
    (vb: ViewportBounds) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      if (staticMapRef.current) {
        ctx.drawImage(staticMapRef.current, 0, 0);
      } else {
        // Fallback while offscreen is not yet ready
        ctx.fillStyle = '#f2efe9';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      }

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

  // ── Subscribe to viewport changes ─────────────────────────────────────────────
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

  // ── Pointer navigation ────────────────────────────────────────────────────────
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

  // ── Keyboard navigation ───────────────────────────────────────────────────
  // The keyboard equivalent of click-and-drag recentring: arrows pan the map
  // by a fixed fraction of the city, Enter returns to its centre.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      const stepLng = (neLng - swLng) * PAN_STEP_FRACTION;
      const stepLat = (neLat - swLat) * PAN_STEP_FRACTION;
      const current = viewportRef.current;
      const centerLng = current
        ? (current.westLng + current.eastLng) / 2
        : (swLng + neLng) / 2;
      const centerLat = current
        ? (current.northLat + current.southLat) / 2
        : (swLat + neLat) / 2;

      const move = (dLng: number, dLat: number) => {
        e.preventDefault();
        navigateTo(centerLng + dLng, centerLat + dLat);
      };

      switch (e.key) {
        case 'ArrowLeft':
          return move(-stepLng, 0);
        case 'ArrowRight':
          return move(stepLng, 0);
        case 'ArrowUp':
          return move(0, stepLat);
        case 'ArrowDown':
          return move(0, -stepLat);
        case 'Enter':
          e.preventDefault();
          return navigateTo((swLng + neLng) / 2, (swLat + neLat) / 2);
        default:
          return;
      }
    },
    [navigateTo, neLat, neLng, swLat, swLng],
  );

  const helpId = 'vellum-minimap-help';

  return (
    <div
      className="rounded-md overflow-hidden border border-white/20 shadow-lg bg-[#f2efe9]"
      style={{
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        touchAction: 'none',
      }}
    >
      {/* Keyboard operation is equivalent to the pointer route — arrows pan by
          a fixed step, Enter recentres — so this is described as an
          interactive navigation region rather than as an image. */}
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ display: 'block', cursor: 'crosshair', touchAction: 'none' }}
        aria-label={t('a11y.minimap')}
        aria-describedby={helpId}
        role="application"
      />
      <p id={helpId} hidden>
        {t('a11y.minimapHelp')}
      </p>
    </div>
  );
}
