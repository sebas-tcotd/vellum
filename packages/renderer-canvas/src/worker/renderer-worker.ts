import type { WorkerMessage, WorkerResponse } from './messages';
import { renderTerrainLayer } from '../layers/terrain-layer';
import { renderWaterLayer } from '../layers/water-layer';
import { renderRoadsLayer } from '../layers/roads-layer';
import { renderTransitLayer } from '../layers/transit-layer';
import { renderBuildingsLayer } from '../layers/buildings-layer';
import { renderForestsLayer } from '../layers/forests-layer';
import { renderDistrictsLayer } from '../layers/districts-layer';
import { OVERSCAN_FACTOR } from '../overscan';
import dmMonoWoff2Url from '@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2?url';

// DM Mono loaded at worker startup for district labels (AC2).
// Fallback: labels render in system monospace if load fails — not a crash.
// FontFace constructor is wrapped in try-catch: in environments where FontFace
// is unavailable the constructor throws synchronously before onmessage is installed.
let dmMonoPromise: Promise<void>;
try {
  dmMonoPromise = new FontFace(
    'DM Mono',
    `url('${dmMonoWoff2Url}') format('woff2')`,
  )
    .load()
    .then((font) => {
      (self as unknown as { fonts: FontFaceSet }).fonts.add(font);
    })
    .catch(() => {
      console.warn(
        '[renderer-worker] DM Mono font load failed — district labels will use system monospace fallback',
      );
    });
} catch {
  dmMonoPromise = Promise.resolve();
}

interface LayerCanvas {
  offscreen: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
}

const layers = new Map<string, LayerCanvas>();
let currentZoom = 1;
let currentPanX = 0;
let currentPanY = 0;

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  try {
    if (msg.type === 'render') {
      const { cityData, style, layers: layerVisibility } = msg;

      for (const [layerName, canvas] of layers) {
        const ctx = canvas.ctx;
        const bufferW = canvas.offscreen.width;
        const bufferH = canvas.offscreen.height;
        ctx.clearRect(0, 0, bufferW, bufferH);

        // Overscan: project the map to the *fit* size (viewport-aligned) and shift
        // it by the per-side margin, so it paints centered within the larger buffer.
        // Panning then reveals the already-painted margin instantly (see overscan.ts).
        const fitW = bufferW / OVERSCAN_FACTOR;
        const fitH = bufferH / OVERSCAN_FACTOR;
        const panX = currentPanX + (bufferW - fitW) / 2;
        const panY = currentPanY + (bufferH - fitH) / 2;

        if (layerName === 'terrain' && layerVisibility.terrain) {
          renderTerrainLayer(
            ctx,
            cityData.landTiles,
            cityData.bounds,
            style.tokens,
            fitW,
            fitH,
            currentZoom,
            panX,
            panY,
          );
        } else if (layerName === 'water' && layerVisibility.water) {
          renderWaterLayer(
            ctx,
            cityData.waterTiles,
            cityData.landTiles,
            style.tokens,
            fitW,
            fitH,
            cityData.bounds,
            currentZoom,
            panX,
            panY,
          );
        } else if (layerName === 'roads' && layerVisibility.roads) {
          const segments = cityData.roadSegments ?? [];
          const nodes = cityData.roadNodes ?? [];
          const nodeMap = new Map(nodes.map((n) => [n.id, n]));
          renderRoadsLayer(
            ctx,
            segments,
            nodeMap,
            cityData.bounds,
            style.tokens,
            fitW,
            fitH,
            currentZoom,
            panX,
            panY,
          );
        } else if (layerName === 'transit' && layerVisibility.transit) {
          const segmentMap = new Map(
            (cityData.roadSegments ?? []).map((s) => [s.id, s]),
          );
          const nodeMap = new Map(
            (cityData.roadNodes ?? []).map((n) => [n.id, n]),
          );
          renderTransitLayer(
            ctx,
            cityData.transitLines ?? [],
            segmentMap,
            nodeMap,
            cityData.bounds,
            fitW,
            fitH,
            currentZoom,
            panX,
            panY,
          );
        } else if (layerName === 'buildings' && layerVisibility.buildings) {
          renderBuildingsLayer(
            ctx,
            cityData.buildings ?? [],
            cityData.bounds,
            style.tokens,
            fitW,
            fitH,
            currentZoom,
            panX,
            panY,
          );
        } else if (layerName === 'forests' && layerVisibility.forests) {
          renderForestsLayer(
            ctx,
            cityData.forestCells ?? [],
            cityData.bounds,
            style.tokens,
            fitW,
            fitH,
            currentZoom,
            panX,
            panY,
          );
        } else if (layerName === 'districts' && layerVisibility.districts) {
          await dmMonoPromise;
          renderDistrictsLayer(
            ctx,
            cityData.districts ?? [],
            cityData.bounds,
            style.tokens,
            fitW,
            fitH,
            currentZoom,
            panX,
            panY,
          );
        }

        const response: WorkerResponse = { type: 'layer-ready', layerName };
        self.postMessage(response);
      }

      const done: WorkerResponse = { type: 'render-complete' };
      self.postMessage(done);
    } else if (msg.type === 'resize') {
      for (const [, layer] of layers) {
        layer.offscreen.width = msg.width;
        layer.offscreen.height = msg.height;
      }
    } else if (msg.type === 'update-viewport') {
      const z = msg.viewport.zoom;
      currentZoom = Number.isFinite(z) && z > 0 ? z : 1;
      currentPanX = Number.isFinite(msg.viewport.panX) ? msg.viewport.panX : 0;
      currentPanY = Number.isFinite(msg.viewport.panY) ? msg.viewport.panY : 0;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[renderer-worker] render error — zoom: ${currentZoom} — ${message}`,
    );
    const error: WorkerResponse = { type: 'error', error: message };
    self.postMessage(error);
  }
};

// Register an offscreen canvas for a layer
self.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.type === 'init-layer') {
    const { layerName, offscreen } = event.data as {
      type: 'init-layer';
      layerName: string;
      offscreen: OffscreenCanvas;
    };
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      layers.set(layerName, { offscreen, ctx });
    }
  }
});

export {};
