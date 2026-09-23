import { describe, expect, it } from 'vitest';
import {
  parseCslmapTerrain,
  terrainLayers,
  vegetationComparison,
  waterComparison,
} from './compare.mjs';

const b64 = (values) => {
  const bytes = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => bytes.writeUInt16LE(v, i * 2));
  return bytes.toString('base64');
};

describe('comparación de agua', () => {
  it('contrasta celda a celda la profundidad cruda con res de .cslmap', () => {
    const cslmap = parseCslmapTerrain(
      '<X><SeaLevel>40</SeaLevel><Ter>100:0,100:0,90:60,80:200</Ter></X>',
    );
    const result = waterComparison(
      {
        terrain: { data: b64([100, 100, 90, 80]) },
        water: {
          depth: b64([0, 5, 60, 160]),
          sources: [
            { type: 1, target: 6400 },
            { type: 1, target: 6400 },
            { type: 2, target: 0 },
          ],
        },
      },
      cslmap,
    );
    expect(result).toMatchObject({
      cells: 4,
      rawWet: 3,
      cslmapWet: 2,
      bothWet: 2,
      wetJaccard: 0.667,
      terrainExact: 4,
      resEqualsDepth: 1,
      rawSurfaceModeMeters: 2,
      cslmapSeaLevel: 40,
      sourcesByType: { 1: 2, 2: 1 },
      naturalTargetsMeters: [100],
    });
  });

  it('declara el agua ausente en snapshots anteriores en vez de contar ceros', () => {
    expect(waterComparison({}, null)).toEqual({
      error: 'agua ausente en el snapshot',
    });
  });
});

describe('capas de alturas', () => {
  it('cuenta qué capa explica las celdas donde <Ter> difiere de RawHeights', () => {
    const cslmap = parseCslmapTerrain('<X><Ter>100:0,300:0,500:0</Ter></X>');
    const result = terrainLayers(
      {
        terrain: { data: b64([100, 200, 400]) },
        terrainLayers: [
          { name: 'BlockHeights', indices: [1, 2], values: [300, 500] },
          { name: 'RawHeights2', indices: [1], values: [999] },
        ],
      },
      cslmap,
    );
    expect(result).toEqual({
      mismatched: 2,
      layers: [
        { name: 'BlockHeights', differsFromRaw: 2, explainsMismatch: 2 },
        { name: 'RawHeights2', differsFromRaw: 1, explainsMismatch: 0 },
      ],
    });
  });
});

describe('vegetación', () => {
  it('contrasta <Forest> con m_forest, m_tree y la densidad derivada de árboles', () => {
    // Grilla 2×2: celda 0 con 2 árboles (120), celda 3 con 5 (satura en 255).
    const cslmap = { forest: [120, 0, 0, 255] };
    const grid = Buffer.from([120, 40, 0, 0, 9, 0, 255, 255]).toString(
      'base64',
    );
    const tree = (x, z) => ({ x, z });
    const result = vegetationComparison(
      {
        resourceGrid: { resolution: 2, data: grid },
        vegetation: [
          tree(-10, -10),
          tree(-20, -20),
          ...Array.from({ length: 5 }, () => tree(10, 10)),
        ],
        treeBufferLength: 262144,
      },
      cslmap,
    );
    expect(result).toEqual({
      cells: 4,
      cslmapForest: 2,
      equalsForest: 3,
      equalsTree: 3,
      equalsTrees: 4,
      trees: 7,
      treeBufferLength: 262144,
    });
  });
});
