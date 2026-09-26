/**
 * Forest canopy raster: the vegetation density grid as one shaded image.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 *
 * `m_tree` is a 512 × 512 density field, not a set of trees. Drawing it as one circle
 * per cell cost up to 262 144 GeoJSON features and read as "green dots" rather than
 * woodland. One image source is a single GPU texture, and MapLibre's linear resampling
 * softens the cell edges for free. `.cslmap` and `.vellummap` share it because both
 * reach the renderer as the same `CityData.forestCells`.
 *
 * Cells are 33.75 m, so any 1 px-per-cell image turns into blurry blocks at detail zoom.
 * Instead the field is smoothed, sampled {@link CANOPY_UPSAMPLE}× finer and cut at a soft
 * threshold: woodland becomes patches with a crisp, organic edge and a darker rim (the
 * topographic-map convention), denser cover more opaque. No light-based relief — on
 * a forest with clearings it read as craters.
 */

import type { ForestCell } from '@vellum/core';
import { CS1_WORLD_HALF, csToGeoArray } from '../coordinate-transform';

/** Cells per side of the game's vegetation grid (`FOREST_GRID_SIZE` in the parser). */
export const CANOPY_GRID_SIZE = 512;
/** Output pixels per grid cell; 4 keeps the edge crisp to about zoom 16. */
export const CANOPY_UPSAMPLE = 4;
/** Edge length of the painted image. */
export const CANOPY_IMAGE_SIZE = CANOPY_GRID_SIZE * CANOPY_UPSAMPLE;

const CELL_SIZE = (2 * CS1_WORLD_HALF) / CANOPY_GRID_SIZE;

/** Smoothed density at which a patch edge sits; lower keeps sparser woods. Tuned by eye. */
const EDGE_THRESHOLD = 0.18;
/** Half-width of the edge ramp, in smoothed-density units. */
const EDGE_SOFTNESS = 0.04;
/** Fill alpha of the sparsest and densest woodland. */
const MIN_ALPHA = 0.35;
const MAX_ALPHA = 0.75;
/** How much the rim darkens, and how far inward (in smoothed density) it fades out. */
const RIM_DARKEN = 0.35;
const RIM_WIDTH = 0.3;

/** Per-pixel alpha (0–255) and brightness multiplier, row 0 = CS1 Z = −8640. */
export interface CanopyRaster {
  alpha: Uint8ClampedArray;
  shade: Float32Array;
}

/** Corner coordinates `[TL, TR, BR, BL]` of image row 0 / col 0 in map space. */
export const CANOPY_COORDINATES = [
  csToGeoArray({ x: -CS1_WORLD_HALF, z: -CS1_WORLD_HALF }),
  csToGeoArray({ x: CS1_WORLD_HALF, z: -CS1_WORLD_HALF }),
  csToGeoArray({ x: CS1_WORLD_HALF, z: CS1_WORLD_HALF }),
  csToGeoArray({ x: -CS1_WORLD_HALF, z: CS1_WORLD_HALF }),
] as [[number, number], [number, number], [number, number], [number, number]];

/** Rebuilds the density grid from the parser's cells and derives alpha + shading. */
export function buildCanopyRaster(cells: readonly ForestCell[]): CanopyRaster {
  const n = CANOPY_GRID_SIZE;
  const density = new Float32Array(n * n);
  for (const cell of cells) {
    const col = Math.round((cell.x + CS1_WORLD_HALF) / CELL_SIZE);
    const row = Math.round((cell.z + CS1_WORLD_HALF) / CELL_SIZE);
    if (col >= 0 && col < n && row >= 0 && row < n) {
      density[row * n + col] = cell.density;
    }
  }

  // Two box passes ≈ a Gaussian: enough to merge neighbouring cells into patches.
  const field = boxBlur(boxBlur(density, n), n);
  const at = (r: number, c: number): number =>
    field[
      Math.min(n - 1, Math.max(0, r)) * n + Math.min(n - 1, Math.max(0, c))
    ]!;

  const size = CANOPY_IMAGE_SIZE;
  const alpha = new Uint8ClampedArray(size * size);
  const shade = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    // Pixel centre in cell units, so cell k spans pixels [k·S, (k+1)·S).
    const gy = (y + 0.5) / CANOPY_UPSAMPLE - 0.5;
    const r0 = Math.floor(gy);
    const fy = gy - r0;
    for (let x = 0; x < size; x++) {
      const gx = (x + 0.5) / CANOPY_UPSAMPLE - 0.5;
      const c0 = Math.floor(gx);
      const fx = gx - c0;
      const f =
        (at(r0, c0) * (1 - fx) + at(r0, c0 + 1) * fx) * (1 - fy) +
        (at(r0 + 1, c0) * (1 - fx) + at(r0 + 1, c0 + 1) * fx) * fy;
      const t = smoothstep(
        EDGE_THRESHOLD - EDGE_SOFTNESS,
        EDGE_THRESHOLD + EDGE_SOFTNESS,
        f,
      );
      if (t === 0) continue;
      const d = Math.min(1, f);
      const i = y * size + x;
      alpha[i] = Math.round(
        t * (MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * d) * 255,
      );
      const inner = smoothstep(EDGE_THRESHOLD, EDGE_THRESHOLD + RIM_WIDTH, f);
      shade[i] = 1 - RIM_DARKEN * (1 - inner);
    }
  }
  return { alpha, shade };
}

function smoothstep(lo: number, hi: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/** 3 × 3 box blur with clamped edges. */
function boxBlur(src: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let sum = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = Math.min(n - 1, Math.max(0, r + dr));
        for (let dc = -1; dc <= 1; dc++) {
          sum += src[rr * n + Math.min(n - 1, Math.max(0, c + dc))]!;
        }
      }
      out[r * n + c] = sum / 9;
    }
  }
  return out;
}

/**
 * Paints `raster` in `color` and returns it as a PNG data URI, or `null` when no 2D
 * canvas is available (tests without a DOM canvas).
 */
export function canopyDataUri(
  raster: CanopyRaster,
  color: string,
): string | null {
  const n = CANOPY_IMAGE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Let the browser parse the theme colour — any CSS form works.
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, n, n);
  const image = ctx.getImageData(0, 0, n, n);
  const px = image.data;
  for (let i = 0; i < n * n; i++) {
    const s = raster.shade[i]!;
    px[i * 4] = px[i * 4]! * s;
    px[i * 4 + 1] = px[i * 4 + 1]! * s;
    px[i * 4 + 2] = px[i * 4 + 2]! * s;
    px[i * 4 + 3] = raster.alpha[i]!;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
