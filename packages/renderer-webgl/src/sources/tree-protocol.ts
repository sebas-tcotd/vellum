/**
 * Serves `vellum-trees://z/x/y` tiles to MapLibre, painted in a worker when one is set.
 *
 * @remarks
 * Internal module — not exported from the package barrel (only `setTreeWorkerUrl`).
 *
 * Painting a crown tile and encoding it as PNG takes long enough that, on the main
 * thread, every tile entering the view during a pan dropped frames. The worker does
 * both off-thread; without a worker URL (tests, headless export) it falls back to the
 * main thread.
 */

import * as maplibregl from 'maplibre-gl';
import {
  paintTreeTile,
  parseTileUrl,
  type TileAddress,
  TREES_PROTOCOL,
} from './tree-tiles';

export {
  TREES_MAX_ZOOM,
  TREES_MIN_ZOOM,
  TREES_TILE_SIZE,
  TREES_TILE_URL,
} from './tree-tiles';

let workerUrl: string | null = null;
let worker: Worker | null = null;
let grid: Float32Array | null = null;
let color = '#000';
let registered = false;
let nextId = 0;
const pending = new Map<number, (data: ArrayBuffer) => void>();

/**
 * Points the tree protocol at the bundled URL of `tree-worker.ts`. Only the
 * composition root can resolve it (see `setMapWorkerUrl`).
 */
export function setTreeWorkerUrl(url: string): void {
  workerUrl = url;
}

/** Hands the protocol the loaded city's density grid and crown colour. */
export function setTreeSource(density: Float32Array, crownColor: string): void {
  grid = density;
  color = crownColor;
  if (workerUrl && !worker) {
    worker = new Worker(workerUrl, { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; data: ArrayBuffer }>) => {
      pending.get(e.data.id)?.(e.data.data);
      pending.delete(e.data.id);
    };
  }
  worker?.postMessage({ type: 'grid', grid: density });
  if (!registered) {
    maplibregl.addProtocol(TREES_PROTOCOL, async (params) => ({
      data: await requestTile(parseTileUrl(params.url)),
    }));
    registered = true;
  }
}

/** Changes the crown colour; the caller must reload the source's tiles. */
export function setTreeColor(crownColor: string): void {
  color = crownColor;
}

function requestTile(tile: TileAddress): Promise<ArrayBuffer> {
  if (!worker) {
    if (!grid) throw new Error('Tree protocol queried before setTreeSource()');
    return paintTreeTile(grid, tile, color);
  }
  const id = nextId++;
  const w = worker;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ type: 'tile', id, tile, color });
  });
}
