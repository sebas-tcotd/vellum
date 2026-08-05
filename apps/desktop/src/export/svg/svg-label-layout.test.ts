import { describe, expect, it } from 'vitest';
import type { SceneLabel, SceneProjection } from '@vellum/core';
import { layoutLabels, measureText } from './svg-label-layout';

const PROJECTION: SceneProjection = {
  extent: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
  width: 1000,
  height: 1000,
};

function label(overrides: Partial<SceneLabel> = {}): SceneLabel {
  return {
    id: 'label-a',
    layer: 'districts',
    entityId: 'd-1',
    text: 'Centro',
    at: { x: 0, z: 0 },
    anchor: 'center',
    priority: 0,
    style: {
      fontFamily: "'DM Mono', monospace",
      fontSizePx: 12,
      fontWeight: 600,
      color: '#222222',
    },
    ...overrides,
  };
}

describe('measureText', () => {
  it('never consults the platform, so the same string always measures the same', () => {
    // A DOM or canvas measurement would depend on installed fonts; two
    // machines would then disagree about which labels collide.
    expect(measureText('Centro', 12)).toBeCloseTo(6 * 12 * 0.6, 10);
    expect(measureText('', 12)).toBe(0);
  });

  it('counts code points, not UTF-16 units, so emoji measure once', () => {
    // '🚇' is a surrogate pair: charAt-based counting would double it.
    expect(measureText('🚇', 10)).toBeCloseTo(measureText('A', 10), 10);
  });
});

describe('layoutLabels', () => {
  it('is deterministic regardless of the order the scene produced', () => {
    const labels = [
      label({ id: 'label-c', at: { x: 0, z: 0 } }),
      label({ id: 'label-a', at: { x: 0, z: 0 } }),
      label({ id: 'label-b', at: { x: 0, z: 0 } }),
    ];
    const forward = layoutLabels(labels, PROJECTION);
    const reversed = layoutLabels([...labels].reverse(), PROJECTION);
    expect(forward.placed.map((p) => p.label.id)).toEqual(
      reversed.placed.map((p) => p.label.id),
    );
    // All three sit on the same point, so the lowest id wins and the rest hide.
    expect(forward.placed.map((p) => p.label.id)).toEqual(['label-a']);
    expect(forward.hiddenByCollision).toBe(2);
  });

  it('resolves ties on priority before id', () => {
    const layout = layoutLabels(
      [
        label({ id: 'label-a', priority: 5 }),
        label({ id: 'label-z', priority: 0 }),
      ],
      PROJECTION,
    );
    // Priority beats alphabetical order — a district outranks a line name.
    expect(layout.placed.map((p) => p.label.id)).toEqual(['label-z']);
  });

  it('hides a colliding label instead of relocating it', () => {
    const layout = layoutLabels(
      [
        label({ id: 'label-a', at: { x: 0, z: 0 } }),
        label({ id: 'label-b', at: { x: 5, z: 5 } }),
      ],
      PROJECTION,
    );
    expect(layout.placed).toHaveLength(1);
    expect(layout.hiddenByCollision).toBe(1);
    // The survivor stays exactly where its data put it.
    expect(layout.placed[0]!.xPx).toBeCloseTo(500, 6);
  });

  it('places labels far enough apart to keep both', () => {
    const layout = layoutLabels(
      [
        label({ id: 'label-a', at: { x: -800, z: -800 } }),
        label({ id: 'label-b', at: { x: 800, z: 800 } }),
      ],
      PROJECTION,
    );
    expect(layout.placed).toHaveLength(2);
    expect(layout.hiddenByCollision).toBe(0);
  });

  it('hides a label that would be truncated at the document edge', () => {
    const layout = layoutLabels(
      [
        label({
          id: 'label-edge',
          text: 'A very long district name',
          at: { x: 995, z: 0 },
        }),
      ],
      PROJECTION,
    );
    expect(layout.placed).toHaveLength(0);
    expect(layout.hiddenOutsideArea).toBe(1);
  });

  it('maps world Z to output Y descending from maxZ, like every other primitive', () => {
    const layout = layoutLabels(
      [
        label({ id: 'label-north', at: { x: -500, z: 900 } }),
        label({ id: 'label-south', at: { x: 500, z: -900 } }),
      ],
      PROJECTION,
    );
    const byId = new Map(layout.placed.map((p) => [p.label.id, p.yPx]));
    // Higher Z is further north, which is the *smaller* output Y. Inverting
    // this is what mirrored Altavento in 6.3A.
    expect(byId.get('label-north')!).toBeLessThan(byId.get('label-south')!);
    expect(byId.get('label-north')!).toBeCloseTo(50 + (12 * 0.72) / 2, 6);
  });

  it('hides a centred label sitting exactly on the top edge, rather than half-drawing it', () => {
    // Its box straddles the boundary; clipping it would leave a sliced word.
    const layout = layoutLabels([label({ at: { x: 0, z: 1000 } })], PROJECTION);
    expect(layout.placed).toHaveLength(0);
    expect(layout.hiddenOutsideArea).toBe(1);
  });

  it('translates each anchor into the matching SVG text-anchor', () => {
    const anchors = (['left', 'right', 'center', 'top', 'bottom'] as const).map(
      (anchor, index) =>
        label({
          id: `label-${index}`,
          anchor,
          at: { x: index * 200 - 400, z: 0 },
        }),
    );
    const layout = layoutLabels(anchors, PROJECTION);
    const byId = new Map(layout.placed.map((p) => [p.label.id, p.textAnchor]));
    expect(byId.get('label-0')).toBe('start');
    expect(byId.get('label-1')).toBe('end');
    expect(byId.get('label-2')).toBe('middle');
  });

  it('drops a label whose projected position is not finite', () => {
    const degenerate: SceneProjection = {
      extent: { minX: Number.NaN, maxX: Number.NaN, minZ: 0, maxZ: 1 },
      width: 100,
      height: 100,
    };
    const layout = layoutLabels([label()], degenerate);
    expect(layout.placed).toHaveLength(0);
    expect(layout.hiddenOutsideArea).toBe(1);
  });
});
