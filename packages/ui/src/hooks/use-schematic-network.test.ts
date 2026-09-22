import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';
import {
  geographicSchematicLayout,
  octilinearSchematicLayout,
} from '@vellum/core';
import type { CityData, TransitMode } from '@vellum/core';
import { useSchematicNetwork } from './use-schematic-network';
import type {
  SchematicLayoutClientPort,
  SchematicLayoutWorkerEvent,
} from './use-schematic-network';

const node = (id: string, x: number, z: number) => ({
  id,
  position: { x, y: 0, z },
});
const stop = (id: string, x: number, z: number, mode: TransitMode = 'Bus') => ({
  id,
  mode,
  position: { x, y: 0, z },
  name: `Stop ${id}`,
});

/**
 * Two modes, one station shared between them and one exclusive to each — the
 * shape every filtering rule below is about.
 */
function twoModeCity(overrides: Partial<CityData> = {}): CityData {
  return makeCityData({
    roadNodes: [node('a', 0, 0), node('b', 100, 0), node('c', 100, 300)],
    roadSegments: [
      makeRoadSegment({ id: 's1', startNodeId: 'a', endNodeId: 'b' }),
      makeRoadSegment({ id: 's2', startNodeId: 'b', endNodeId: 'c' }),
    ],
    transitLines: [
      makeTransitLine({
        id: 'L1',
        name: 'Red line',
        mode: 'Bus',
        color: '#ff0000',
        stops: [stop('shared', 0, 0), stop('busOnly', 100, 300)],
        route: [{ segmentIds: ['s1', 's2'] }],
      }),
      makeTransitLine({
        id: 'L2',
        name: 'Blue line',
        mode: 'Tram',
        color: '#0000ff',
        stops: [stop('shared', 0, 0, 'Tram')],
        route: [{ segmentIds: ['s1'] }],
      }),
    ],
    ...overrides,
  });
}

const modelOf = (cityData: CityData | null, hiddenModes: TransitMode[] = []) =>
  renderHook(() => useSchematicNetwork({ cityData, hiddenModes })).result
    .current;

describe('useSchematicNetwork', () => {
  it('surfaces worker progress/error and keeps the prior layout while recalculating', () => {
    const city = twoModeCity();
    const baseline = modelOf(city).layout;
    let emit!: (event: SchematicLayoutWorkerEvent) => void;
    const client: SchematicLayoutClientPort = {
      request: (_city, _layout, callback) => {
        emit = callback;
        return vi.fn();
      },
    };
    const { result, rerender } = renderHook(
      ({ layoutId }) =>
        useSchematicNetwork({
          cityData: city,
          hiddenModes: [],
          client,
          layoutId,
        }),
      { initialProps: { layoutId: 'geographic' as const } },
    );
    act(() =>
      emit({
        type: 'progress',
        requestId: 'a',
        phase: 'laying-out',
        completed: 1,
        total: 2,
      }),
    );
    expect(result.current.layoutProgress?.phase).toBe('laying-out');
    act(() =>
      emit({
        type: 'complete',
        requestId: 'a',
        layout: baseline,
        lines: [
          { lineId: 'L1', color: '#ff0000', mode: 'Bus', name: 'Red line' },
          { lineId: 'L2', color: '#0000ff', mode: 'Tram', name: 'Blue line' },
        ],
      }),
    );
    expect(result.current.layout.segments).toEqual(baseline.segments);
    rerender({ layoutId: 'octilinear' });
    expect(result.current.layout.segments).toEqual(baseline.segments);
    act(() =>
      emit({
        type: 'error',
        requestId: 'b',
        phase: 'laying-out',
        code: 'LAYOUT_FAILED',
        reason: 'boom',
      }),
    );
    expect(result.current.layoutError).toBe(true);
    expect(result.current.layout.segments).toEqual(baseline.segments);
  });
  it('reports no drawable network without a city', () => {
    const model = modelOf(null);
    expect(model.hasDrawableNetwork).toBe(false);
    expect(model.availableModes).toEqual([]);
    expect(model.legend).toEqual([]);
  });

  it('offers a switch only for modes that actually draw something', () => {
    const model = modelOf(twoModeCity());
    // Canonical `TOGGLABLE_TRANSIT_MODES` order, not city order.
    expect(model.availableModes).toEqual(['Bus', 'Tram']);
    expect(model.visibleLineCount).toBe(2);
    expect(model.legend.map((group) => group.mode)).toEqual(['Bus', 'Tram']);
    expect(model.legend[0]?.lines.map((line) => line.name)).toEqual([
      'Red line',
    ]);
    expect(model.legend[0]?.lines[0]?.color).toBe('#ff0000');
  });

  it('ignores a line the city knows about but never draws', () => {
    const base = twoModeCity();
    const model = modelOf(
      makeCityData({
        ...base,
        transitLines: [
          ...base.transitLines,
          makeTransitLine({
            id: 'L9',
            name: 'Ghost',
            mode: 'Ferry',
            route: [],
          }),
        ],
      }),
    );
    expect(model.availableModes).not.toContain('Ferry');
    expect(
      model.legend.flatMap((g) => g.lines.map((l) => l.name)),
    ).not.toContain('Ghost');
    expect(model.visibleLineCount).toBe(2);
  });

  it('drops the strokes, legend rows and exclusive stops of a hidden mode', () => {
    const full = modelOf(twoModeCity());
    const hidden = modelOf(twoModeCity(), ['Bus']);

    expect(hidden.visibleLineCount).toBe(1);
    expect(hidden.legend.map((g) => g.mode)).toEqual(['Tram']);
    expect(hidden.layout.segments.every((s) => s.lineId === 'L2')).toBe(true);
    // `busOnly` is exclusive to the hidden line; `shared` survives.
    expect(hidden.layout.stations.map((s) => s.id)).toEqual(['shared']);

    // Every surviving *stroke* is byte-identical to the unfiltered layout: a
    // line that stays must not move because another one was switched off.
    for (const segment of hidden.layout.segments) {
      const original = full.layout.segments.find(
        (s) => s.lineId === segment.lineId && s.edgeId === segment.edgeId,
      );
      expect(segment.points).toEqual(original?.points);
    }
    // A shared symbol does move, and has to: its capsule spans the slots of the
    // lines calling there, so it shrinks onto the ones still being drawn.
    const sharedBefore = full.layout.stations.find((s) => s.id === 'shared');
    const sharedAfter = hidden.layout.stations.find((s) => s.id === 'shared');
    expect(sharedBefore?.lineIds).toEqual(['L1', 'L2']);
    expect(sharedAfter?.lineIds).toEqual(['L2']);
    expect(hidden.layout.bounds).toEqual(full.layout.bounds);
  });

  it('re-routes the geometry when asked to lay out only some lines', () => {
    const cityData = twoModeCity();
    const projected = renderHook(() =>
      useSchematicNetwork({ cityData, hiddenModes: ['Bus'] }),
    ).result.current;
    const relaid = renderHook(() =>
      useSchematicNetwork({
        cityData,
        hiddenModes: [],
        relayoutLineIds: ['L2'],
      }),
    ).result.current;

    // Both draw the same single line, but only one of them re-derived the
    // network: a projection keeps the bus network's framing, a relayout fits
    // the tram on its own, so the geometry is genuinely different.
    expect(projected.visibleLineCount).toBe(1);
    expect(relaid.visibleLineCount).toBe(1);
    expect(relaid.relayoutLineIds).toEqual(['L2']);
    expect(relaid.layout.segments.every((s) => s.lineId === 'L2')).toBe(true);
    expect(relaid.layout.segments[0].points).not.toEqual(
      projected.layout.segments[0].points,
    );
  });

  it('separates an empty city from one its own filters emptied', () => {
    const noTransit = modelOf(makeCityData({ transitLines: [] }));
    expect(noTransit.hasDrawableNetwork).toBe(false);
    expect(noTransit.isFilteredEmpty).toBe(false);

    const allHidden = modelOf(twoModeCity(), ['Bus', 'Tram']);
    expect(allHidden.hasDrawableNetwork).toBe(true);
    expect(allHidden.isFilteredEmpty).toBe(true);
    expect(allHidden.visibleLineCount).toBe(0);
    expect(allHidden.hasVisibleStations).toBe(false);
    // The controls stay: the state has to be recoverable.
    expect(allHidden.availableModes).toEqual(['Bus', 'Tram']);
  });

  it('describes a blank name as missing instead of falling back to the id', () => {
    const base = twoModeCity();
    const model = modelOf(
      makeCityData({
        ...base,
        transitLines: base.transitLines.map((line) =>
          line.id === 'L1' ? { ...line, name: '   ' } : line,
        ),
      }),
    );
    const bus = model.legend.find((group) => group.mode === 'Bus');
    expect(bus?.lines[0]?.name).toBeNull();
    expect(bus?.lines[0]?.lineId).toBe('L1');
  });

  it('keeps Unknown drawn and out of the switches', () => {
    const base = twoModeCity();
    const model = modelOf(
      makeCityData({
        ...base,
        transitLines: base.transitLines.map((line) =>
          line.id === 'L2' ? { ...line, mode: 'Unknown' as const } : line,
        ),
      }),
      // Even asked to hide it, `Unknown` has no control and stays visible.
      ['Bus', 'Unknown'],
    );
    expect(model.availableModes).toEqual(['Bus']);
    expect(model.legend.map((group) => group.mode)).toEqual(['Unknown']);
    expect(model.visibleLineCount).toBe(1);
  });

  it('lays the network out once, however many times the filter changes', () => {
    // A spy strategy is the only honest witness here: comparing the resulting
    // layout by reference proves nothing, because `filterSchematicLayout`
    // hands back its input when nothing is hidden.
    const cityData = twoModeCity();
    const strategy = vi.fn(geographicSchematicLayout);
    let hiddenModes: TransitMode[] = [];
    const { rerender } = renderHook(() =>
      useSchematicNetwork({ cityData, hiddenModes, strategy }),
    );
    expect(strategy).toHaveBeenCalledTimes(1);

    for (const selection of [['Bus'], [], ['Tram'], ['Bus', 'Tram'], []]) {
      hiddenModes = selection as TransitMode[];
      rerender();
    }
    expect(strategy).toHaveBeenCalledTimes(1);
  });

  it('keeps the layout cached across a trip out of the schematic view', () => {
    const cityData = twoModeCity();
    const strategy = vi.fn(geographicSchematicLayout);
    let enabled = true;
    const { rerender } = renderHook(() =>
      useSchematicNetwork({ cityData, hiddenModes: [], strategy, enabled }),
    );
    expect(strategy).toHaveBeenCalledTimes(1);

    enabled = false;
    rerender();
    enabled = true;
    rerender();
    expect(strategy).toHaveBeenCalledTimes(1);
  });

  it('does not lay anything out for a view that was never opened', () => {
    const strategy = vi.fn(geographicSchematicLayout);
    const { result } = renderHook(() =>
      useSchematicNetwork({
        cityData: twoModeCity(),
        hiddenModes: [],
        strategy,
        enabled: false,
      }),
    );
    expect(strategy).not.toHaveBeenCalled();
    expect(result.current.hasDrawableNetwork).toBe(false);
  });

  it('lays out again for a different city', () => {
    const strategy = vi.fn(geographicSchematicLayout);
    let cityData = twoModeCity();
    const { rerender } = renderHook(() =>
      useSchematicNetwork({ cityData, hiddenModes: [], strategy }),
    );
    cityData = twoModeCity();
    rerender();
    expect(strategy).toHaveBeenCalledTimes(2);
  });

  it('re-projects only when the selection really changed', () => {
    // The caller keeps the selection in a reducer and hands over a fresh array
    // on every render; identity by value is what stops that from being read as
    // a change.
    const cityData = twoModeCity();
    const { result, rerender } = renderHook(
      ({ hiddenModes }: { hiddenModes: TransitMode[] }) =>
        useSchematicNetwork({ cityData, hiddenModes }),
      { initialProps: { hiddenModes: ['Bus'] as TransitMode[] } },
    );
    const first = result.current;

    rerender({ hiddenModes: ['Bus'] });
    expect(result.current).toBe(first);

    rerender({ hiddenModes: ['Tram'] });
    expect(result.current).not.toBe(first);
  });

  it('refuses to have its shared empty selection mutated', () => {
    const empty = modelOf(null);
    expect(() => (empty.hiddenModes as Set<TransitMode>).add('Bus')).toThrow(
      TypeError,
    );
    expect(empty.hiddenModes.size).toBe(0);
    // Still the same singleton for the next consumer.
    expect(modelOf(null).hiddenModes.size).toBe(0);
  });

  it('caches one layout per strategy, so going back costs nothing', () => {
    // Comparing layouts means alternating between them. A single-entry cache
    // would make every return trip re-derive the network *and* re-run a layout
    // that had not changed at all.
    const cityData = twoModeCity();
    const geographic = vi.fn(geographicSchematicLayout);
    const octilinear = vi.fn(octilinearSchematicLayout);
    let strategy = geographic;
    const { rerender } = renderHook(() =>
      useSchematicNetwork({ cityData, hiddenModes: [], strategy }),
    );
    expect(geographic).toHaveBeenCalledTimes(1);

    strategy = octilinear;
    rerender();
    expect(octilinear).toHaveBeenCalledTimes(1);

    // Back and forth: both are already known.
    for (const next of [geographic, octilinear, geographic]) {
      strategy = next;
      rerender();
    }
    expect(geographic).toHaveBeenCalledTimes(1);
    expect(octilinear).toHaveBeenCalledTimes(1);
  });

  it('drops every cached layout when the document changes', () => {
    const strategy = vi.fn(geographicSchematicLayout);
    let cityData = twoModeCity();
    const { rerender } = renderHook(() =>
      useSchematicNetwork({ cityData, hiddenModes: [], strategy }),
    );
    expect(strategy).toHaveBeenCalledTimes(1);

    // A new city is a new network: nothing measured on the old one survives.
    cityData = twoModeCity({ cityName: 'Otra ciudad' });
    rerender();
    expect(strategy).toHaveBeenCalledTimes(2);
  });

  it('keeps each layout cached across a trip out of the schematic view', () => {
    const cityData = twoModeCity();
    const geographic = vi.fn(geographicSchematicLayout);
    const octilinear = vi.fn(octilinearSchematicLayout);
    let strategy = geographic;
    let enabled = true;
    const { rerender } = renderHook(() =>
      useSchematicNetwork({ cityData, hiddenModes: [], strategy, enabled }),
    );
    strategy = octilinear;
    rerender();

    enabled = false;
    rerender();
    enabled = true;
    strategy = geographic;
    rerender();
    strategy = octilinear;
    rerender();
    expect(geographic).toHaveBeenCalledTimes(1);
    expect(octilinear).toHaveBeenCalledTimes(1);
  });
});
