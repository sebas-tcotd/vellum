import { describe, expect, it } from 'vitest';
import {
  areasGeoJson,
  decodeGrid,
  ringArea,
  summarizeAreas,
  traceAreas,
} from './grid.mjs';

const RES = 8;
const CELL = 10;

// Construye una grilla cruda como la emite el bridge: 8 bytes por celda,
// índice z * resolution + x. `paint(x, z)` devuelve [[id, alpha], ...].
function grid(paint) {
  const bytes = Buffer.alloc(RES * RES * 8);
  for (let z = 0; z < RES; z++)
    for (let x = 0; x < RES; x++) {
      const slots = paint(x, z) ?? [];
      slots.forEach(([id, alpha], slot) => {
        bytes[(z * RES + x) * 8 + slot] = id;
        bytes[(z * RES + x) * 8 + 4 + slot] = alpha;
      });
    }
  return {
    resolution: RES,
    cellSize: CELL,
    encoding: 'cell-u8x8-base64',
    layout: 'id1,id2,id3,id4,alpha1,alpha2,alpha3,alpha4',
    data: bytes.toString('base64'),
  };
}

const rect = (x0, z0, x1, z1, id) => (x, z) =>
  x >= x0 && x <= x1 && z >= z0 && z <= z1 ? [[id, 255]] : null;

describe('geometría de áreas desde la grilla cruda', () => {
  it('traza un rectángulo como un polígono antihorario en metros del mundo', () => {
    const traced = traceAreas(decodeGrid(grid(rect(4, 4, 5, 6, 7))));
    const rings = traced.get(7);
    expect(rings).toHaveLength(1);
    expect(ringArea(rings[0])).toBe(2 * 3 * CELL * CELL);
    // La grilla está centrada en el origen: la celda 4 empieza en x = 0.
    expect(rings[0]).toEqual(
      expect.arrayContaining([
        [0, 0],
        [20, 0],
        [20, 30],
        [0, 30],
      ]),
    );
    expect(rings[0]).toHaveLength(4);
  });

  it('reconoce huecos y los asigna a su polígono exterior', () => {
    const donut = (x, z) =>
      x >= 1 && x <= 5 && z >= 1 && z <= 5 && !(x === 3 && z === 3)
        ? [[2, 255]]
        : null;
    const summary = summarizeAreas(grid(donut), [{ id: 2, name: 'Dona' }]);
    expect(summary.areas[0]).toMatchObject({
      id: 2,
      cells: 24,
      polygons: 1,
      holes: 1,
    });
    const feature = areasGeoJson('district', grid(donut), []).features[0];
    expect(feature.geometry.coordinates).toHaveLength(1);
    expect(feature.geometry.coordinates[0]).toHaveLength(2);
    const outer = feature.geometry.coordinates[0][0];
    expect(outer[0]).toEqual(outer.at(-1));
  });

  it('no une celdas que solo se tocan por la esquina', () => {
    const diagonal = (x, z) =>
      (x === 2 && z === 2) || (x === 3 && z === 3) ? [[5, 255]] : null;
    const summary = summarizeAreas(grid(diagonal), [{ id: 5, name: 'D' }]);
    expect(summary.areas[0]).toMatchObject({ polygons: 2, holes: 0 });
  });

  it('asigna cada celda al ID con mayor peso, como GetDistrict', () => {
    const mixed = (x, z) =>
      x === 0 && z === 0
        ? [
            [1, 100],
            [2, 200],
          ]
        : x === 1 && z === 0
          ? [
              [0, 200],
              [1, 50],
            ]
          : null;
    const decoded = decodeGrid(grid(mixed));
    expect(decoded.owner[0]).toBe(2);
    expect(decoded.owner[1]).toBe(0);
  });

  it('verifica etiquetas por ID y reporta áreas sin celdas', () => {
    const summary = summarizeAreas(
      grid(rect(4, 4, 4, 4, 9)),
      [
        { id: 9, name: 'Nombre en inglés' },
        { id: 3, name: 'Sin celdas' },
      ],
      [
        { id: '9', name: 'Nombre en español', position: { x: 5, z: 5 } },
        { id: '3', name: 'Sin celdas', position: { x: 500, z: 0 } },
      ],
    );
    expect(summary.withoutCells).toEqual([{ id: 3, name: 'Sin celdas' }]);
    expect(summary.labels).toEqual([
      expect.objectContaining({
        id: 9,
        insideSameId: true,
        outsideGrid: false,
      }),
      expect.objectContaining({
        id: 3,
        insideSameId: false,
        outsideGrid: true,
      }),
    ]);
  });

  it('no da por dentro una etiqueta fuera de la grilla aunque la celda del borde sea suya', () => {
    // Grilla de ±40 m; el área 3 ocupa la columna del borde derecho.
    const summary = summarizeAreas(
      grid(rect(7, 0, 7, 7, 3)),
      [{ id: 3, name: 'Borde' }],
      [{ id: '3', name: 'Borde', position: { x: 60, z: 0 } }],
    );
    expect(summary.labels[0]).toMatchObject({
      insideSameId: false,
      outsideGrid: true,
      cellOwner: null,
    });
  });

  it('rechaza grillas con encoding o tamaño inesperado', () => {
    expect(() => decodeGrid({ ...grid(() => null), encoding: 'x' })).toThrow();
    expect(() =>
      decodeGrid({
        ...grid(() => null),
        data: Buffer.alloc(3).toString('base64'),
      }),
    ).toThrow();
  });
});
