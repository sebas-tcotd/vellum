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
