/**
 * Worker entry for `tree-protocol.ts`: paints crown tiles off the main thread.
 *
 * @remarks
 * Bundled by the app (`?worker&url`), never imported by the package itself.
 */

import { paintTreeTile, type TileAddress } from './tree-tiles';

type Message =
  | { type: 'grid'; grid: Float32Array }
  | { type: 'tile'; id: number; tile: TileAddress; color: string };

let grid: Float32Array | null = null;

self.addEventListener('message', (e: MessageEvent<Message>) => {
  const msg = e.data;
  if (msg.type === 'grid') {
    grid = msg.grid;
    return;
  }
  const density = grid ?? new Float32Array(0);
  void paintTreeTile(density, msg.tile, msg.color).then((data) => {
    self.postMessage({ id: msg.id, data }, { transfer: [data] });
  });
});
