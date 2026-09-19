import { describe, expect, it } from 'vitest';
import {
  makeCityData,
  makeLayerVisibility,
  makeMarginaliaLabels,
  makePresentationOptions,
  makeRenderStyle,
} from '../testing';
import { DEFAULT_LAYER_OPTIONS } from '../types/layer';
import {
  buildMarginaliaContent,
  layoutMarginalia,
  type MarginaliaLayout,
} from './marginalia-layout';
import { paintMarginalia, type MarginaliaCanvas } from './marginalia-paint';

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
  readonly state: Record<string, unknown>;
}

/** Records every call with the style state in effect when it was made. */
function fakeCanvas(): MarginaliaCanvas & { calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
  };
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args, state: { ...state } });
    };
  const target = {
    calls,
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    scale: record('scale'),
    beginPath: record('beginPath'),
    rect: record('rect'),
    clip: record('clip'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillText: record('fillText'),
    strokeText: record('strokeText'),
    createLinearGradient: (...args: unknown[]) => {
      calls.push({ name: 'createLinearGradient', args, state: { ...state } });
      return { addColorStop: record('addColorStop') };
    },
  };
  return new Proxy(target, {
    get: (object, key) =>
      key in object
        ? (object as Record<string | symbol, unknown>)[key]
        : state[key as string],
    set: (_object, key, value) => {
      state[key as string] = value;
      return true;
    },
  }) as unknown as MarginaliaCanvas & { calls: Call[] };
}

function layout(): MarginaliaLayout {
  return layoutMarginalia(
    buildMarginaliaContent({
      presentation: makePresentationOptions({
        showCityName: true,
        showElevationLegend: true,
        showOrientation: true,
        author: 'Ana',
      }),
      labels: makeMarginaliaLabels(),
      style: makeRenderStyle(),
      cityData: makeCityData(),
      activeLayers: makeLayerVisibility(),
      layerOptions: DEFAULT_LAYER_OPTIONS,
      camera: { bearing: 30, pitch: 0 },
      worldUnitsPerPixel: 2,
    }),
    { width: 2000, height: 1000 },
    0,
    'top-left',
  );
}

describe('paintMarginalia', () => {
  it('aplica escala y offset del tile antes de dibujar', () => {
    const ctx = fakeCanvas();
    const painted = paintMarginalia(ctx, layout(), {
      offsetX: -10,
      offsetY: -20,
      scale: 2,
    });
    expect(painted).toBe(true);
    const names = ctx.calls.map((call) => call.name);
    expect(names[0]).toBe('save');
    expect(ctx.calls[1]).toMatchObject({ name: 'scale', args: [2, 2] });
    expect(ctx.calls[2]).toMatchObject({ name: 'translate', args: [-10, -20] });
    expect(names.at(-1)).toBe('restore');
  });

  it('pinta el panel con relleno al 90 % y el texto en DM Mono con halo debajo', () => {
    const ctx = fakeCanvas();
    paintMarginalia(ctx, layout(), { offsetX: 0, offsetY: 0, scale: 1 });
    const firstFill = ctx.calls.find((call) => call.name === 'fill')!;
    expect(firstFill.state).toMatchObject({
      fillStyle: '#f7f6f1',
      globalAlpha: 0.9,
    });
    const strokeTextIndex = ctx.calls.findIndex(
      (call) => call.name === 'strokeText',
    );
    const fillTextIndex = ctx.calls.findIndex(
      (call) => call.name === 'fillText',
    );
    expect(strokeTextIndex).toBeGreaterThan(-1);
    expect(strokeTextIndex).toBeLessThan(fillTextIndex);
    expect(ctx.calls[fillTextIndex]!.state.font).toMatch(/'DM Mono'/);
    expect(ctx.calls[fillTextIndex]!.state.fillStyle).toBe('#222222');
    expect(ctx.calls[strokeTextIndex]!.state.strokeStyle).toBe('#f7f6f1');
    expect(
      ctx.calls.filter((call) => call.name === 'addColorStop'),
    ).toHaveLength(3);
  });

  it('recorta a la intersección con el renderRect del tile', () => {
    const painted = layout();
    const bounds = painted.bounds!;
    const ctx = fakeCanvas();
    paintMarginalia(ctx, painted, {
      offsetX: -bounds.x - 5,
      offsetY: -bounds.y - 5,
      scale: 1,
      clip: { x: bounds.x + 5, y: bounds.y + 5, width: 4096, height: 4096 },
    });
    const clipRect = ctx.calls.find((call) => call.name === 'rect')!;
    expect(clipRect.args[0]).toBeCloseTo(bounds.x + 5);
    expect(clipRect.args[1]).toBeCloseTo(bounds.y + 5);
    expect(clipRect.args[2]).toBeCloseTo(bounds.width - 5);
    expect(ctx.calls.some((call) => call.name === 'clip')).toBe(true);
  });

  it('un tile que no toca el panel no pinta nada', () => {
    const ctx = fakeCanvas();
    const painted = paintMarginalia(ctx, layout(), {
      offsetX: -1500,
      offsetY: -800,
      scale: 1,
      clip: { x: 1500, y: 800, width: 500, height: 200 },
    });
    expect(painted).toBe(false);
    expect(ctx.calls).toEqual([]);
  });
});
