import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
  transitFixture,
} from '@vellum/core/testing';
import { SCHEMATIC_LINE_WIDTH, type TransitMode } from '@vellum/core';
import { cleanup, fireEvent, render, screen } from '../../test-utils';
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
  it('zooms around the pointer, pans, and restores the fitted camera', () => {
    render(
      <SchematicView
        model={modelFor()}
        onBack={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    const svg = screen.getByTestId('schematic-diagram');
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
    } as DOMRect);
    const fitted = svg.getAttribute('viewBox');
    fireEvent.wheel(svg, { clientX: 150, clientY: 50, deltaY: -1 });
    const zoomed = svg.getAttribute('viewBox');
    expect(zoomed).not.toBe(fitted);
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 120, clientY: 50 });
    expect(svg.getAttribute('viewBox')).not.toBe(zoomed);
    fireEvent.pointerUp(svg, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'schematic.fit' }));
    const fit = screen.getByRole('button', { name: 'schematic.fit' });
    expect(fit).toHaveAttribute('title', 'schematic.fit');
    expect(fit).toHaveTextContent('');
    expect(fit.querySelector('svg')).toBeInTheDocument();
    expect(svg.getAttribute('viewBox')).toBe(fitted);
  });

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
    // One closed ring per stop: a capsule across its corridor, or a circle when
    // only one line stops there. Story 4.3b replaced the fixed-radius `circle`.
    expect(container.querySelectorAll('polygon')).toHaveLength(1);
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
    expect(dimmed(container).sort()).toEqual(['polygon', 'polyline']);
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

describe('SchematicView — geometry comes from the layout, not from CSS', () => {
  it("draws strokes in the layout's own units, so slots and width agree", () => {
    // The unit bug Story 4.3b closed: the offsets between two lines of a corridor
    // are viewBox units, and the old stylesheet set the width in *screen pixels*
    // (`vector-effect: non-scaling-stroke`). The two only agree at one window
    // size, so parallel lines overlapped or gapped depending on the window. The
    // width is set from the layout's constant, so it cannot drift again.
    const { container } = render(
      <SchematicView
        model={modelFor()}
        onBack={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    const stroke = container.querySelector(
      '.schematic-view__segments polyline',
    );
    expect(stroke).toHaveAttribute(
      'stroke-width',
      String(SCHEMATIC_LINE_WIDTH),
    );
    expect(stroke?.getAttribute('vector-effect')).toBeNull();
  });

  it('draws each station as the ring the layout computed', () => {
    const model = modelFor();
    const { container } = render(
      <SchematicView
        model={model}
        onBack={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    const polygons = [...container.querySelectorAll('polygon')];
    expect(polygons).toHaveLength(model.layout.stations.length);
    // Point for point the layout's shape: the view draws, it does not decide.
    polygons.forEach((polygon, index) => {
      expect(polygon.getAttribute('points')).toBe(
        model.layout.stations[index].shape
          .map((point) => `${point.x},${point.y}`)
          .join(' '),
      );
      // A fixed radius would have been the same number for every station; this is
      // the capsule geometry, so it has many vertices.
      expect(polygon.getAttribute('points')?.split(' ').length).toBeGreaterThan(
        4,
      );
    });
  });
});

// Story 4.3b, hueco cerrado en revisión: como los trazos se recortan en cada
// nudo, las juntas las puentean los conectores. Borrar entero el grupo de
// conectores dejaba toda la suite verde —los conteos de polyline de este archivo
// usan ciudades sin transiciones y AppSurface acotó su consulta al grupo de
// segmentos— así que un diagrama con todas las juntas abiertas pasaba.
describe('SchematicView — inner connections', () => {
  const junctionCity = transitFixture('simple');

  const modelOf = () => {
    const { result } = renderHook(() =>
      useSchematicNetwork({ cityData: junctionCity, hiddenModes: [] }),
    );
    return result.current;
  };

  it('draws one polyline per connector, with its points and colour', () => {
    const model = modelOf();
    expect(model.layout.connectors.length).toBeGreaterThan(0);
    render(<SchematicView model={model} onBack={() => {}} />);

    const drawn = [
      ...document.querySelectorAll('.schematic-view__connectors polyline'),
    ];
    expect(drawn).toHaveLength(model.layout.connectors.length);
    expect(drawn.map((node) => node.getAttribute('points'))).toEqual(
      model.layout.connectors.map((connector) =>
        connector.points.map((p) => `${p.x},${p.y}`).join(' '),
      ),
    );
    expect(drawn.map((node) => node.getAttribute('stroke'))).toEqual(
      model.layout.connectors.map((connector) => connector.color),
    );
  });

  it('gives the joints the same width as the strokes they join', () => {
    const model = modelOf();
    render(<SchematicView model={model} onBack={() => {}} />);
    const connector = document.querySelector(
      '.schematic-view__connectors polyline',
    );
    // If this fell back to CSS the joint would be a hairline, because 4.3b moved
    // the width out of the stylesheet and into viewBox units.
    expect(connector?.getAttribute('stroke-width')).toBe(
      String(SCHEMATIC_LINE_WIDTH),
    );
  });
});
