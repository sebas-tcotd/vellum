import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';

afterEach(() => vi.unstubAllGlobals());

describe('schematic layout worker', () => {
  it('derives, lays out, and returns line metadata through the real protocol', async () => {
    const emitted: unknown[] = [];
    const fakeScope = {
      postMessage: (event: unknown) => emitted.push(event),
      onmessage: null as ((event: MessageEvent) => void) | null,
    };
    vi.stubGlobal('self', fakeScope);
    await import('./schematic-layout-worker');
    const cityData = makeCityData({
      roadNodes: [
        { id: 'a', position: { x: 0, y: 0, z: 0 } },
        { id: 'b', position: { x: 100, y: 0, z: 0 } },
      ],
      roadSegments: [
        makeRoadSegment({ id: 's', startNodeId: 'a', endNodeId: 'b' }),
      ],
      transitLines: [
        makeTransitLine({
          id: 'L1',
          name: 'Red',
          mode: 'Bus',
          color: '#f00',
          stops: [
            { id: 'p', name: 'A', mode: 'Bus', position: { x: 0, y: 0, z: 0 } },
          ],
          route: [{ segmentIds: ['s'] }],
        }),
      ],
    });
    fakeScope.onmessage?.({
      data: {
        type: 'layout',
        version: 1,
        requestId: 'r1',
        cityData,
        layout: 'geographic',
      },
    } as MessageEvent);
    const types = emitted.map((event) => (event as { type: string }).type);
    expect(types).toEqual(['progress', 'progress', 'complete']);
    expect(emitted[0]).toMatchObject({ phase: 'deriving' });
    expect(emitted[1]).toMatchObject({ phase: 'laying-out' });
    expect(emitted[2]).toMatchObject({
      requestId: 'r1',
      lines: [{ lineId: 'L1', name: 'Red', mode: 'Bus', color: '#f00' }],
    });
  });
});
