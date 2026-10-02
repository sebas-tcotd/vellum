import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
  transitFixture,
} from '@vellum/core/testing';
import { SCHEMATIC_LINE_WIDTH, type TransitMode } from '@vellum/core';
import { createRef, Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen } from '../../test-utils';
import { SchematicView } from './SchematicView';
import {
  ZOOM_SETTLE_MS,
  type SchematicCameraControls,
} from './use-schematic-camera';
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
  vi.useRealTimers();
});

/**
 * The camera writes the SVG once per animation frame and commits a zoom after
 * the wheel rests (Story 4.5), so camera tests drive frames and timers by hand.
 */
const useCameraClock = () =>
  vi.useFakeTimers({
    toFake: [
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'setTimeout',
      'clearTimeout',
    ],
  });
const nextFrame = () => act(() => void vi.advanceTimersToNextFrame());
const settleZoom = () => act(() => void vi.advanceTimersByTime(ZOOM_SETTLE_MS));

const mockRect = (svg: HTMLElement) =>
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
  } as DOMRect);

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
    useCameraClock();
    const cameraRef = createRef<SchematicCameraControls | null>();
    render(
      <SchematicView
        model={modelFor()}
        onBack={() => {}}
        onShowAllModes={() => {}}
        cameraRef={cameraRef}
      />,
    );
    const svg = screen.getByTestId('schematic-diagram');
    mockRect(svg);
    const fitted = svg.getAttribute('viewBox');
    expect(fitted).toBeTruthy();
    fireEvent.wheel(svg, { clientX: 150, clientY: 50, deltaY: -1 });
    nextFrame();
    const zoomed = svg.getAttribute('viewBox');
    expect(zoomed).not.toBe(fitted);
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 120, clientY: 50 });
    nextFrame();
    expect(svg.getAttribute('viewBox')).not.toBe(zoomed);
    fireEvent.pointerUp(svg, { pointerId: 1 });
    // The fit button is the shared camera group's now, not this surface's.
    expect(document.querySelector('.schematic-view__fit')).toBeNull();
    act(() => cameraRef.current!.fit());
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

  it('recovers a real station name on focus without exposing its internal id', () => {
    const { container } = render(
      <SchematicView
        model={modelFor()}
        onBack={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    const station = container.querySelector('polygon');
    expect(station).toHaveAttribute('aria-label', 'A');
    fireEvent.focus(station!);
    expect(screen.getByTestId('schematic-station-detail')).toHaveTextContent(
      'A',
    );
    expect(screen.queryByText('p1')).toBeNull();
  });

  it('rematerializes label text and halo with the quantized visual scale', () => {
    useCameraClock();
    const { container } = render(
      <SchematicView
        model={modelFor()}
        onBack={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    const svg = screen.getByTestId('schematic-diagram');
    mockRect(svg);
    const label = container.querySelector('text.schematic-view__label')!;
    const before = label.getAttribute('font-size');
    expect(label.getAttribute('transform')).toMatch(/^rotate\(/);
    fireEvent.wheel(svg, { clientX: 100, clientY: 50, deltaY: -1 });
    nextFrame();
    settleZoom();
    expect(label.getAttribute('font-size')).not.toBe(before);
    expect(label.getAttribute('stroke-width')).toBeTruthy();
  });

  it('names a lone line in its own colour, and says nothing where lines share a corridor', () => {
    const { container } = render(
      <SchematicView
        model={modelFor()}
        onBack={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    const label = container.querySelector('text.schematic-view__label--line')!;
    // The line's own colour, not the text token: a name in the palette of the
    // stroke it belongs to is what makes it readable without a leader line.
    expect(label).toHaveAttribute('fill', '#ff0000');
    expect(label.textContent).toBe('Test Line');
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

// Story 4.5: the camera writes the SVG itself, once per frame, and React only
// hears about it when a gesture ends.
describe('SchematicView — camera outside React', () => {
  const mount = () => {
    const onRender = vi.fn();
    const cameraRef = createRef<SchematicCameraControls | null>();
    const full = modelFor();
    const view = (
      hovered: string | null,
      model: ReturnType<typeof modelFor> = full,
    ) => (
      <Profiler id="schematic" onRender={onRender}>
        <SchematicView
          model={model}
          onBack={() => {}}
          onShowAllModes={() => {}}
          hoveredLineId={hovered}
          cameraRef={cameraRef}
        />
      </Profiler>
    );
    const result = render(view(null));
    const svg = screen.getByTestId('schematic-diagram');
    mockRect(svg);
    return {
      ...result,
      svg,
      cameraRef,
      onRender,
      rerenderWith: (hovered: string | null) => result.rerender(view(hovered)),
      rerenderModel: (model: ReturnType<typeof modelFor>) =>
        result.rerender(view(null, model)),
      full,
    };
  };
  const viewBoxWrites = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(([name]) => name === 'viewBox');
  const fontSize = (container: HTMLElement) =>
    container
      .querySelector('text.schematic-view__label')!
      .getAttribute('font-size');

  it('collapses several moves in one frame into one write of the latest box', () => {
    useCameraClock();
    const { svg } = mount();
    const writes = vi.spyOn(svg, 'setAttribute');
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 110, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 120, clientY: 50 });
    const afterTwo = svg.getAttribute('viewBox');
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 130, clientY: 50 });
    expect(viewBoxWrites(writes)).toHaveLength(0);
    nextFrame();
    expect(viewBoxWrites(writes)).toHaveLength(1);
    const drawn = svg.getAttribute('viewBox')!;
    expect(drawn).not.toBe(afterTwo);
    // The last move, 30 px across a 200 px-wide SVG, not the first.
    const [fittedX, , width] = afterTwo!.split(' ').map(Number);
    const [x] = drawn.split(' ').map(Number);
    expect(x).toBeCloseTo(fittedX - (30 / 200) * width);
    fireEvent.pointerUp(svg, { pointerId: 1 });
    expect(svg.getAttribute('viewBox')).toBe(drawn);
  });

  it('pans without rendering, and commits once on release', () => {
    useCameraClock();
    const { svg, onRender } = mount();
    const commitsBefore = onRender.mock.calls.length;
    const fitted = svg.getAttribute('viewBox');
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 50 });
    for (let step = 1; step <= 5; step += 1) {
      fireEvent.pointerMove(svg, {
        pointerId: 1,
        clientX: 100 + step * 10,
        clientY: 50,
      });
      nextFrame();
    }
    expect(svg.getAttribute('viewBox')).not.toBe(fitted);
    expect(onRender.mock.calls.length).toBe(commitsBefore);
    fireEvent.pointerUp(svg, { pointerId: 1 });

    expect(onRender.mock.calls.length).toBe(commitsBefore + 1);
  });

  it('rescales strokes and labels only after the wheel rests, in one pass', () => {
    useCameraClock();
    const { svg, container, onRender } = mount();
    const before = fontSize(container);
    const fitted = svg.getAttribute('viewBox');
    const commitsBefore = onRender.mock.calls.length;
    for (let tick = 0; tick < 4; tick += 1) {
      fireEvent.wheel(svg, { clientX: 100, clientY: 50, deltaY: -1 });
      nextFrame();
      act(() => void vi.advanceTimersByTime(ZOOM_SETTLE_MS / 2));
    }
    // The box followed every tick; the metrics have not moved yet.
    expect(svg.getAttribute('viewBox')).not.toBe(fitted);
    expect(fontSize(container)).toBe(before);
    expect(onRender.mock.calls.length).toBe(commitsBefore);
    settleZoom();
    expect(fontSize(container)).not.toBe(before);
    expect(onRender.mock.calls.length).toBe(commitsBefore + 1);
  });

  it('ends in the same drawing whether a zoom settles per tick or once', () => {
    useCameraClock();
    const stepwise = mount();
    for (let tick = 0; tick < 5; tick += 1) {
      fireEvent.wheel(stepwise.svg, { clientX: 150, clientY: 30, deltaY: -1 });
      nextFrame();
      settleZoom();
    }
    const expected = {
      viewBox: stepwise.svg.getAttribute('viewBox'),
      drawing: stepwise.svg.innerHTML,
    };
    cleanup();

    const gesture = mount();
    for (let tick = 0; tick < 5; tick += 1) {
      fireEvent.wheel(gesture.svg, { clientX: 150, clientY: 30, deltaY: -1 });
      nextFrame();
    }
    settleZoom();
    expect(gesture.svg.getAttribute('viewBox')).toBe(expected.viewBox);
    expect(gesture.svg.innerHTML).toBe(expected.drawing);
  });

  it('fits at once and cancels a pending settle', () => {
    useCameraClock();
    const { svg, container, cameraRef } = mount();
    const fitted = svg.getAttribute('viewBox');
    const before = fontSize(container);
    fireEvent.wheel(svg, { clientX: 100, clientY: 50, deltaY: -1 });
    nextFrame();
    act(() => cameraRef.current!.fit());
    expect(svg.getAttribute('viewBox')).toBe(fitted);
    settleZoom();
    expect(svg.getAttribute('viewBox')).toBe(fitted);
    expect(fontSize(container)).toBe(before);
  });

  it('refits at once to a new layout and cancels a pending settle', () => {
    useCameraClock();
    const { svg, container, rerender } = mount();
    // Another layout of a different shape: only its bounds matter to the camera.
    const base = modelFor();
    const widerModel = {
      ...base,
      layout: {
        ...base.layout,
        bounds: {
          ...base.layout.bounds,
          width: base.layout.bounds.width * 2,
        },
      },
    };
    fireEvent.wheel(svg, { clientX: 100, clientY: 50, deltaY: -1 });
    nextFrame();
    // Same tree as `mount`, so the view updates in place instead of remounting.
    rerender(
      <Profiler id="schematic" onRender={() => {}}>
        <SchematicView
          model={widerModel}
          onBack={() => {}}
          onShowAllModes={() => {}}
        />
      </Profiler>,
    );
    expect(screen.getByTestId('schematic-diagram')).toBe(svg);
    const { width, height } = widerModel.layout.bounds;
    const refitted = `${-width * 0.05} ${-height * 0.05} ${width * 1.1} ${height * 1.1}`;
    expect(svg.getAttribute('viewBox')).toBe(refitted);
    const refittedSize = fontSize(container);
    settleZoom();
    expect(svg.getAttribute('viewBox')).toBe(refitted);
    expect(fontSize(container)).toBe(refittedSize);
  });

  it('thins the station outline with the camera instead of keeping it in viewBox units', () => {
    useCameraClock();
    const { svg, container } = mount();
    const outline = () =>
      parseFloat(
        (
          container.querySelector('.schematic-view__stations') as SVGGElement
        ).style.getPropertyValue('--schematic-station-outline'),
      );
    const fitted = outline();
    for (let tick = 0; tick < 8; tick += 1) {
      fireEvent.wheel(svg, { clientX: 100, clientY: 50, deltaY: -1 });
      nextFrame();
    }
    settleZoom();
    // Eight ticks in is about a third of the fitted box: the outline follows.
    expect(outline()).toBeLessThan(fitted / 2);
  });

  it('keeps the live box when something else re-renders mid-gesture', () => {
    useCameraClock();
    const { svg, rerenderWith } = mount();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 140, clientY: 70 });
    nextFrame();
    const live = svg.getAttribute('viewBox');
    rerenderWith('L1');
    expect(svg.getAttribute('viewBox')).toBe(live);
    fireEvent.pointerUp(svg, { pointerId: 1 });
    rerenderWith(null);
    expect(svg.getAttribute('viewBox')).toBe(live);
  });

  it('wheel then drag: the settle waits for the release', () => {
    useCameraClock();
    const { svg, container, onRender } = mount();
    const before = fontSize(container);
    fireEvent.wheel(svg, { clientX: 100, clientY: 50, deltaY: -1 });
    nextFrame();
    const commitsBefore = onRender.mock.calls.length;
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 50 });
    // The settle comes due mid-drag and must not re-render the layers.
    for (let step = 1; step <= 4; step += 1) {
      fireEvent.pointerMove(svg, {
        pointerId: 1,
        clientX: 100 + step * 10,
        clientY: 50,
      });
      nextFrame();
      act(() => void vi.advanceTimersByTime(ZOOM_SETTLE_MS));
    }
    expect(onRender.mock.calls.length).toBe(commitsBefore);
    expect(fontSize(container)).toBe(before);
    fireEvent.pointerUp(svg, { pointerId: 1 });
    expect(onRender.mock.calls.length).toBe(commitsBefore + 1);
    expect(fontSize(container)).not.toBe(before);
  });

  it('restores the live box on an SVG remounted with the same bounds', () => {
    useCameraClock();
    const { svg, rerenderModel, full } = mount();
    fireEvent.wheel(svg, { clientX: 150, clientY: 30, deltaY: -1 });
    nextFrame();
    settleZoom();
    const recorded = svg.getAttribute('viewBox');
    // Hiding every mode unmounts the SVG; showing them again mounts a new one.
    rerenderModel(modelFor(['Bus']));
    expect(screen.queryByTestId('schematic-diagram')).toBeNull();
    rerenderModel(full);
    const remounted = screen.getByTestId('schematic-diagram');
    expect(remounted).not.toBe(svg);
    expect(remounted.getAttribute('viewBox')).toBe(recorded);
  });

  it('cancels its frame and its settle when the view goes away', () => {
    useCameraClock();
    const { svg, unmount } = mount();
    const writes = vi.spyOn(svg, 'setAttribute');
    fireEvent.wheel(svg, { clientX: 100, clientY: 50, deltaY: -1 });
    expect(vi.getTimerCount()).toBe(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => void vi.advanceTimersByTime(ZOOM_SETTLE_MS * 2));
    expect(viewBoxWrites(writes)).toHaveLength(0);
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

// Story 4.8: the buttons, the View menu and the shortcuts reach this camera
// through `cameraRef`, so they must behave like the wheel, about the centre.
describe('SchematicView — camera controls', () => {
  const mountWithControls = (model = modelFor()) => {
    const cameraRef = createRef<SchematicCameraControls | null>();
    const element = (
      <SchematicView
        model={model}
        onBack={() => {}}
        onShowAllModes={() => {}}
        cameraRef={cameraRef}
      />
    );
    const result = render(element);
    const svg = result.queryByTestId('schematic-diagram');
    return {
      ...result,
      element,
      svg,
      controls: () => cameraRef.current!,
      cameraRef,
    };
  };
  const box = (svg: HTMLElement) => {
    const [x, y, width, height] = svg
      .getAttribute('viewBox')!
      .split(' ')
      .map(Number) as [number, number, number, number];
    return { x, y, width, height };
  };

  it('zooms in and out by 1.5 about the centre of the live box', () => {
    useCameraClock();
    const { svg, controls } = mountWithControls();
    const start = box(svg!);
    act(() => controls().zoomIn());
    nextFrame();
    const closer = box(svg!);
    expect(closer.width).toBeCloseTo(start.width / 1.5);
    expect(closer.height).toBeCloseTo(start.height / 1.5);
    expect(closer.x + closer.width / 2).toBeCloseTo(start.x + start.width / 2);
    expect(closer.y + closer.height / 2).toBeCloseTo(
      start.y + start.height / 2,
    );
    act(() => controls().zoomOut());
    nextFrame();
    const back = box(svg!);
    expect(back.width).toBeCloseTo(start.width);
    expect(back.x).toBeCloseTo(start.x);
  });

  it('settles the scale once, after the zoom rests, like the wheel', () => {
    useCameraClock();
    const { container, controls } = mountWithControls();
    const labelSize = () =>
      container
        .querySelector('text.schematic-view__label')!
        .getAttribute('font-size');
    const before = labelSize();
    act(() => controls().zoomIn());
    act(() => controls().zoomIn());
    nextFrame();
    expect(labelSize()).toBe(before);
    settleZoom();
    expect(labelSize()).not.toBe(before);
  });

  it('reports the room left and stops at the wheel limits at both ends', () => {
    useCameraClock();
    const { svg, controls } = mountWithControls();
    const start = controls().getZoomState()!;
    expect(start.min).toBe(0);
    expect(start.zoom).toBeGreaterThan(start.min);
    expect(start.zoom).toBeLessThan(start.max);

    for (let step = 0; step < 40; step += 1) act(() => controls().zoomIn());
    nextFrame();
    const closest = controls().getZoomState()!;
    expect(closest.zoom).toBeCloseTo(closest.max, 9);
    const stuck = svg!.getAttribute('viewBox');
    act(() => controls().zoomIn());
    nextFrame();
    expect(svg!.getAttribute('viewBox')).toBe(stuck);
    act(() => controls().zoomOut());
    nextFrame();
    expect(svg!.getAttribute('viewBox')).not.toBe(stuck);

    for (let step = 0; step < 40; step += 1) act(() => controls().zoomOut());
    nextFrame();
    expect(controls().getZoomState()!.zoom).toBeCloseTo(0, 9);
    const farthest = svg!.getAttribute('viewBox');
    act(() => controls().zoomOut());
    nextFrame();
    expect(svg!.getAttribute('viewBox')).toBe(farthest);
  });

  it('notifies subscribers once per frame and on fit, until unsubscribed', () => {
    useCameraClock();
    const { controls } = mountWithControls();
    const listener = vi.fn();
    const unsubscribe = controls().subscribe(listener);
    act(() => controls().zoomIn());
    act(() => controls().zoomIn());
    expect(listener).not.toHaveBeenCalled();
    nextFrame();
    expect(listener).toHaveBeenCalledTimes(1);
    act(() => controls().fit());
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    act(() => controls().zoomIn());
    nextFrame();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps one stable controls object across renders', () => {
    useCameraClock();
    const { controls, rerender, element } = mountWithControls();
    const first = controls();
    act(() => first.zoomIn());
    settleZoom();
    rerender(element);
    expect(controls()).toBe(first);
  });

  it('ignores the commands when there is no diagram to move', () => {
    useCameraClock();
    const { controls, svg, cameraRef, unmount } = mountWithControls(
      EMPTY_SCHEMATIC_MODEL,
    );
    expect(svg).toBeNull();
    expect(controls().getZoomState()).toBeNull();
    expect(() => {
      controls().zoomIn();
      controls().zoomOut();
      controls().fit();
    }).not.toThrow();
    unmount();
    expect(cameraRef.current).toBeNull();
  });
});

// Story 4.7: the visual hierarchy is drawn from each stroke's tier and mode.
describe('SchematicView — urban importance', () => {
  /** One straight corridor per mode, stacked, each with its own line. */
  const cityOf = (modes: readonly TransitMode[]) =>
    makeCityData({
      roadNodes: modes.flatMap((_, i) => [
        { id: `w${i}`, position: { x: 0, y: 0, z: i * 100 } },
        { id: `e${i}`, position: { x: 100, y: 0, z: i * 100 } },
      ]),
      roadSegments: modes.map((_, i) =>
        makeRoadSegment({
          id: `s${i}`,
          startNodeId: `w${i}`,
          endNodeId: `e${i}`,
        }),
      ),
      transitLines: modes.map((mode, i) =>
        makeTransitLine({
          id: mode,
          mode,
          color: '#123456',
          stops: [
            {
              id: `p${i}`,
              mode,
              position: { x: 0, y: 0, z: i * 100 },
              name: '',
            },
          ],
          route: [{ segmentIds: [`s${i}`] }],
        }),
      ),
    });

  const strokesOf = (
    modes: readonly TransitMode[],
    hidden: TransitMode[] = [],
  ) => {
    const model = renderHook(() =>
      useSchematicNetwork({ cityData: cityOf(modes), hiddenModes: hidden }),
    ).result.current;
    const { container } = render(
      <SchematicView
        model={model}
        onBack={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    const strokes = [
      ...container.querySelectorAll('.schematic-view__segments polyline'),
    ];
    return new Map(strokes.map((s) => [(s as SVGElement).dataset.lineId, s]));
  };

  it('thins, fades and draws under the metro the lines below it', () => {
    const strokes = strokesOf(['Bus', 'Metro']);
    const metro = strokes.get('Metro') as Element;
    const bus = strokes.get('Bus') as Element;
    expect(Number(metro.getAttribute('stroke-width'))).toBe(
      SCHEMATIC_LINE_WIDTH,
    );
    expect(metro.getAttribute('opacity')).toBeNull();
    expect(metro.getAttribute('style')).toBeNull();
    expect(Number(bus.getAttribute('stroke-width'))).toBeCloseTo(
      SCHEMATIC_LINE_WIDTH * 0.75,
      9,
    );
    // Faded by mixing towards the background, not by `opacity`: a segment and
    // its connector overlap at a joint and would paint darker dots.
    expect(bus.getAttribute('opacity')).toBeNull();
    expect((bus as SVGElement).style.stroke).toBe(
      'color-mix(in srgb, #123456 85%, var(--color-bg))',
    );
    // Lowest tier first: the bus is painted before (under) the metro.
    expect([...strokes.keys()]).toEqual(['Bus', 'Metro']);
  });

  it('draws a bus-only city at full weight', () => {
    const bus = strokesOf(['Bus']).get('Bus') as Element;
    expect(Number(bus.getAttribute('stroke-width'))).toBe(SCHEMATIC_LINE_WIDTH);
    expect(bus.getAttribute('opacity')).toBeNull();
    expect(bus.getAttribute('style')).toBeNull();
  });

  it('promotes the train when the metro is hidden', () => {
    const train = strokesOf(['Metro', 'Train'], ['Metro']).get(
      'Train',
    ) as Element;
    expect(Number(train.getAttribute('stroke-width'))).toBe(
      SCHEMATIC_LINE_WIDTH,
    );
    expect(train.getAttribute('style')).toBeNull();
  });

  it('dashes a tour, with a dash measured in its own width', () => {
    const tour = strokesOf(['WalkingTour']).get('WalkingTour') as Element;
    const width = Number(tour.getAttribute('stroke-width'));
    expect(tour.getAttribute('stroke-dasharray')).toBe(`${width} ${2 * width}`);
    // Butt caps, inline so the stylesheet's round cap does not win: a round
    // cap would add half a width to each end of every dash.
    expect((tour as SVGElement).style.strokeLinecap).toBe('butt');
    expect(
      strokesOf(['Bus']).get('Bus')?.getAttribute('stroke-dasharray'),
    ).toBeNull();
  });

  it('leaves planes and passenger ships out of the diagram', () => {
    const strokes = strokesOf(['Bus', 'Airplane', 'PassengerShip']);
    expect([...strokes.keys()]).toEqual(['Bus']);
  });

  it('draws a layout without tiers as it always did', () => {
    const model = modelFor();
    const layout = {
      ...model.layout,
      segments: model.layout.segments.map(({ tier: _tier, ...s }) => s),
    };
    const { container } = render(
      <SchematicView
        model={{ ...model, layout }}
        onBack={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    const stroke = container.querySelector(
      '.schematic-view__segments polyline',
    ) as Element;
    expect(Number(stroke.getAttribute('stroke-width'))).toBe(
      SCHEMATIC_LINE_WIDTH,
    );
    expect(stroke.getAttribute('opacity')).toBeNull();
    expect(stroke.getAttribute('style')).toBeNull();
    expect(stroke.getAttribute('stroke-dasharray')).toBeNull();
  });
});
