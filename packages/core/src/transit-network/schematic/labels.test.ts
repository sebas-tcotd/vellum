import { describe, expect, it } from 'vitest';
import {
  deriveSchematicLineLabel,
  placeSchematicLabels,
  resolveLabelVariant,
} from './labels';
import type { SchematicLayout, SchematicSegment } from './contract';

const run = (
  lineId: string,
  edgeId: string,
  from: [number, number],
  to: [number, number],
): SchematicSegment => ({
  lineId,
  color: lineId === 'a' ? '#aa0000' : '#0000aa',
  edgeId,
  points: [
    { x: from[0], y: from[1] },
    { x: to[0], y: to[1] },
  ],
});

const layout = (
  segments: SchematicSegment[],
  stations: SchematicLayout['stations'] = [],
): SchematicLayout => ({
  bounds: { width: 1000, height: 1000 },
  corridors: [],
  connectors: [],
  stations,
  segments,
});

const station = (
  id: string,
  lineIds: string[],
  confirmedTransfer = false,
  at: [number, number] = [500, 500],
): SchematicLayout['stations'][number] => ({
  id,
  x: at[0],
  y: at[1],
  edgeId: 'e',
  lineIds,
  shape: [],
  confirmedTransfer,
});

describe('schematic label presentation', () => {
  it('extracts only conservative numbered line codes', () => {
    expect(deriveSchematicLineLabel('Airport Island - Dwntwn Exp #35')).toBe(
      '35',
    );
    expect(deriveSchematicLineLabel('Metro Line 1')).toBe('1');
    expect(deriveSchematicLineLabel('Crosstown')).toBeNull();
  });

  it('adds stable mode context to a compact collision', () => {
    const counts = new Map([['39', 2]]);
    expect(
      resolveLabelVariant(
        { id: 'bus', name: 'Bus Line 39', mode: 'Bus' },
        counts,
      ),
    ).toEqual({ variant: 'compact', text: 'Bus 39' });
  });

  it('does not invent a label for missing source data', () => {
    expect(resolveLabelVariant({ id: 'missing', name: null })).toEqual({
      variant: 'symbol',
      text: null,
    });
  });

  it('names a line only where it is the single stroke on its corridor', () => {
    // `solo` runs alone on e1; `shared-a` and `shared-b` both ride e2, so
    // nothing there can say which stroke a name belongs to.
    const labels = placeSchematicLabels(
      layout([
        run('solo', 'e1', [0, 0], [600, 0]),
        run('shared-a', 'e2', [0, 200], [600, 200]),
        run('shared-b', 'e2', [0, 206], [600, 206]),
      ]),
      [
        { id: 'solo', name: 'Airport Line 1', mode: 'Bus' },
        { id: 'shared-a', name: 'Airport Line 2', mode: 'Bus' },
        { id: 'shared-b', name: 'Airport Line 3', mode: 'Bus' },
      ],
      [],
    );
    expect(labels.map((label) => label.id)).toEqual(['line:solo']);
  });

  it('paints a line label in that line’s own colour, along its run', () => {
    const labels = placeSchematicLabels(
      layout([run('a', 'e1', [0, 0], [0, 600])]),
      [{ id: 'a', name: 'Metro Line 1' }],
      [],
    );
    expect(labels[0]).toMatchObject({
      kind: 'line',
      color: '#aa0000',
      anchor: 'middle',
      // Normalised into the readable hemisphere: never upside down.
      angle: 90,
    });
    // Beside the stroke, not on it.
    expect(labels[0].x).not.toBe(0);
  });

  it('degrades to the compact code when the run cannot hold the full name', () => {
    const labels = placeSchematicLabels(
      layout([run('a', 'e1', [0, 0], [80, 0])]),
      [{ id: 'a', name: 'Metro Line 7', mode: 'Metro' }],
      [],
    );
    expect(labels[0]).toMatchObject({ variant: 'compact', text: '7' });
  });

  it('says nothing at all when even the compact code will not fit', () => {
    expect(
      placeSchematicLabels(
        layout([run('a', 'e1', [0, 0], [6, 0])]),
        [{ id: 'a', name: 'Crosstown' }],
        [],
      ),
    ).toEqual([]);
  });

  it('lets a deeper zoom fit a name a fitted view had no room for', () => {
    const diagram = layout([run('a', 'e1', [0, 0], [90, 0])]);
    const sources = [{ id: 'a', name: 'Metro Line 1' }];
    const fitted = placeSchematicLabels(diagram, sources, [], { scale: 1 });
    const zoomed = placeSchematicLabels(diagram, sources, [], { scale: 0.375 });
    expect(fitted[0]?.text).not.toBe('Metro Line 1');
    expect(zoomed[0]?.text).toBe('Metro Line 1');
  });

  it('keeps a named confirmed transfer ahead of ordinary stations', () => {
    const labels = placeSchematicLabels(
      layout(
        [run('a', 'e1', [0, 0], [600, 0])],
        [
          station('ordinary', ['a'], false, [500, 500]),
          station('hub', ['a', 'b'], true, [500, 500]),
        ],
      ),
      [],
      [
        { id: 'ordinary', name: 'Ordinary' },
        { id: 'hub', name: 'Hub' },
      ],
    );
    expect(labels.find((label) => label.id === 'station:hub')?.text).toBe(
      'Hub',
    );
    // The transfer is emitted first, so it claims its candidate box before an
    // ordinary stop at the same point can take it.
    expect(labels[0].id).toBe('station:hub');
  });

  it('puts a metro station ahead of a busier bus transfer (Story 4.7)', () => {
    // Same point, so only the first one emitted gets its name drawn there.
    const labels = placeSchematicLabels(
      layout(
        [run('m', 'e1', [0, 0], [600, 0])],
        [
          station('bus-hub', ['b1', 'b2', 'b3'], true, [500, 500]),
          station('metro', ['m'], false, [500, 500]),
        ],
      ),
      [
        { id: 'm', name: 'Metro 1', mode: 'Metro' },
        { id: 'b1', name: 'Bus 1', mode: 'Bus' },
        { id: 'b2', name: 'Bus 2', mode: 'Bus' },
        { id: 'b3', name: 'Bus 3', mode: 'Bus' },
      ],
      [
        { id: 'bus-hub', name: 'Bus Hub' },
        { id: 'metro', name: 'Metro Stop' },
      ],
    );
    expect(labels[0].id).toBe('station:metro');
  });

  it('keeps the old priority among stations of the same level', () => {
    const labels = placeSchematicLabels(
      layout(
        [],
        [
          station('one', ['b1'], false, [500, 500]),
          station('three', ['b1', 'b2', 'b3'], false, [500, 500]),
        ],
      ),
      [
        { id: 'b1', name: 'Bus 1', mode: 'Bus' },
        { id: 'b2', name: 'Bus 2', mode: 'Bus' },
        { id: 'b3', name: 'Bus 3', mode: 'Bus' },
      ],
      [
        { id: 'one', name: 'One' },
        { id: 'three', name: 'Three' },
      ],
    );
    expect(labels[0].id).toBe('station:three');
  });

  it('leaves an unnamed stop as a symbol with nothing drawn', () => {
    expect(
      placeSchematicLabels(
        layout([], [station('unnamed', ['a'], true)]),
        [],
        [],
      ),
    ).toEqual([]);
  });

  it('places a named station before a line label competes for the space', () => {
    const labels = placeSchematicLabels(
      layout(
        [run('a', 'e1', [0, 500], [600, 500])],
        [station('hub', ['a'], true, [300, 500])],
      ),
      [{ id: 'a', name: 'Line 1' }],
      [{ id: 'hub', name: 'Hub' }],
    );
    expect(labels[0].id).toBe('station:hub');
  });

  it('sets a stop name horizontally across its line, clear of other strokes', () => {
    const labels = placeSchematicLabels(
      layout(
        [
          run('a', 'e1', [0, 500], [1000, 500]),
          // A parallel line just above: the upward ray would cross it.
          run('b', 'e2', [0, 480], [1000, 480]),
        ],
        [station('stop', ['a'], false, [500, 500])],
      ),
      [],
      [{ id: 'stop', name: 'Stop' }],
    );
    const label = labels.find((entry) => entry.id === 'station:stop');
    // Horizontal text (octi §5), centred below the stop: across the line,
    // and away from line b just above it.
    expect(label).toMatchObject({ text: 'Stop', angle: 0, anchor: 'middle' });
    expect(label!.x).toBeCloseTo(500);
    expect(label!.y).toBeGreaterThan(500);
  });
  it('keeps the names of one line on one side of it', () => {
    // A short line just above the first stop pushes its name below. The
    // second stop has room both ways, and follows the first to the same side
    // rather than its default (above).
    const labels = placeSchematicLabels(
      layout(
        [
          run('a', 'e1', [0, 500], [1000, 500]),
          run('b', 'e2', [150, 480], [250, 480]),
        ],
        [
          station('s1', ['a'], false, [200, 500]),
          station('s2', ['a'], false, [700, 500]),
        ],
      ),
      [],
      [
        { id: 's1', name: 'One' },
        { id: 's2', name: 'Two' },
      ],
    );
    const one = labels.find((entry) => entry.id === 'station:s1');
    const two = labels.find((entry) => entry.id === 'station:s2');
    expect(one!.y).toBeGreaterThan(500);
    expect(two!.y).toBeGreaterThan(500);
    expect(two).toMatchObject({ angle: 0, anchor: 'middle' });
  });

  it('puts a lone stop name above its line by default', () => {
    const labels = placeSchematicLabels(
      layout([run('a', 'e1', [0, 500], [1000, 500])], [station('s', ['a'])]),
      [],
      [{ id: 's', name: 'Alone' }],
    );
    const label = labels.find((entry) => entry.id === 'station:s');
    expect(label).toMatchObject({ angle: 0, anchor: 'middle' });
    expect(label!.y).toBeLessThan(500);
  });
});
