import { describe, expect, it } from 'vitest';
import {
  buildCanopyRaster,
  CANOPY_GRID_SIZE,
  CANOPY_IMAGE_SIZE,
  CANOPY_UPSAMPLE,
} from './forest-canopy';

const CELL = 17280 / CANOPY_GRID_SIZE;
const cellAt = (col: number, row: number, density: number) => ({
  x: -8640 + col * CELL,
  z: -8640 + row * CELL,
  density,
});
/** Index of the image pixel at the centre of grid cell (col, row). */
const px = (col: number, row: number) =>
  (row * CANOPY_UPSAMPLE + 2) * CANOPY_IMAGE_SIZE + col * CANOPY_UPSAMPLE + 2;

const block = (c0: number, r0: number, side: number, density = 1) => {
  const cells = [];
  for (let r = r0; r < r0 + side; r++) {
    for (let c = c0; c < c0 + side; c++) cells.push(cellAt(c, r, density));
  }
  return cells;
};

describe('buildCanopyRaster', () => {
  it('fills a woodland patch where the cells are, and leaves open land clear', () => {
    const { alpha } = buildCanopyRaster(block(100, 100, 10));
    expect(alpha[px(105, 105)]).toBeGreaterThan(0);
    expect(alpha[px(130, 105)]).toBe(0);
  });

  it('drops a lone sparse tree instead of drawing a speck', () => {
    const { alpha } = buildCanopyRaster([cellAt(50, 50, 0.2)]);
    expect(alpha[px(50, 50)]).toBe(0);
  });

  it('darkens the rim relative to the interior', () => {
    const { shade, alpha } = buildCanopyRaster(block(100, 100, 20));
    // The darkest lit pixel along a row must sit on the rim, not in the interior.
    const row = (105 * CANOPY_UPSAMPLE + 2) * CANOPY_IMAGE_SIZE;
    let darkest = Infinity;
    for (let x = 110 * CANOPY_UPSAMPLE; x < 130 * CANOPY_UPSAMPLE; x++) {
      if (alpha[row + x]! > 0) darkest = Math.min(darkest, shade[row + x]!);
    }
    expect(darkest).toBeLessThan(shade[px(110, 105)]!);
  });
});
