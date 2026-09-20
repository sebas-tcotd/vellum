import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';
import type { TransitMode } from '@vellum/core';
import { cleanup, render, screen } from '../../test-utils';
import { SchematicView } from './SchematicView';
import {
  EMPTY_SCHEMATIC_MODEL,
  useSchematicNetwork,
} from '../../hooks/use-schematic-network';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const transitCity = makeCityData({
  roadNodes: [
    { id: 'a', position: { x: 0, y: 0, z: 0 } },
    { id: 'b', position: { x: 100, y: 0, z: 0 } },
  ],
  roadSegments: [
    makeRoadSegment({ id: 's1', startNodeId: 'a', endNodeId: 'b' }),
  ],
  transitLines: [
    makeTransitLine({
      id: 'L1',
      color: '#ff0000',
      stops: [
        { id: 'p1', mode: 'Bus', position: { x: 0, y: 0, z: 0 }, name: 'A' },
      ],
      route: [{ segmentIds: ['s1'] }],
    }),
  ],
});

const modelFor = (hiddenModes: TransitMode[] = []) =>
  renderHook(() => useSchematicNetwork({ cityData: transitCity, hiddenModes }))
    .result.current;

describe('SchematicView', () => {
  it('draws one stroke per line segment and one symbol per stop', () => {
    const { container } = render(
      <SchematicView
        model={modelFor()}
        onBack={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    expect(
      screen.getByRole('region', { name: 'schematic.region' }),
    ).toBeInTheDocument();
    const lines = container.querySelectorAll('polyline');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute('stroke', '#ff0000');
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(screen.getByTestId('schematic-summary')).toHaveTextContent(
      'schematic.summary',
    );
    // No internal ids or names are rendered as text.
    expect(container.textContent).not.toContain('L1');
    expect(container.textContent).not.toContain('p1');
  });

  it('shows an empty state with a way back when there is no transit', async () => {
    const onBack = vi.fn();
    const errors = vi.spyOn(console, 'error');
    render(
      <SchematicView
        model={EMPTY_SCHEMATIC_MODEL}
        onBack={onBack}
        onShowAllModes={() => {}}
      />,
    );
    expect(screen.getByText('schematic.emptyTitle')).toBeInTheDocument();
    screen.getByRole('button', { name: 'schematic.back' }).click();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it('distinguishes a filtered-empty network and offers the way back to it', () => {
    const onShowAllModes = vi.fn();
    const { container } = render(
      <SchematicView
        model={modelFor(['Bus'])}
        onBack={() => {}}
        onShowAllModes={onShowAllModes}
      />,
    );
    // Not the "no transit" state: the network exists, the filter is hiding it.
    expect(screen.queryByTestId('schematic-empty')).toBeNull();
    expect(screen.getByTestId('schematic-filtered-empty')).toBeInTheDocument();
    expect(container.querySelectorAll('polyline')).toHaveLength(0);
    screen.getByRole('button', { name: 'schematic.showAllModes' }).click();
    expect(onShowAllModes).toHaveBeenCalledTimes(1);
  });
});

describe('SchematicView — hovering a legend row', () => {
  const twoLineCity = makeCityData({
    roadNodes: [
      { id: 'a', position: { x: 0, y: 0, z: 0 } },
      { id: 'b', position: { x: 100, y: 0, z: 0 } },
      { id: 'c', position: { x: 100, y: 0, z: 100 } },
    ],
    roadSegments: [
      makeRoadSegment({ id: 's1', startNodeId: 'a', endNodeId: 'b' }),
      makeRoadSegment({ id: 's2', startNodeId: 'b', endNodeId: 'c' }),
    ],
    transitLines: [
      makeTransitLine({
        id: 'L1',
        color: '#ff0000',
        // `shared` is called at by both lines; `only1` by L1 alone.
        stops: [
          {
            id: 'shared',
            mode: 'Bus',
            position: { x: 100, y: 0, z: 0 },
            name: 'Shared',
          },
          {
            id: 'only1',
            mode: 'Bus',
            position: { x: 0, y: 0, z: 0 },
            name: 'Only 1',
          },
        ],
        route: [{ segmentIds: ['s1'] }],
      }),
      makeTransitLine({
        id: 'L2',
        color: '#0000ff',
        stops: [
          {
            id: 'shared',
            mode: 'Tram',
            position: { x: 100, y: 0, z: 0 },
            name: 'Shared',
          },
        ],
        route: [{ segmentIds: ['s2'] }],
      }),
    ],
  });

  const twoLineModel = () =>
    renderHook(() =>
      useSchematicNetwork({ cityData: twoLineCity, hiddenModes: [] }),
    ).result.current;

  const dimmed = (container: HTMLElement) =>
    [...container.querySelectorAll('.schematic-view__dimmed')].map((el) =>
      el.tagName.toLowerCase(),
    );

  it('holds every other stroke back, and keeps the stops the line calls at', () => {
    const { container } = render(
      <SchematicView
        model={twoLineModel()}
        onBack={() => {}}
        onShowAllModes={() => {}}
        hoveredLineId="L1"
      />,
    );

    const strokes = [...container.querySelectorAll('polyline')];
    expect(strokes).toHaveLength(2);
    const hovered = strokes.find((s) => s.dataset.lineId === 'L1');
    const other = strokes.find((s) => s.dataset.lineId === 'L2');
    expect(hovered).not.toHaveClass('schematic-view__dimmed');
    expect(other).toHaveClass('schematic-view__dimmed');

    // A stop L1 shares with L2 stays bright: it is on the highlighted line.
    // Exactly one thing recedes — L2's stroke — because both stops belong to L1.
    expect(dimmed(container)).toEqual(['polyline']);
  });

  it('recedes a stop the highlighted line does not call at', () => {
    const { container } = render(
      <SchematicView
        model={twoLineModel()}
        onBack={() => {}}
        onShowAllModes={() => {}}
        hoveredLineId="L2"
      />,
    );

    // L2 calls only at `shared`, so `only1` recedes along with L1's stroke.
    expect(dimmed(container).sort()).toEqual(['circle', 'polyline']);
  });

  it('dims nothing when the pointer is not on a legend row', () => {
    const { container } = render(
      <SchematicView
        model={twoLineModel()}
        onBack={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    expect(dimmed(container)).toEqual([]);
  });
});
