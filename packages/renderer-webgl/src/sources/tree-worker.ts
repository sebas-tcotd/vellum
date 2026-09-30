/**
 * Worker entry for `tree-protocol.ts`: paints crown tiles off the main thread.
 *
 * @remarks
 * Bundled by the app (`?worker&url`), never imported by the package itself.
 *
 * Tiles are painted one per task, so a `cancel` for a tile MapLibre no longer wants
 * (the view panned past it) lands before that tile's turn and skips it. Every tile
 * that is not cancelled gets exactly one reply, even when painting throws: the main
 * thread holds a MapLibre request slot until it does.
 */

import { paintTreeTile, type TileAddress } from './tree-tiles';

type Message =
  | { type: 'grid'; grid: Float32Array }
  | { type: 'tile'; id: number; tile: TileAddress; color: string }
  | { type: 'cancel'; id: number };

let grid: Float32Array | null = null;
const queue = new Map<number, { tile: TileAddress; color: string }>();
let draining = false;

self.addEventListener('message', (e: MessageEvent<Message>) => {
  const msg = e.data;
  if (msg.type === 'grid') {
    grid = msg.grid;
  } else if (msg.type === 'cancel') {
    queue.delete(msg.id);
  } else {
    queue.set(msg.id, { tile: msg.tile, color: msg.color });
    if (!draining) {
      draining = true;
      setTimeout(paintNext, 0);
    }
  }
});

function paintNext(): void {
  const next = queue.entries().next();
  if (next.done) {
    draining = false;
    return;
  }
  const [id, { tile, color }] = next.value;
  queue.delete(id);
  try {
    const data = paintTreeTile(grid ?? new Float32Array(0), tile, color);
    self.postMessage({ id, data }, { transfer: data ? [data] : [] });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
  setTimeout(paintNext, 0);
}
