import { beforeAll, describe, expect, it } from 'vitest';
import type { SceneEntity, ScenePoint } from '@vellum/core';
import { CS1_WORLD_HALF } from '../coordinate-transform';
import { mixColorTokens } from '../expressions/color-mix';
import {
  buildCanopyRaster,
  CANOPY_GRID_SIZE,
  CANOPY_IMAGE_SIZE,
} from '../sources/forest-canopy';
import { buildVectorCanopy } from './forest-vector-canopy';

/** Even-odd coverage, including holes and disjoint exterior rings. */
function covers(entity: SceneEntity, point: ScenePoint): boolean {
  if (entity.geometry.kind !== 'polygon') return false;
  let inside = false;
  for (const ring of entity.geometry.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (
        a.z > point.z !== b.z > point.z &&
        point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x
      )
        inside = !inside;
    }
  }
  return inside;
}

describe('vector canopy density bands', () => {
  const density = new Float32Array(CANOPY_GRID_SIZE ** 2);
  const rectangle = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    value: number,
  ) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) density[y * CANOPY_GRID_SIZE + x] = value;
  };
  rectangle(230, 260, 240, 260, 1);
  rectangle(255, 269, 257, 270, 0.85);
  rectangle(239, 247, 247, 254, 0); // enclosed clearing
  rectangle(280, 287, 260, 267, 0.7); // disconnected, lower-density woodland
  let entities: SceneEntity[];
  let raster: ReturnType<typeof buildCanopyRaster>;
  const worldAt = (x: number, y: number): ScenePoint => ({
    x: -CS1_WORLD_HALF + ((x + 0.5) / CANOPY_IMAGE_SIZE) * 2 * CS1_WORLD_HALF,
    z: -CS1_WORLD_HALF + ((y + 0.5) / CANOPY_IMAGE_SIZE) * 2 * CS1_WORLD_HALF,
  });
  beforeAll(() => {
    raster = buildCanopyRaster(density);
    entities = buildVectorCanopy(density, '#447744');
  });

  it('produces closed, nonempty rings with area', () => {
    expect(entities.length).toBeGreaterThan(0);
    for (const entity of entities) {
      expect(entity.geometry.kind).toBe('polygon');
      if (entity.geometry.kind !== 'polygon') continue;
      expect(entity.geometry.rings.length).toBeGreaterThan(0);
      for (const ring of entity.geometry.rings) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring.at(-1));
        const twiceArea = ring
          .slice(1)
          .reduce(
            (sum, point, i) =>
              sum + ring[i]!.x * point.z - point.x * ring[i]!.z,
            0,
          );
        expect(Math.abs(twiceArea)).toBeGreaterThan(0);
      }
    }
  });

  it('retains the enclosed clearing, asymmetric extension and disconnected region', () => {
    for (const [col, row, expected] of [
      [243, 251, false],
      [234, 243, true],
      [265, 266, true],
      [283, 263, true],
      [275, 263, false],
      [265, 242, false],
    ] as const) {
      const point = worldAt(col * 4 + 1, row * 4 + 1);
      expect(entities.some((entity) => covers(entity, point))).toBe(expected);
    }
  });

  it('matches raster coverage and opacity within one alpha band across the patch and clearings', () => {
    for (let y = 944; y < 1100; y += 11) {
      for (let x = 908; x < 1170; x += 13) {
        const covering = entities.filter((entity) =>
          covers(entity, worldAt(x, y)),
        );
        const alpha = raster.alpha[y * CANOPY_IMAGE_SIZE + x]! / 255;
        expect(covering.length).toBe(alpha > 0 ? 1 : 0);
        expect(
          Math.abs((covering[0]?.fill?.opacity ?? 0) - alpha),
        ).toBeLessThanOrEqual(16 / 255);
      }
    }
  });

  it.each(['#3f7', '#3f78', '#33667788', 'hsl(120, 45%, 35%)'])(
    'shades supported theme token %s',
    (color) => {
      const actual = buildVectorCanopy(density, color);
      for (const entity of actual) {
        const band = Number(entity.id.split('-').at(-1));
        let shadeSum = 0;
        let count = 0;
        for (let i = 0; i < raster.alpha.length; i++) {
          if (
            raster.alpha[i]! >= band * 16 + 1 &&
            raster.alpha[i]! < band * 16 + 17
          ) {
            shadeSum += raster.shade[i]!;
            count++;
          }
        }
        expect(entity.fill?.color).toBe(
          mixColorTokens(color, '#000000', 1 - shadeSum / count),
        );
        expect(entity.fill?.color).not.toBe(color);
      }
    },
  );
});
