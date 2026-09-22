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
});
