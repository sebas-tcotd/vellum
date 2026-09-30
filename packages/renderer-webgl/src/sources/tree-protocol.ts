/**
 * Serves `vellum-trees://z/x/y` tiles to MapLibre, painted in a worker when one is set.
 *
 * @remarks
 * Internal module — not exported from the package barrel (only `setTreeWorkerUrl`).
 *
 * Painting a crown tile takes long enough that, on the main thread, every tile
 * entering the view during a pan dropped frames. The worker does it off-thread;
 * without a worker URL (tests, headless export) it falls back to the main thread.
 *
 * MapLibre runs every raster/image request through one queue of 16 slots and frees
 * a slot only when the protocol settles, so each request here must settle: with the
 * painted tile, with an error, or with an `AbortError` as soon as MapLibre aborts it.
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

type TileResult = ImageBitmap | null;
type WorkerReply = { id: number; data?: TileResult; error?: string };

interface Pending {
  tile: TileAddress;
  resolve: (data: TileResult) => void;
  reject: (err: Error) => void;
}

let workerUrl: string | null = null;
let worker: Worker | null = null;
let grid: Float32Array | null = null;
let color = '#000';
let registered = false;
let nextId = 0;
const pending = new Map<number, Pending>();

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
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const { id, data, error } = e.data;
      const request = pending.get(id);
      if (!request) {
        // Aborted while the worker painted it.
        data?.close();
        return;
      }
      pending.delete(id);
      if (error !== undefined) request.reject(new Error(error));
      else request.resolve(data ?? null);
    };
    // A worker that fails to load (stale dev bundle, blocked script) would leave
    // every tile request hanging with no error; drop it and paint on this thread.
    worker.onerror = (e) => {
      console.error(
        '[tree-protocol] worker failed, painting on main thread:',
        e,
      );
      worker = null;
      for (const { tile, resolve, reject } of pending.values()) {
        requestTile(tile, new AbortController().signal).then(resolve, reject);
      }
      pending.clear();
    };
  }
  worker?.postMessage({ type: 'grid', grid: density });
  if (!registered) {
    maplibregl.addProtocol(TREES_PROTOCOL, async (params, abortController) => ({
      data: await requestTile(parseTileUrl(params.url), abortController.signal),
    }));
    registered = true;
  }
}

/** Changes the crown colour; the caller must reload the source's tiles. */
export function setTreeColor(crownColor: string): void {
  color = crownColor;
}

function requestTile(
  tile: TileAddress,
  signal: AbortSignal,
): Promise<TileResult> {
  if (!worker) {
    if (!grid) throw new Error('Tree protocol queried before setTreeSource()');
    return Promise.resolve(paintTreeTile(grid, tile, color));
  }
  const id = nextId++;
  const w = worker;
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Tile request aborted', 'AbortError'));
      return;
    }
    pending.set(id, { tile, resolve, reject });
    signal.addEventListener(
      'abort',
      () => {
        if (!pending.delete(id)) return;
        w.postMessage({ type: 'cancel', id });
        reject(new DOMException('Tile request aborted', 'AbortError'));
      },
      { once: true },
    );
    w.postMessage({ type: 'tile', id, tile, color });
  });
}
