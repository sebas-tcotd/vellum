import { describe, expect, it } from 'vitest';
import { corpusSummary } from './compare.mjs';

const domain = (count, cslmap = true) => ({
  raw: { present: count !== null, count },
  cslmap: { field: { present: cslmap } },
});

const entry = (id, routes, extra = {}) => ({
  id,
  diagnostics: { unsupported: ['water'], errors: [] },
  comparison: {
    complete: false,
    domains: {
      roads: domain(10),
      transit: domain(routes.length),
      buildings: domain(5, false),
      districts: domain(1),
      vegetation: domain(null),
      parks: domain(0),
      terrain: domain(null),
      water: domain(null),
    },
    transitRoutes: routes,
    areaGeometry: {
      districts: { labels: [{ insideSameId: true }, { insideSameId: false }] },
      parks: { error: 'grilla ausente en el snapshot' },
    },
  },
  ...extra,
});

describe('resumen del corpus', () => {
  it('agrega dominios, tránsito y áreas sin contar entradas no comparadas', () => {
    const corpus = corpusSummary([
      entry('a', [
        {
          id: 1,
          stops: 4,
          stopsOnNamedRoad: 3,
          inCslmap: true,
          cslmapIsSubsequence: true,
          legsWithoutPath: 0,
        },
        {
          id: 2,
          stops: 0,
          stopsOnNamedRoad: 0,
          inCslmap: true,
          cslmapIsSubsequence: false,
          legsWithoutPath: 0,
        },
      ]),
      entry('b', [
        // Tramos no capturados: sin evidencia de ruta, no es una excepción.
        {
          id: 8,
          stops: 3,
          stopsOnNamedRoad: 3,
          inCslmap: true,
          error: 'tramos no capturados',
        },
        {
          id: 7,
          stops: 2,
          stopsOnNamedRoad: 0,
          inCslmap: true,
          cslmapIsSubsequence: false,
          legsWithoutPath: 1,
        },
      ]),
      { id: 'pendiente', status: 'ready-for-capture' },
    ]);
    expect(corpus.fixtures).toEqual(['a', 'b']);
    expect(corpus.domains.roads.rawCount).toEqual([10, 10]);
    expect(corpus.domains.buildings.cslmap).toEqual([]);
    expect(corpus.domains.vegetation).toMatchObject({
      raw: [],
      rawCount: null,
    });
    // La línea sin paradas no cuenta como evidencia de ruta.
    expect(corpus.transit).toMatchObject({
      lines: 3,
      cslmapIsSubsequence: 1,
      notSubsequence: ['b#7'],
      withoutLegs: 1,
      legsWithoutPath: 1,
      stops: 9,
      stopsOnNamedRoad: 6,
    });
    expect(corpus.areas.districts).toEqual({ labels: 4, insideSameId: 2 });
    expect(corpus.areas.parks).toEqual({ labels: 0, insideSameId: 0 });
    expect(corpus.unsupported).toEqual({ water: ['a', 'b'] });
  });
});
