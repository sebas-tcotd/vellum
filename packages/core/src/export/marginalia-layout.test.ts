import { describe, expect, it } from 'vitest';
import {
  makeCityData,
  makeLayerVisibility,
  makeMarginaliaLabels,
  makePresentationOptions,
  makeRenderStyle,
  makeRoadSegment,
  makeTransitLine,
} from '../testing';
import { DEFAULT_LAYER_OPTIONS } from '../types/layer';
import type { ExportPresentationOptions } from '../types/export-presentation';
import {
  buildMarginaliaContent,
  composeMarginalia,
  formatMarginaliaCount,
  layoutMarginalia,
  layoutSnapshotMarginalia,
  marginaliaAvailability,
  measureMarginaliaText,
  resolveMarginaliaFrame,
  type MarginaliaContentInputs,
  type MarginaliaLayout,
  type MarginaliaPrimitive,
  type MarginaliaText,
} from './marginalia-layout';
import { createExportSnapshot } from '../types/export-pipeline';
import { mapFrameMarginPixels } from './map-frame-metrics';
import { reliefDomain } from './terrain-relief-domain';
import {
  worldUnitsPerPixelForZoom,
  zoomForWorldUnitsPerPixel,
} from './output-density';

const CITY = makeCityData({
  cityName: 'Puerto Nuevo',
  roadSegments: [
    makeRoadSegment({ id: 'a', itemClass: 'Highway' }),
    makeRoadSegment({ id: 'b', itemClass: 'Small Road' }),
    makeRoadSegment({ id: 'c', itemClass: 'Train Track' }),
    // Excluded classes never reach the legend.
    makeRoadSegment({ id: 'd', itemClass: 'Ship Path' }),
  ],
  transitLines: [makeTransitLine()],
});

function inputs(
  presentation: Partial<ExportPresentationOptions>,
  overrides: Partial<MarginaliaContentInputs> = {},
): MarginaliaContentInputs {
  return {
    presentation: makePresentationOptions(presentation),
    labels: makeMarginaliaLabels(),
    style: makeRenderStyle(),
    cityData: CITY,
    activeLayers: makeLayerVisibility(),
    layerOptions: DEFAULT_LAYER_OPTIONS,
    camera: { bearing: 0, pitch: 0 },
    worldUnitsPerPixel: 2,
    ...overrides,
  };
}

function texts(layout: MarginaliaLayout): string[] {
  return layout.primitives
    .filter((p): p is MarginaliaText => p.kind === 'text')
    .map((p) => p.text);
}

/** Every numeric field of a primitive, flattened in a stable order. */
function numbers(primitive: MarginaliaPrimitive): number[] {
  const out: number[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'number') out.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object')
      Object.entries(value).forEach(([key, inner]) => {
        // Opacity is a ratio, not a length.
        if (key !== 'fillOpacity' && key !== 'offset') visit(inner);
      });
  };
  visit(primitive);
  return out;
}

const ALL_ON = {
  showCityName: true,
  showRoadLegend: true,
  showTransitLegend: true,
  showElevationLegend: true,
  showScaleBar: true,
  showOrientation: true,
  showSummary: true,
  showSourceNote: true,
  author: 'Ana',
} as const;

describe('layoutMarginalia — unidad y esquinas', () => {
  it('viewport PNG 2x: u = 16 y el panel queda en la esquina inferior derecha', () => {
    const content = buildMarginaliaContent(
      inputs({
        showCityName: true,
        showRoadLegend: true,
        showScaleBar: true,
        corner: 'bottom-right',
      }),
    );
    const surface = { width: 2400, height: 1600 };
    const layout = layoutMarginalia(content, surface, 40, 'bottom-right');

    expect(layout.unit).toBe(16);
    const panel = layout.primitives[0]!;
    expect(panel.kind).toBe('rect');
    if (panel.kind !== 'rect') return;
    const inset = 40 + 2 * 16;
    expect(panel.x + panel.width).toBeCloseTo(2400 - inset);
    expect(panel.y + panel.height).toBeCloseTo(1600 - inset);
    expect(panel.fill).toBe('#f7f6f1');
    expect(panel.fillOpacity).toBe(0.9);
    expect(panel.stroke).toBe('#3b3a36');
    expect(panel.strokeWidth).toBeCloseTo(0.15 * 16);
    expect(texts(layout)).toContain('PUERTO NUEVO');
    expect(layout.omitted).toEqual([]);
  });

  it.each([
    ['top-left', 'left', 'top'],
    ['top-right', 'right', 'top'],
    ['bottom-left', 'left', 'bottom'],
    ['bottom-right', 'right', 'bottom'],
  ] as const)('ancla el panel a la esquina %s', (corner, h, v) => {
    const content = buildMarginaliaContent(inputs({ showCityName: true }));
    const layout = layoutMarginalia(
      content,
      { width: 1000, height: 1000 },
      0,
      corner,
    );
    const panel = layout.primitives[0]!;
    if (panel.kind !== 'rect') throw new Error('panel expected');
    const inset = 20;
    if (h === 'left') expect(panel.x).toBeCloseTo(inset);
    else expect(panel.x + panel.width).toBeCloseTo(1000 - inset);
    if (v === 'top') expect(panel.y).toBeCloseTo(inset);
    else expect(panel.y + panel.height).toBeCloseTo(1000 - inset);
  });

  it('full-map 6000 vs 12000: el panel mide el doble y el inset sigue al margen real del marco', () => {
    const base = {
      presentation: makePresentationOptions({ ...ALL_ON, corner: 'top-left' }),
      labels: makeMarginaliaLabels(),
      style: makeRenderStyle(),
      cityData: CITY,
      activeLayers: makeLayerVisibility(),
      layerOptions: DEFAULT_LAYER_OPTIONS,
    };
    const extent = { minX: -8640, maxX: 8640, minZ: -8640, maxZ: 8640 };
    const frameFor = (side: number) =>
      resolveMarginaliaFrame({
        area: 'full-map',
        format: 'png-1x',
        surface: { width: side, height: side },
        extent,
        viewportWorldUnitsPerPixel: 0,
        camera: { bearing: 0, pitch: 0 },
      });
    const at6000 = composeMarginalia(base, frameFor(6000));
    const at12000 = composeMarginalia(base, frameFor(12000));

    expect(texts(at12000)).toEqual(texts(at6000));
    const panel = (layout: MarginaliaLayout) => {
      const rect = layout.primitives[0]!;
      if (rect.kind !== 'rect') throw new Error('panel expected');
      return rect;
    };
    expect(panel(at12000).width).toBeCloseTo(panel(at6000).width * 2, 6);
    expect(panel(at12000).height).toBeCloseTo(panel(at6000).height * 2, 6);
    // The inset is the frame margin at each document's own zoom plus 2u —
    // the frame ramp is not linear in zoom, so it is not simply doubled.
    for (const [layout, side] of [
      [at6000, 6000],
      [at12000, 12000],
    ] as const) {
      const margin = mapFrameMarginPixels(
        zoomForWorldUnitsPerPixel(frameFor(side).worldUnitsPerPixel),
      );
      expect(panel(layout).x).toBeCloseTo(margin + 2 * layout.unit, 6);
    }
    // Inner geometry, relative to the panel corner, is exactly twice as large.
    const relative = (layout: MarginaliaLayout) =>
      layout.primitives.map((primitive) => {
        const origin = panel(layout);
        return numbers(
          primitive.kind === 'text'
            ? {
                ...primitive,
                x: primitive.x - origin.x,
                y: primitive.y - origin.y,
              }
            : primitive,
        );
      });
    const small = relative(at6000);
    const large = relative(at12000);
    small.forEach((values, index) => {
      if (at6000.primitives[index]!.kind !== 'text') return;
      values.forEach((value, i) =>
        expect(large[index]![i]).toBeCloseTo(value * 2, 6),
      );
    });
  });

  it('con layoutMarginalia y márgenes proporcionales todo difiere por el factor 2', () => {
    const at6000 = layoutMarginalia(
      buildMarginaliaContent(inputs(ALL_ON, { worldUnitsPerPixel: 4 })),
      { width: 6000, height: 6000 },
      30,
      'top-right',
    );
    const at12000 = layoutMarginalia(
      buildMarginaliaContent(inputs(ALL_ON, { worldUnitsPerPixel: 2 })),
      { width: 12000, height: 12000 },
      60,
      'top-right',
    );
    expect(at12000.primitives).toHaveLength(at6000.primitives.length);
    at6000.primitives.forEach((primitive, index) => {
      const scaled = numbers(at12000.primitives[index]!);
      numbers(primitive).forEach((value, i) =>
        expect(scaled[i]).toBeCloseTo(value * 2, 6),
      );
    });
  });

  it('nunca usa píxeles fijos: todo el texto es múltiplo de u', () => {
    const layout = layoutMarginalia(
      buildMarginaliaContent(inputs(ALL_ON)),
      { width: 3000, height: 2000 },
      0,
      'bottom-left',
    );
    const sizes = new Set(
      layout.primitives
        .filter((p): p is MarginaliaText => p.kind === 'text')
        .map((p) => p.fontSize / layout.unit),
    );
    for (const size of sizes) {
      expect([3, 1.6, 1.3, 1.4, 1.1]).toContainEqual(
        expect.closeTo(size, 6) as number,
      );
    }
  });
});

describe('buildMarginaliaContent', () => {
  it('leyenda vial: solo los tiers presentes, con colores del theme', () => {
    const content = buildMarginaliaContent(inputs({ showRoadLegend: true }));
    const block = content.blocks.find((b) => b.id === 'road-legend');
    expect(block?.id).toBe('road-legend');
    if (block?.id !== 'road-legend') return;
    expect(block.rows.map((row) => row.label)).toEqual([
      'Highway',
      'Local road',
      'Train track',
    ]);
    expect(block.rows[0]).toMatchObject({ fill: '#a098b0', weight: 1 });
    expect(block.rows[1]!.weight).toBeLessThan(block.rows[0]!.weight);
  });

  it('tránsito denso: 8 filas y luego "+32 lines"', () => {
    const cityData = makeCityData({
      transitLines: Array.from({ length: 40 }, (_, index) =>
        makeTransitLine({
          id: `l${index}`,
          name: `Line ${index + 1}`,
          color: '#123456',
        }),
      ),
    });
    const content = buildMarginaliaContent(
      inputs({ showTransitLegend: true }, { cityData }),
    );
    const block = content.blocks.find((b) => b.id === 'transit-legend');
    if (block?.id !== 'transit-legend') throw new Error('transit expected');
    expect(block.rows).toHaveLength(8);
    expect(block.rows[0]).toEqual({ label: 'Line 1', color: '#123456' });
    expect(block.more).toBe('+32 lines');
    const layout = layoutMarginalia(
      content,
      { width: 4000, height: 4000 },
      0,
      'top-left',
    );
    expect(texts(layout)).toContain('+32 lines');
  });

  it('capa inactiva: el bloque vial se omite y la disponibilidad lo explica', () => {
    const activeLayers = makeLayerVisibility({ roads: false });
    const content = buildMarginaliaContent(
      inputs({ showRoadLegend: true }, { activeLayers }),
    );
    expect(content.blocks.map((b) => b.id)).not.toContain('road-legend');
    expect(
      marginaliaAvailability(inputs({}, { activeLayers })).showRoadLegend,
    ).toBe('layer-hidden');
  });

  it('sin datos: la disponibilidad lo distingue de una capa apagada', () => {
    const availability = marginaliaAvailability(
      inputs({}, { cityData: makeCityData() }),
    );
    expect(availability.showRoadLegend).toBe('no-data');
    expect(availability.showTransitLegend).toBe('no-data');
  });

  it('cámara con pitch: la escala no se ofrece ni se dibuja', () => {
    const tilted = inputs(
      { showScaleBar: true },
      { camera: { bearing: 0, pitch: 30 } },
    );
    expect(marginaliaAvailability(tilted).showScaleBar).toBe('camera-pitch');
    expect(buildMarginaliaContent(tilted).blocks).toEqual([]);
  });

  it('elevación: rampa low→mid→high en los anclajes del renderer, con el rango en metros', () => {
    const content = buildMarginaliaContent(
      inputs({ showElevationLegend: true }),
    );
    const block = content.blocks[0];
    if (block?.id !== 'elevation-legend') throw new Error('elevation expected');
    const domain = reliefDomain(CITY.terrainDem);
    expect(block.stops).toEqual([
      { offset: 0, color: '#95ae79' },
      {
        offset: (domain.mid - domain.min) / (domain.max - domain.min),
        color: '#deddbe',
      },
      { offset: 1, color: '#c4a06a' },
    ]);
    // makeCityData: elevMin 0 (floored to 1 raw unit), elevMax 6400; metres are raw / 64.
    expect(block.minLabel).toBe('0 m');
    expect(block.maxLabel).toBe('100 m');
  });

  it('autor largo se recorta a 60 caracteres tras trim; vacío no dibuja línea', () => {
    const long = `  ${'x'.repeat(200)}  `;
    const content = buildMarginaliaContent(inputs({ author: long }));
    const identity = content.blocks[0];
    if (identity?.id !== 'identity') throw new Error('identity expected');
    expect(identity.author).toHaveLength(60);
    expect(identity.title).toBeNull();

    expect(buildMarginaliaContent(inputs({ author: '   ' })).blocks).toEqual(
      [],
    );
  });

  it('nota de fuente: archivo, fecha y límites; omite segmentos sin dato', () => {
    const content = buildMarginaliaContent(
      inputs(
        { showSourceNote: true },
        { labels: makeMarginaliaLabels({ sourceDate: '' }) },
      ),
    );
    const note = content.blocks[0];
    if (note?.id !== 'source-note') throw new Error('note expected');
    expect(note.segments).toEqual([
      'test-city.cslmap',
      'Cities: Skylines data; local coordinates without geographic projection',
    ]);
  });

  it('usa colores del RenderStyleParams, nunca tokens del shell', () => {
    const content = buildMarginaliaContent(inputs(ALL_ON));
    expect(content.theme).toEqual({
      background: '#f7f6f1',
      frame: '#3b3a36',
      text: '#222222',
    });
    const layout = layoutMarginalia(
      content,
      { width: 3000, height: 3000 },
      0,
      'bottom-left',
    );
    for (const primitive of layout.primitives) {
      expect(JSON.stringify(primitive)).not.toMatch(/var\(--|Cormorant/);
    }
  });
});

describe('revisión 3.5 — texto, omisiones y conteos', () => {
  it('mide CJK, Hangul, fullwidth y emoji como dos avances y recorta en consecuencia', () => {
    expect(measureMarginaliaText('東京', 10)).toBeCloseTo(24);
    expect(measureMarginaliaText('서울', 10)).toBeCloseTo(24);
    expect(measureMarginaliaText('ＡＢ', 10)).toBeCloseTo(24);
    expect(measureMarginaliaText('🚇a', 10)).toBeCloseTo(18);
    // A combining mark adds no advance.
    expect(measureMarginaliaText('e\u0301', 10)).toBeCloseTo(6);

    const cityData = makeCityData({ cityName: '東'.repeat(60) });
    const layout = layoutMarginalia(
      buildMarginaliaContent(inputs({ showCityName: true }, { cityData })),
      { width: 1000, height: 1000 },
      0,
      'top-left',
    );
    const title = layout.primitives.find(
      (p): p is MarginaliaText => p.kind === 'text',
    )!;
    const panel = layout.primitives[0]!;
    if (panel.kind !== 'rect') throw new Error('panel expected');
    expect(title.text.endsWith('…')).toBe(true);
    expect(
      measureMarginaliaText(title.text, title.fontSize, title.letterSpacing),
    ).toBeLessThanOrEqual(panel.width - 4 * layout.unit + 1e-9);
  });

  it('omite un bloque cuyo texto no conserva ni un glifo, en vez de dibujar swatches mudos', () => {
    // A thick frame margin squeezes the panel to 40 px of inner width: the
    // swatch column (3.4u = 34 px) leaves 6 px, less than one glyph plus "…".
    const layout = layoutMarginalia(
      buildMarginaliaContent(inputs({ showRoadLegend: true })),
      { width: 1000, height: 4000 },
      440,
      'top-left',
    );
    expect(layout.omitted).toEqual(['road-legend']);
    expect(texts(layout)).not.toContain('');
    expect(layout.primitives.some((p) => p.kind === 'line')).toBe(false);
  });

  it('nunca deja un "·" suelto al principio de una línea', () => {
    for (let width = 300; width <= 1400; width += 7) {
      const layout = layoutMarginalia(
        buildMarginaliaContent(
          inputs({ showSourceNote: true, showSummary: true }),
        ),
        { width, height: 1000 },
        0,
        'top-left',
      );
      for (const line of texts(layout)) {
        expect(line.startsWith('·')).toBe(false);
      }
    }
  });

  it('formatea conteos con todas las apariciones de {count} y nunca imprime "-0 m"', () => {
    expect(
      formatMarginaliaCount(
        { one: '{count}', other: '{count}/{count}' },
        1204,
        ',',
      ),
    ).toBe('1,204/1,204');
    const content = buildMarginaliaContent(
      inputs(
        { showElevationLegend: true },
        {
          cityData: makeCityData({
            terrainDem: { dataUri: '', elevMin: -20, elevMax: 6400 },
          }),
        },
      ),
    );
    const block = content.blocks[0];
    if (block?.id !== 'elevation-legend') throw new Error('elevation expected');
    expect(block.minLabel).toBe('0 m');
  });

  it('el resumen cuenta solo los tramos que la clasificación vial dibuja', () => {
    const content = buildMarginaliaContent(inputs({ showSummary: true }));
    const summary = content.blocks[0];
    if (summary?.id !== 'summary') throw new Error('summary expected');
    // CITY has 4 segments; `Ship Path` is excluded from the road network.
    expect(summary.items[0]).toBe('3 roads');
  });

  it('SVG: sin marco de mapa, el inset es solo 2u', () => {
    const shared = {
      area: 'viewport' as const,
      surface: { width: 2000, height: 1000 },
      extent: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
      viewportWorldUnitsPerPixel: 1,
      camera: { bearing: 0, pitch: 0 },
    };
    const base = {
      presentation: makePresentationOptions({
        showCityName: true,
        corner: 'top-left',
      }),
      labels: makeMarginaliaLabels(),
      style: makeRenderStyle(),
      cityData: CITY,
      activeLayers: makeLayerVisibility(),
      layerOptions: DEFAULT_LAYER_OPTIONS,
    };
    const svgFrame = resolveMarginaliaFrame({ ...shared, format: 'svg' });
    expect(svgFrame.hasMapFrame).toBe(false);
    const svg = composeMarginalia(base, svgFrame);
    const png = composeMarginalia(
      base,
      resolveMarginaliaFrame({ ...shared, format: 'png-1x' }),
    );
    const x = (layout: MarginaliaLayout) => {
      const rect = layout.primitives[0]!;
      if (rect.kind !== 'rect') throw new Error('panel expected');
      return rect.x;
    };
    expect(x(svg)).toBeCloseTo(2 * svg.unit, 6);
    expect(x(png)).toBeGreaterThan(x(svg));
  });
});

describe('layoutMarginalia — zona segura y omisiones', () => {
  it('superficie muy apaisada: omite en orden inverso de jerarquía y lo reporta', () => {
    const cityData = makeCityData({
      ...CITY,
      transitLines: Array.from({ length: 12 }, (_, index) =>
        makeTransitLine({ id: `l${index}`, name: `Line ${index}` }),
      ),
    });
    // A thick frame margin eats the short axis: the safe zone is what is left.
    const layout = layoutMarginalia(
      buildMarginaliaContent(inputs(ALL_ON, { cityData })),
      { width: 8000, height: 700 },
      150,
      'bottom-left',
    );
    expect(layout.omitted.length).toBeGreaterThan(0);
    expect(layout.omitted.at(-1)).toBe('source-note');
    expect(layout.bounds).not.toBeNull();
    const panel = layout.primitives[0]!;
    if (panel.kind !== 'rect') throw new Error('panel expected');
    expect(panel.height).toBeLessThanOrEqual(700 - 2 * (150 + 14) + 1e-9);
    expect(panel.y + panel.height).toBeCloseTo(700 - 150 - 14);
    expect(panel.width).toBeLessThanOrEqual(8000 * 0.34 + 1e-9);
  });

  it('el panel nunca pasa del 34 % del ancho: los textos largos se recortan con "…"', () => {
    const cityData = makeCityData({ cityName: 'A'.repeat(400) });
    const layout = layoutMarginalia(
      buildMarginaliaContent(inputs({ showCityName: true }, { cityData })),
      { width: 1000, height: 1000 },
      0,
      'top-left',
    );
    const [title] = texts(layout);
    expect(title?.endsWith('…')).toBe(true);
    const panel = layout.primitives[0]!;
    if (panel.kind !== 'rect') throw new Error('panel expected');
    expect(panel.width).toBeLessThanOrEqual(340 + 1e-9);
  });

  it('sin bloques no dibuja nada', () => {
    const layout = layoutMarginalia(
      buildMarginaliaContent(inputs({})),
      { width: 1000, height: 1000 },
      0,
      'top-left',
    );
    expect(layout.primitives).toEqual([]);
    expect(layout.bounds).toBeNull();
  });

  it('el resumen parte líneas entre conteos, nunca entre número y sustantivo', () => {
    const layout = layoutMarginalia(
      buildMarginaliaContent(inputs({ showSummary: true })),
      { width: 1200, height: 800 },
      0,
      'top-left',
    );
    const lines = texts(layout);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line).toMatch(/^\d/);
      expect(line).not.toMatch(/ \d+$/);
    }
  });

  it('mide texto con el avance monoespaciado de DM Mono', () => {
    expect(measureMarginaliaText('ABCD', 10)).toBeCloseTo(24);
    expect(measureMarginaliaText('ABCD', 10, 1)).toBeCloseTo(27);
  });
});

describe('frame de marginalia a partir de un snapshot', () => {
  const style = makeRenderStyle();

  it('el snapshot y un frame resuelto aparte producen el mismo layout', () => {
    const snapshot = createExportSnapshot({
      cityData: CITY,
      style,
      activeLayers: makeLayerVisibility(),
      layerOptions: DEFAULT_LAYER_OPTIONS,
      transitDimming: false,
      watermarkVisible: false,
      camera: { longitude: 0, latitude: 0, zoom: 13, bearing: 20, pitch: 0 },
      extent: { minX: -1000, maxX: 1000, minZ: -500, maxZ: 500 },
      surface: { width: 2400, height: 1600 },
      request: {
        area: 'viewport',
        format: 'png-2x',
        background: 'white',
        fileName: 'x',
        presentation: makePresentationOptions({
          ...ALL_ON,
          corner: 'top-right',
        }),
        labels: makeMarginaliaLabels(),
      },
    });
    const fromSnapshot = layoutSnapshotMarginalia(snapshot);

    const frame = resolveMarginaliaFrame({
      area: 'viewport',
      format: 'png-2x',
      surface: { width: 2400, height: 1600 },
      extent: snapshot.extent,
      viewportWorldUnitsPerPixel: worldUnitsPerPixelForZoom(13),
      camera: { bearing: 20, pitch: 0 },
    });
    const composed = composeMarginalia(
      {
        presentation: snapshot.request.presentation,
        labels: snapshot.request.labels,
        style,
        cityData: CITY,
        activeLayers: snapshot.activeLayers,
        layerOptions: snapshot.layerOptions,
      },
      frame,
    );
    expect(composed).toEqual(fromSnapshot);
    expect(fromSnapshot.primitives.length).toBeGreaterThan(0);
  });

  it('full-map: densidad = mayor razón extent/superficie; cámara neutra', () => {
    const frame = resolveMarginaliaFrame({
      area: 'full-map',
      format: 'png-1x',
      surface: { width: 6000, height: 3000 },
      extent: { minX: 0, maxX: 12000, minZ: 0, maxZ: 9000 },
      viewportWorldUnitsPerPixel: 99,
      camera: { bearing: 45, pitch: 30 },
    });
    expect(frame.worldUnitsPerPixel).toBe(3);
    expect(frame.camera).toEqual({ bearing: 0, pitch: 0 });
    expect(
      mapFrameMarginPixels(zoomForWorldUnitsPerPixel(frame.worldUnitsPerPixel)),
    ).toBeGreaterThan(0);
  });
});
