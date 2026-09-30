/**
 * Detail-zoom tree crowns: which crowns fall in a tile, and painting them.
 *
 * @remarks
 * Internal module — not exported from the package barrel. Kept free of MapLibre and
 * the DOM so `tree-worker.ts` can run it off the main thread.
 *
 * The canopy image ({@link ./forest-canopy}) softens past about zoom 16, where a
 * 33.75 m cell spans dozens of pixels. From zoom 15 individual crowns take over —
 * the top-down "circle with a shadow" tree of topographic maps. Crown count follows
 * `m_tree`'s own scale (+60 per tree, capped at 255 ⇒ density × 5 trees per cell);
 * positions are hashed per cell, so they are stable across loads and never form a
 * lattice.
 */

import { CS1_WORLD_HALF, geoToCs } from '../coordinate-transform';
import { CANOPY_CELL_SIZE, CANOPY_GRID_SIZE } from './forest-canopy';

/** A Web Mercator tile address. */
export interface TileAddress {
  z: number;
  x: number;
  y: number;
}

export const TREES_PROTOCOL = 'vellum-trees';
/** Tile URL template for the `forests-trees` raster source. */
export const TREES_TILE_URL = `${TREES_PROTOCOL}://{z}/{x}/{y}`;
/** Zoom where crowns appear; below it they would be sub-pixel stipple. */
export const TREES_MIN_ZOOM = 15;
/** Highest zoom served; MapLibre overzooms beyond it. */
export const TREES_MAX_ZOOM = 18;
export const TREES_TILE_SIZE = 512;

/** Trees a fully dense cell holds (`m_tree` saturates at 5 trees). */
const TREES_PER_FULL_CELL = 5;
/** Crown radius range in world units (≈ metres). */
const CROWN_MIN = 3.5;
const CROWN_MAX = 5.5;

/** One crown in tile pixels. */
export interface TreeCrown {
  x: number;
  y: number;
  r: number;
}

/** Crowns whose disc touches `tile`, ordered north to south so southern ones overlap. */
export function treesInTile(
  density: Float32Array,
  tile: TileAddress,
): TreeCrown[] {
  const count = 2 ** tile.z;
  const lngW = (tile.x / count) * 360 - 180;
  const lngE = ((tile.x + 1) / count) * 360 - 180;
  const latN = mercatorYToLat(tile.y / count);
  const latS = mercatorYToLat((tile.y + 1) / count);
  const nw = geoToCs({ lng: lngW, lat: latN });
  const se = geoToCs({ lng: lngE, lat: latS });
  const unitsPerPx = (se.x - nw.x) / TREES_TILE_SIZE;
  const zTop = Math.max(nw.z, se.z);
  const zBottom = Math.min(nw.z, se.z);
  // Screen-down direction in CS1 Z: −1 when north is +Z (south-up), else +1.
  const down = nw.z > se.z ? -1 : 1;

  const n = CANOPY_GRID_SIZE;
  const toCell = (v: number) =>
    Math.floor((v + CS1_WORLD_HALF) / CANOPY_CELL_SIZE);
  const pad = 1; // crowns spill a little past their cell
  const c0 = Math.max(0, toCell(nw.x) - pad);
  const c1 = Math.min(n - 1, toCell(se.x) + pad);
  const r0 = Math.max(0, toCell(zBottom) - pad);
  const r1 = Math.min(n - 1, toCell(zTop) + pad);

  const rowOrder: number[] = [];
  for (let r = r0; r <= r1; r++) rowOrder.push(r);
  if (down < 0) rowOrder.reverse();

  const crowns: TreeCrown[] = [];
  for (const row of rowOrder) {
    for (let col = c0; col <= c1; col++) {
      const d = density[row * n + col]!;
      if (d === 0) continue;
      const trees = Math.max(1, Math.round(d * TREES_PER_FULL_CELL));
      for (let k = 0; k < trees; k++) {
        const wx =
          -CS1_WORLD_HALF +
          (col + 0.1 + 0.8 * hash(col, row, k, 1)) * CANOPY_CELL_SIZE;
        const wz =
          -CS1_WORLD_HALF +
          (row + 0.1 + 0.8 * hash(col, row, k, 2)) * CANOPY_CELL_SIZE;
        const r =
          (CROWN_MIN + (CROWN_MAX - CROWN_MIN) * hash(col, row, k, 3)) /
          unitsPerPx;
        const x = (wx - nw.x) / unitsPerPx;
        const y = (down < 0 ? zTop - wz : wz - zBottom) / unitsPerPx;
        if (
          x < -r ||
          y < -r ||
          x > TREES_TILE_SIZE + r ||
          y > TREES_TILE_SIZE + r
        )
          continue;
        crowns.push({ x, y, r });
      }
    }
  }
  return crowns;
}

/** Deterministic value in [0, 1) per cell, tree and channel. */
function hash(col: number, row: number, k: number, ch: number): number {
  const h =
    Math.sin(col * 127.1 + row * 311.7 + k * 74.7 + ch * 19.3) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Paints the crowns of `tile`, or returns `null` when there are none (MapLibre draws
 * a `null` tile as transparent).
 *
 * @remarks
 * Synchronous on purpose: an earlier version encoded a PNG with `convertToBlob`, and
 * on WebView2 that promise could stay pending. MapLibre holds one of its 16 shared
 * image-request slots per tile until the protocol answers, so a handful of stuck
 * tiles starved every later request and panned-to areas never got their crowns.
 */
export function paintTreeTile(
  density: Float32Array,
  tile: TileAddress,
  color: string,
): ImageBitmap | null {
  const crowns = treesInTile(density, tile);
  if (crowns.length === 0) return null;

  const canvas = new OffscreenCanvas(TREES_TILE_SIZE, TREES_TILE_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  for (const { x, y, r } of crowns) {
    // Short cast shadow to the south-east, then the crown with a darker rim.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    disc(ctx, x + r * 0.35, y + r * 0.35, r);
    ctx.fillStyle = color;
    disc(ctx, x, y, r);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = Math.max(0.75, r * 0.12);
    ctx.stroke();
  }
  return canvas.transferToImageBitmap();
}

function disc(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function parseTileUrl(url: string): TileAddress {
  const [z, x, y] = url
    .replace(`${TREES_PROTOCOL}://`, '')
    .split('?')[0]!
    .split('/')
    .map(Number);
  if (z === undefined || x === undefined || y === undefined) {
    throw new Error(`Malformed tree tile URL: ${url}`);
  }
  return { z, x, y };
}

/** Converts a normalised Web Mercator Y (0 = north pole edge, 1 = south) to latitude. */
export function mercatorYToLat(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}
