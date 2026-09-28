import { buildCartographicScene } from '@vellum/renderer-webgl';
import { describe, expect, it } from 'vitest';
import {
  composeMarginalia,
  DEFAULT_LAYER_OPTIONS,
  resolveMarginaliaFrame,
  type CartographicScene,
  type SceneEntity,
} from '@vellum/core';
import {
  makeCityData,
  makeLayerVisibility,
  makeMarginaliaLabels,
  makePresentationOptions,
  makeRenderStyle,
} from '@vellum/core/testing';
import { serializeSceneToSvg } from './svg-serializer';

function scene(overrides: Partial<CartographicScene> = {}): CartographicScene {
  return {
    info: { title: 'Testville', description: 'Cartographic export.' },
    labels: [],
    symbols: [],
    projection: {
      extent: { minX: -100, maxX: 100, minZ: -50, maxZ: 50 },
      width: 400,
      height: 200,
    },
    background: '#ffffff',
    gradients: [],
    layers: [],
    emblem: null,
    marginalia: null,
    warnings: [],
    ...overrides,
  };
}

function layer(
  id: CartographicScene['layers'][number]['id'],
  entities: SceneEntity[],
  visible = true,
) {
  return { id, visible, entities };
}

function render(input: CartographicScene, chunkTarget = 1024 * 1024): string {
  return [...serializeSceneToSvg(input, chunkTarget)].join('');
}

describe('serializeSceneToSvg', () => {
  it('emits a well-formed document with the exact requested viewBox', () => {
    const xml = render(scene());
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
    expect(xml).toContain('viewBox="0 0 400 200"');
    expect(xml).toContain('width="400"');
    expect(xml).toContain('height="200"');
    expect(xml.endsWith('</svg>')).toBe(true);
    expect(
      new DOMParser()
        .parseFromString(xml, 'image/svg+xml')
        .querySelector('parsererror'),
    ).toBeNull();
  });

  it('never embeds a raster or references anything external', () => {
    const xml = render(
      scene({
        gradients: [
          {
            id: 'ramp',
            kind: 'linear',
            stops: [
              { offset: 0, color: '#000' },
              { offset: 1, color: '#fff' },
            ],
          },
        ],
        layers: [
          layer('terrain', [
            {
              id: 'terrain-land-0',
              geometry: {
                kind: 'polygon',
                rings: [
                  [
                    { x: -100, z: -50 },
                    { x: 100, z: -50 },
                    { x: 100, z: 50 },
                  ],
                ],
              },
              fill: { color: '#eee', gradientId: 'ramp' },
            },
          ]),
        ],
      }),
    );
    expect(xml).not.toContain('<image');
    expect(xml).not.toContain('data:image');
    expect(xml).not.toContain('http://www.w3.org/1999/xlink');
    expect(xml).not.toContain('@font-face');
    expect(xml).not.toContain('xlink:href');
    // Every URL-shaped reference must be same-document (`#id`); anything
    // else would reach outside the file and break the offline guarantee.
    const references = [...xml.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference).toMatch(/^#[\w-]+$/);
    }
    expect(references).toContain('#ramp');
    // `href` on <use> must be local too — never xlink, never a URL.
    for (const [, href] of xml.matchAll(/\shref="([^"]*)"/g)) {
      expect(href).toMatch(/^#[\w-]+$/);
    }
  });

  it('projects world Z with output Y descending from maxZ, matching the live map', () => {
    const xml = render(
      scene({
        background: null,
        layers: [
          layer('roads', [
            {
              id: 'road-1',
              geometry: {
                kind: 'path',
                points: [
                  { x: -100, z: -50 },
                  { x: 100, z: 50 },
                ],
              },
              stroke: { color: '#333', widthPx: 6 },
            },
          ]),
        ],
      }),
    );
    // minZ is the *bottom* row and maxZ the top, because MapLibre draws
    // increasing latitude (increasing Z) upward. Getting this backwards
    // produces a document that is a vertical mirror of what was on screen.
    expect(xml).toContain('d="M0 200 L400 0"');
    // A transparent background is the absence of the rect, not a colour.
    expect(xml).not.toContain('id="vellum-background"');
  });

  it('groups every layer in z-order and keeps hidden ones as empty groups', () => {
    const xml = render(
      scene({
        layers: [
          layer('terrain', []),
          layer('water', []),
          layer('forests', []),
          layer('roads', [], false),
          layer('buildings', []),
          layer('transit', []),
          layer('districts', []),
        ],
      }),
    );
    const order = [...xml.matchAll(/id="vellum-layer-([a-z]+)"/g)].map(
      (match) => match[1],
    );
    expect(order).toEqual([
      'terrain',
      'water',
      'forests',
      'roads',
      'buildings',
      'transit',
      'districts',
    ]);
    expect(xml).toContain('id="vellum-layer-roads" display="none"');
  });

  it('escapes XML metacharacters in entity identifiers', () => {
    const xml = render(
      scene({
        layers: [
          layer('districts', [
            {
              id: 'district-<Bell & "Co">',
              geometry: { kind: 'circle', center: { x: 0, z: 0 }, radiusPx: 6 },
              fill: { color: '#f00' },
            },
          ]),
        ],
      }),
    );
    expect(xml).toContain('id="district-&lt;Bell &amp; &quot;Co&quot;&gt;"');
    expect(
      new DOMParser()
        .parseFromString(xml, 'image/svg+xml')
        .querySelector('parsererror'),
    ).toBeNull();
  });

  it('drops control characters that no XML escape can represent', () => {
    const xml = render(
      scene({
        layers: [
          layer('districts', [
            {
              id: 'district-\u0000\u001fok',
              geometry: { kind: 'circle', center: { x: 0, z: 0 }, radiusPx: 1 },
              fill: { color: '#f00' },
            },
          ]),
        ],
      }),
    );
    expect(xml).toContain('id="district-ok"');
    expect(
      new DOMParser()
        .parseFromString(xml, 'image/svg+xml')
        .querySelector('parsererror'),
    ).toBeNull();
  });

  it('splits into multiple chunks that concatenate back to the same document', () => {
    const entities: SceneEntity[] = Array.from({ length: 400 }, (_, index) => ({
      id: `building-${index}`,
      geometry: {
        kind: 'polygon' as const,
        rings: [
          [
            { x: index, z: 0 },
            { x: index + 1, z: 0 },
            { x: index + 1, z: 1 },
          ],
        ],
      },
      fill: { color: '#cccccc' },
    }));
    const input = scene({ layers: [layer('buildings', entities)] });

    const chunks = [...serializeSceneToSvg(input, 256)];
    expect(chunks.length).toBeGreaterThan(1);
    // Chunks may end mid-element — path data is split between commands so a
    // single huge <path> cannot force an over-budget chunk. What has to hold
    // is that the stream reassembles byte-for-byte into the same document.
    expect(chunks.join('')).toBe(render(input));
    expect(
      new DOMParser()
        .parseFromString(chunks.join(''), 'image/svg+xml')
        .querySelector('parsererror'),
    ).toBeNull();
  });

  it('produces a valid document for an empty city', () => {
    const xml = render(
      scene({
        layers: [
          layer('terrain', []),
          layer('water', []),
          layer('forests', []),
          layer('roads', []),
          layer('buildings', []),
          layer('transit', []),
          layer('districts', []),
        ],
      }),
    );
    expect(
      new DOMParser()
        .parseFromString(xml, 'image/svg+xml')
        .querySelector('parsererror'),
    ).toBeNull();
    expect(xml).toContain('viewBox="0 0 400 200"');
  });

  it('never writes NaN or Infinity into an attribute', () => {
    const xml = render(
      scene({
        projection: {
          extent: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
          width: 10,
          height: 10,
        },
        layers: [
          layer('roads', [
            {
              id: 'road-degenerate',
              geometry: {
                kind: 'path',
                points: [
                  { x: 0, z: 0 },
                  { x: Number.NaN, z: Number.POSITIVE_INFINITY },
                ],
              },
              stroke: { color: '#000', widthPx: Number.NaN },
            },
          ]),
        ],
      }),
    );
    expect(xml).not.toMatch(/NaN|Infinity/);
  });

  it('never emits a chunk over the budget, even for one enormous path', () => {
    // A full-map coastline is a single <path> with tens of thousands of
    // points. Before this was streamed, that one element was an indivisible
    // fragment and Rust rejected the chunk it landed in.
    const coastline: SceneEntity = {
      id: 'water-coastline-0',
      geometry: {
        kind: 'path',
        points: Array.from({ length: 60_000 }, (_, index) => ({
          x: -100 + (index % 200),
          z: -50 + (index % 100),
        })),
      },
      stroke: { color: '#a0c8f0', widthPx: 4 },
    };
    const target = 1024;
    const chunks = [
      ...serializeSceneToSvg(
        scene({ layers: [layer('water', [coastline])] }),
        target,
      ),
    ];
    const encoder = new TextEncoder();
    for (const chunk of chunks) {
      expect(encoder.encode(chunk).byteLength).toBeLessThanOrEqual(target);
    }
    // And it still round-trips to a parseable document.
    const xml = chunks.join('');
    expect(
      new DOMParser()
        .parseFromString(xml, 'image/svg+xml')
        .querySelector('parsererror'),
    ).toBeNull();
  });

  it('measures the chunk budget in UTF-8 bytes, not UTF-16 units', () => {
    // 'ñ' costs two bytes but one UTF-16 unit; a length-based budget would
    // build a chunk the wire frame then rejects.
    const accented = Array.from({ length: 200 }, (_, index) => ({
      id: `district-ñ-${index}`,
      geometry: {
        kind: 'circle' as const,
        center: { x: index, z: 0 },
        radiusPx: 2,
      },
      fill: { color: '#ff0000' },
    }));
    const chunks = [
      ...serializeSceneToSvg(
        scene({ layers: [layer('districts', accented)] }),
        512,
      ),
    ];
    const encoder = new TextEncoder();
    for (const chunk of chunks) {
      expect(encoder.encode(chunk).byteLength).toBeLessThanOrEqual(512);
    }
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('draws the watermark as vector paths above every layer, outside the groups', () => {
    const xml = render(
      scene({
        layers: [layer('roads', [])],
        emblem: {
          id: 'vellum-watermark',
          svgMarkup: '<path d="M0 0 L728 728" fill="#4A4035"/>',
          sourceWidth: 728,
          sourceHeight: 728,
          xPx: 100,
          yPx: 50,
          widthPx: 364,
        },
      }),
    );
    // Half scale (364 / 728), placed at the requested offset.
    expect(xml).toContain(
      '<g id="vellum-watermark" transform="translate(100 50) scale(0.5)">',
    );
    expect(xml).toContain('fill="#4A4035"');
    // Above the layers, and not nested inside one of them.
    expect(xml.indexOf('vellum-watermark')).toBeGreaterThan(
      xml.indexOf('vellum-layer-roads'),
    );
    // Still vector: no raster stand-in for the mark.
    expect(xml).not.toContain('<image');
  });

  it('keeps the watermark visible when every layer is hidden', () => {
    // The watermark is not cartography, so hiding the map must not hide it.
    const xml = render(
      scene({
        layers: [layer('roads', [], false), layer('buildings', [], false)],
        emblem: {
          id: 'vellum-watermark',
          svgMarkup: '<path d="M0 0"/>',
          sourceWidth: 728,
          sourceHeight: 728,
          xPx: 0,
          yPx: 0,
          widthPx: 72,
        },
      }),
    );
    expect(xml).toContain('id="vellum-watermark"');
    expect(xml).not.toContain('id="vellum-watermark" display="none"');
  });

  it('omits the watermark group entirely when it is disabled', () => {
    expect(render(scene())).not.toContain('vellum-watermark');
  });

  it('emits title and desc, without leaking any path', () => {
    const xml = render(scene());
    expect(xml).toContain('<title>Testville</title>');
    expect(xml).toContain('<desc>Cartographic export.</desc>');
    // Metadata precedes the geometry so a reader meets it first.
    expect(xml.indexOf('<title>')).toBeLessThan(xml.indexOf('<defs>'));
    expect(xml).not.toMatch(/\/(Users|home|Downloads)\//);
  });

  it('declares defs before anything that references them', () => {
    const xml = render(
      scene({
        symbols: [
          {
            id: 'symbol-transit-l1',
            symbol: 'transit-metro',
            layer: 'transit',
            entityId: 'l1',
            at: { x: 0, z: 0 },
            sizePx: 12,
            color: '#8060a0',
          },
        ],
      }),
    );
    expect(xml.indexOf('<defs>')).toBeLessThan(xml.indexOf('<use'));
    expect(xml.indexOf('<defs>')).toBeLessThan(xml.indexOf('clip-path='));
    // The whole catalogue is available, not only the modes this city uses.
    for (const id of [
      'transit-bus',
      'transit-tram',
      'transit-train',
      'transit-metro',
      'transit-cablecar',
      'transit-monorail',
      'transit-ferry',
      'transit-blimp',
      'transit-trolleybus',
    ]) {
      expect(xml).toContain(`<symbol id="${id}"`);
    }
  });

  it('gives every symbol instance its own selectable group and identity', () => {
    const xml = render(
      scene({
        symbols: [
          {
            id: 'symbol-transit-l1',
            symbol: 'transit-bus',
            layer: 'transit',
            entityId: 'l1',
            at: { x: -100, z: 0 },
            sizePx: 12,
            color: '#ff0000',
          },
          {
            id: 'symbol-transit-l2',
            symbol: 'transit-bus',
            layer: 'transit',
            entityId: 'l2',
            at: { x: 100, z: 0 },
            sizePx: 12,
            color: '#00ff00',
          },
        ],
      }),
    );
    // Same definition reused, but the instances are independently editable.
    expect(xml).toContain('id="symbol-transit-l1"');
    expect(xml).toContain('id="symbol-transit-l2"');
    expect(xml).toContain('color="#ff0000"');
    expect(xml).toContain('color="#00ff00"');
    expect([...xml.matchAll(/href="#transit-bus"/g)]).toHaveLength(2);
    expect(xml).toContain('data-entity="l1"');
  });

  it('writes labels as editable <text> with a vector halo, never a raster', () => {
    const xml = render(
      scene({
        labels: [
          {
            id: 'label-district-d1',
            layer: 'districts',
            entityId: 'd1',
            text: 'Bell & "Co" <Norte>',
            at: { x: 0, z: 0 },
            anchor: 'center',
            priority: 0,
            style: {
              fontFamily: "'DM Mono', monospace",
              fontSizePx: 13,
              fontWeight: 600,
              color: '#222222',
              haloColor: '#ffffff',
              haloWidthPx: 2.5,
            },
          },
        ],
      }),
    );
    // Two <text> elements: halo underneath, glyphs on top. Both selectable.
    expect([...xml.matchAll(/<text /g)]).toHaveLength(2);
    expect(xml).toContain('stroke="#ffffff"');
    expect(xml).toContain('stroke-width="2.5"');
    expect(xml).toContain('font-family="&apos;DM Mono&apos;, monospace"');
    // XML metacharacters escaped inside the text node.
    expect(xml).toContain('Bell &amp; &quot;Co&quot; &lt;Norte&gt;');
    expect(xml).toContain('data-layer="districts"');
    expect(xml).not.toContain('<image');
    expect(
      new DOMParser()
        .parseFromString(xml, 'image/svg+xml')
        .querySelector('parsererror'),
    ).toBeNull();
  });

  it('clips the map group explicitly, not just via the viewBox', () => {
    const xml = render(scene());
    expect(xml).toContain('<clipPath id="vellum-document-clip">');
    expect(xml).toContain('clip-path="url(#vellum-document-clip)"');
    // The watermark sits outside the clipped map group on purpose.
    expect(xml.indexOf('</g>')).toBeLessThan(xml.indexOf('</svg>'));
  });

  it('produces byte-identical output for the same scene, twice', () => {
    // AC 12: re-exporting the same snapshot must yield canonical XML.
    const input = scene({
      labels: [
        {
          id: 'label-a',
          layer: 'districts',
          entityId: 'd1',
          text: 'Centro',
          at: { x: 10, z: 20 },
          anchor: 'center',
          priority: 0,
          style: {
            fontFamily: 'monospace',
            fontSizePx: 12,
            fontWeight: 600,
            color: '#222222',
          },
        },
      ],
    });
    expect(render(input)).toBe(render(input));
  });

  it('emite la marginalia como grupo vectorial fuera del clip, sin <image> ni data URLs', () => {
    const marginalia = composeMarginalia(
      {
        presentation: makePresentationOptions({
          showCityName: true,
          showElevationLegend: true,
          showScaleBar: true,
          showOrientation: true,
          author: 'Ana & "Beto"',
          corner: 'top-right',
        }),
        labels: makeMarginaliaLabels(),
        style: makeRenderStyle(),
        cityData: makeCityData({ cityName: 'Río <Norte>' }),
        activeLayers: makeLayerVisibility(),
        layerOptions: DEFAULT_LAYER_OPTIONS,
      },
      resolveMarginaliaFrame({
        area: 'viewport',
        format: 'svg',
        surface: { width: 4000, height: 2000 },
        extent: { minX: -10000, maxX: 10000, minZ: -5000, maxZ: 5000 },
        viewportWorldUnitsPerPixel: 5,
        camera: { bearing: 0, pitch: 0 },
      }),
    );
    expect(marginalia.primitives.length).toBeGreaterThan(0);
    const xml = render(scene({ marginalia }));

    const start = xml.indexOf('<g id="vellum-marginalia"');
    expect(start).toBeGreaterThan(xml.indexOf('<g id="vellum-map"'));
    const group = xml.slice(start, xml.lastIndexOf('</svg>'));
    expect(group).toContain(
      `font-family="&apos;DM Mono&apos;, ui-monospace, monospace"`,
    );
    expect(group).toMatch(
      /<rect data-block="panel"[^>]*fill="#f7f6f1" fill-opacity="0.9"/,
    );
    expect(group).toContain('<line data-block="aids"');
    expect(group).toContain('<path data-block="aids"');
    expect(group).toContain('<linearGradient id="vellum-marginalia-ramp-1"');
    expect(group).toContain('>RÍO &lt;NORTE&gt;</text>');
    expect(group).toContain('>Ana &amp; &quot;Beto&quot;</text>');
    expect(group).toContain('letter-spacing=');
    // Ramp: a real gradient with the renderer's low/mid/high stops.
    expect(group).toMatch(
      /<linearGradient id="vellum-marginalia-ramp-1"[^>]*><stop offset="0" stop-color="#95ae79"\/><stop offset="0\.5" stop-color="#deddbe"\/><stop offset="1" stop-color="#c4a06a"\/><\/linearGradient>/,
    );
    expect(group).toMatch(
      /<rect data-block="elevation-legend"[^>]*fill="url\(#vellum-marginalia-ramp-1\)"/,
    );
    // Halo: a stroked copy in the background colour, underneath the fill.
    expect(group).toMatch(
      /<text [^>]*fill="#f7f6f1" stroke="#f7f6f1" stroke-width="[\d.]+" stroke-linejoin="round" aria-hidden="true">RÍO &lt;NORTE&gt;<\/text><text [^>]*fill="#222222">RÍO &lt;NORTE&gt;<\/text>/,
    );
    // Scale bar: baseline plus three ticks, all vector lines.
    expect(
      group.match(/<line data-block="aids"[^>]*stroke-linecap="square"\/>/g),
    ).toHaveLength(4);
    expect(group).toMatch(/>\d+(?:\.\d+)? k?m<\/text>/);
    expect(xml).not.toContain('<image');
    expect(xml).not.toContain('data:');
  });

  it('sin marginalia no emite el grupo', () => {
    expect(render(scene())).not.toContain('vellum-marginalia');
  });
});

it('serializes district fill holes with evenodd winding and snapshot color', () => {
  const cityData = makeCityData({
    source: 'vellummap',
    districts: [
      {
        id: 'd',
        name: 'D',
        position: { x: 0, y: 0, z: 0 },
        specializations: ['Forest'],
        boundary: [
          {
            exterior: [
              [0, 0],
              [0.01, 0],
              [0.01, 0.01],
              [0, 0],
            ],
            holes: [
              [
                [0.005, 0.001],
                [0.008, 0.001],
                [0.008, 0.003],
                [0.005, 0.001],
              ],
            ],
          },
        ],
      },
    ],
  });
  const style = makeRenderStyle();
  const cartography = buildCartographicScene({
    snapshot: {
      snapshotId: 'district-hole',
      cityData,
      style,
      activeLayers: makeLayerVisibility(),
      layerOptions: {
        ...DEFAULT_LAYER_OPTIONS,
        districts: {
          ...DEFAULT_LAYER_OPTIONS.districts,
          colorBySpecialization: true,
        },
      },
      transitDimming: false,
      watermarkVisible: false,
      camera: { longitude: 0, latitude: 0, zoom: 12, bearing: 0, pitch: 0 },
      extent: { minX: -8640, maxX: 8640, minZ: -8640, maxZ: 8640 },
      surface: { width: 1000, height: 1000 },
    },
    background: 'white',
    roadWidthFactor: 7.25,
    roadCasingAddPx: 1.1,
  });
  const document = new DOMParser().parseFromString(
    [...serializeSceneToSvg(cartography)].join(''),
    'image/svg+xml',
  );
  const fill = document.querySelector('[id="district-fill-d-0"]');
  expect(fill).not.toBeNull();
  expect(fill?.getAttribute('fill-rule')).toBe('evenodd');
  expect(fill?.getAttribute('fill-opacity')).toBe('0.14');
  expect(fill?.getAttribute('fill')).toBe(
    style.buildings.industry.forestry.fill,
  );
  expect(fill?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
});
