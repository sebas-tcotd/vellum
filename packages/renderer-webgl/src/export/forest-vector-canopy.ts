import type { SceneEntity, ScenePoint } from '@vellum/core';
import { mixColorTokens } from '../expressions/color-mix';
import { CS1_WORLD_HALF } from '../coordinate-transform';
import { buildCanopyRaster, CANOPY_IMAGE_SIZE } from '../sources/forest-canopy';

/** Trace the existing smoothed canopy into editable density bands, including holes.
 * Sixteen alpha bands retain the soft edge and shaded rim without embedding an image.
 * Geometry comes exclusively from the live canopy's interpolated density field.
 */
export function buildVectorCanopy(
  density: Float32Array,
  color: string,
): SceneEntity[] {
  if (!density.some((value) => value > 0)) return [];
  const { alpha, shade } = buildCanopyRaster(density);
  const n = CANOPY_IMAGE_SIZE;
  const stride = n + 1;
  const unit = (2 * CS1_WORLD_HALF) / n;
  const entities: SceneEntity[] = [];
  for (let band = 0; band < 16; band++) {
    const lo = band * 16 + 1;
    const hi = lo + 16;
    const edges = new Map<number, number[]>();
    let count = 0;
    let alphaSum = 0;
    let shadeSum = 0;
    const inside = (x: number, y: number) =>
      x >= 0 &&
      y >= 0 &&
      x < n &&
      y < n &&
      alpha[y * n + x]! >= lo &&
      alpha[y * n + x]! < hi;
    const edge = (from: number, to: number) => {
      const next = edges.get(from);
      if (next) next.push(to);
      else edges.set(from, [to]);
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!inside(x, y)) continue;
        const i = y * n + x;
        count++;
        alphaSum += alpha[i]!;
        shadeSum += shade[i]!;
        const topLeft = y * stride + x;
        if (!inside(x, y - 1)) edge(topLeft, topLeft + 1);
        if (!inside(x + 1, y)) edge(topLeft + 1, topLeft + stride + 1);
        if (!inside(x, y + 1)) edge(topLeft + stride + 1, topLeft + stride);
        if (!inside(x - 1, y)) edge(topLeft + stride, topLeft);
      }
    }
    if (!count) continue;
    const rings: ScenePoint[][] = [];
    while (edges.size) {
      const start = edges.keys().next().value!;
      const vertices = [start];
      let at = start;
      do {
        const next = edges.get(at)!;
        const to = next.pop()!;
        if (!next.length) edges.delete(at);
        vertices.push(to);
        at = to;
      } while (at !== start && edges.has(at));
      // Remove straight intermediate vertices: large flat areas stay compact polygons.
      const points = vertices
        .filter((vertex, i) => {
          if (i === 0 || i === vertices.length - 1) return true;
          return vertex - vertices[i - 1]! !== vertices[i + 1]! - vertex;
        })
        .map((vertex) => ({
          x: -CS1_WORLD_HALF + (vertex % stride) * unit,
          z: -CS1_WORLD_HALF + Math.floor(vertex / stride) * unit,
        }));
      if (points.length >= 4) rings.push(points);
    }
    entities.push({
      id: `forest-canopy-band-${band}`,
      geometry: { kind: 'polygon', rings },
      fill: {
        color: mixColorTokens(color, '#000000', 1 - shadeSum / count),
        opacity: alphaSum / count / 255,
        fillRule: 'evenodd',
      },
    });
  }
  return entities;
}
