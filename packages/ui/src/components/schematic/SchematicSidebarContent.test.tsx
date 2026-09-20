import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';
import type { CityData, TransitMode } from '@vellum/core';
import { cleanup, render, screen } from '../../test-utils';
import { SchematicSidebarContent } from './SchematicSidebarContent';
import {
  EMPTY_SCHEMATIC_MODEL,
  useSchematicNetwork,
} from '../../hooks/use-schematic-network';
import type { SchematicLayoutId } from '../../shell/shell-session';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const node = (id: string, x: number, z: number) => ({
  id,
  position: { x, y: 0, z },
});

function city(overrides: Partial<CityData> = {}): CityData {
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
        stops: [
          { id: 'p1', mode: 'Bus', position: { x: 0, y: 0, z: 0 }, name: 'A' },
        ],
        route: [{ segmentIds: ['s1', 's2'] }],
      }),
      makeTransitLine({
        id: 'L2',
        name: 'Blue line',
        mode: 'Tram',
        color: '#0000ff',
        route: [{ segmentIds: ['s1'] }],
      }),
    ],
    ...overrides,
  });
}

const modelOf = (cityData: CityData, hiddenModes: TransitMode[] = []) =>
  renderHook(() => useSchematicNetwork({ cityData, hiddenModes })).result
    .current;

describe('SchematicSidebarContent', () => {
  it('explains the modes, colours and names of what is drawn', () => {
    const { container } = render(
      <SchematicSidebarContent
        model={modelOf(city())}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    expect(screen.getByTestId('schematic-mode-Bus')).toBeInTheDocument();
    expect(screen.getByTestId('schematic-mode-Tram')).toBeInTheDocument();
    // A mode with no drawable geometry earns no control.
    expect(screen.queryByTestId('schematic-mode-Ferry')).toBeNull();

    expect(screen.getByText('Red line')).toBeInTheDocument();
    expect(screen.getByText('Blue line')).toBeInTheDocument();
    expect(
      container.querySelectorAll('.schematic-panel__line-swatch'),
    ).toHaveLength(2);
    // Internal ids are never text on screen.
    expect(container.textContent).not.toContain('L1');
    expect(container.textContent).not.toContain('L2');
  });

  it('announces the visible count politely and keeps the list quiet', () => {
    const count = screen.queryByTestId('schematic-visible-count');
    expect(count).toBeNull();
    render(
      <SchematicSidebarContent
        model={modelOf(city())}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    expect(screen.getByTestId('schematic-visible-count')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(
      document.querySelectorAll('.schematic-panel__lines[aria-live]'),
    ).toHaveLength(0);
  });

  it('keeps a switched-off mode available and offers the way back', async () => {
    const user = userEvent.setup();
    const onToggleMode = vi.fn();
    const onShowAllModes = vi.fn();
    render(
      <SchematicSidebarContent
        model={modelOf(city(), ['Bus'])}
        onToggleMode={onToggleMode}
        onShowAllModes={onShowAllModes}
      />,
    );
    const bus = screen.getByTestId('schematic-mode-Bus');
    expect(bus).toBeInTheDocument();
    // Focus stays on the switch that was operated, even though its line went.
    bus.focus();
    expect(bus).toHaveFocus();
    await user.click(bus);
    expect(onToggleMode).toHaveBeenCalledWith('Bus');
    expect(bus).toHaveFocus();

    // The legend now describes only what is left.
    expect(screen.queryByText('Red line')).toBeNull();
    expect(screen.getByText('Blue line')).toBeInTheDocument();

    await user.click(screen.getByTestId('schematic-show-all-modes'));
    expect(onShowAllModes).toHaveBeenCalledTimes(1);
  });

  it('explains a filter that hides everything, without hiding its own undo', () => {
    render(
      <SchematicSidebarContent
        model={modelOf(city(), ['Bus', 'Tram'])}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    expect(
      screen.getByTestId('schematic-sidebar-filtered'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('schematic-show-all-modes')).toBeInTheDocument();
    expect(screen.getByTestId('schematic-visible-count')).toHaveTextContent(
      'schematicSidebar.visibleLines',
    );
  });

  it('offers no switches and no false recovery when there are no routes', () => {
    render(
      <SchematicSidebarContent
        model={EMPTY_SCHEMATIC_MODEL}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    expect(screen.getByTestId('schematic-no-routes')).toBeInTheDocument();
    expect(screen.queryByTestId('schematic-show-all-modes')).toBeNull();
    expect(screen.queryByTestId('schematic-mode-Bus')).toBeNull();
    expect(screen.queryByTestId('schematic-visible-count')).toBeNull();
  });

  it('labels the Unknown group and gives it no control', () => {
    const base = city();
    const model = modelOf(
      makeCityData({
        ...base,
        transitLines: base.transitLines.map((line) =>
          line.id === 'L2' ? { ...line, mode: 'Unknown' as const } : line,
        ),
      }),
    );
    render(
      <SchematicSidebarContent
        model={model}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    // `transitModes.Unknown` is blank everywhere; the schematic names it.
    expect(
      screen.getByText('schematicSidebar.unknownMode'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('schematic-mode-Unknown')).toBeNull();
    expect(screen.getByText('Blue line')).toBeInTheDocument();
  });

  it('describes a blank line name in words rather than showing its id', () => {
    const base = city();
    const model = modelOf(
      makeCityData({
        ...base,
        transitLines: base.transitLines.map((line) =>
          line.id === 'L1' ? { ...line, name: '  ' } : line,
        ),
      }),
    );
    render(
      <SchematicSidebarContent
        model={model}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    expect(
      screen.getByText('schematicSidebar.unnamedLine'),
    ).toBeInTheDocument();
  });

  it('shows the stop key only while station symbols are on screen', () => {
    const { rerender } = render(
      <SchematicSidebarContent
        model={modelOf(city())}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    expect(screen.getByText('schematicSidebar.stop')).toBeInTheDocument();
    rerender(
      <SchematicSidebarContent
        model={modelOf(city(), ['Bus', 'Tram'])}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    expect(screen.queryByText('schematicSidebar.stop')).toBeNull();
  });
});

describe('SchematicSidebarContent — layout selector (Story 4.3)', () => {
  const renderSelector = (
    layoutId: SchematicLayoutId = 'geographic',
    onSetLayout = vi.fn(),
  ) => {
    render(
      <SchematicSidebarContent
        model={modelOf(city())}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
        layoutId={layoutId}
        onSetLayout={onSetLayout}
      />,
    );
    return onSetLayout;
  };

  it('offers exactly one selected geometry, as a radiogroup', () => {
    renderSelector();
    const group = screen.getByRole('radiogroup', {
      name: 'schematicSidebar.layout',
    });
    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(3);
    expect(group).toContainElement(options[0]);
    // Exclusivity is in the accessibility tree, not only in the drawing.
    expect(
      options.filter((o) => o.getAttribute('aria-checked') === 'true'),
    ).toHaveLength(1);
    expect(screen.getByTestId('schematic-layout-geographic')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('marks the layouts that have not been published yet', () => {
    renderSelector();
    for (const id of ['octilinear', 'orthoradial'] as const) {
      expect(screen.getByTestId(`schematic-layout-${id}`)).toHaveTextContent(
        'schematicSidebar.experimental',
      );
    }
    // The default is not experimental, and says so by saying nothing.
    expect(
      screen.getByTestId('schematic-layout-geographic'),
    ).not.toHaveTextContent('schematicSidebar.experimental');
  });

  it('asks for the layout the user clicked', async () => {
    const user = userEvent.setup();
    const onSetLayout = renderSelector();
    await user.click(screen.getByTestId('schematic-layout-octilinear'));
    expect(onSetLayout).toHaveBeenCalledWith('octilinear');
  });

  it('is one tab stop, and the arrows move the selection', async () => {
    const user = userEvent.setup();
    const onSetLayout = renderSelector('octilinear');
    // Roving tab index: only the selected option is reachable by Tab.
    expect(screen.getByTestId('schematic-layout-octilinear')).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByTestId('schematic-layout-geographic')).toHaveAttribute(
      'tabindex',
      '-1',
    );

    screen.getByTestId('schematic-layout-octilinear').focus();
    await user.keyboard('{ArrowDown}');
    expect(onSetLayout).toHaveBeenLastCalledWith('orthoradial');
    await user.keyboard('{ArrowUp}');
    expect(onSetLayout).toHaveBeenLastCalledWith('geographic');
    // Wrapping is what a radiogroup does, so the last option is never a trap.
    onSetLayout.mockClear();
    cleanup();
    renderSelector('orthoradial', onSetLayout);
    screen.getByTestId('schematic-layout-orthoradial').focus();
    await user.keyboard('{ArrowRight}');
    expect(onSetLayout).toHaveBeenLastCalledWith('geographic');
  });

  it('jumps to the first and last geometry with Home and End', async () => {
    const user = userEvent.setup();
    const onSetLayout = renderSelector('octilinear');
    screen.getByTestId('schematic-layout-octilinear').focus();
    await user.keyboard('{End}');
    expect(onSetLayout).toHaveBeenLastCalledWith('orthoradial');
    await user.keyboard('{Home}');
    // Home is the way back to the published geometry without counting arrows.
    expect(onSetLayout).toHaveBeenLastCalledWith('geographic');
  });

  it('activates the focused geometry with Space and with Enter', async () => {
    const user = userEvent.setup();
    const onSetLayout = renderSelector();
    screen.getByTestId('schematic-layout-orthoradial').focus();
    await user.keyboard(' ');
    expect(onSetLayout).toHaveBeenLastCalledWith('orthoradial');
    onSetLayout.mockClear();
    screen.getByTestId('schematic-layout-octilinear').focus();
    await user.keyboard('{Enter}');
    expect(onSetLayout).toHaveBeenLastCalledWith('octilinear');
  });

  it('is not offered when there is no diagram to change', () => {
    render(
      <SchematicSidebarContent
        model={EMPTY_SCHEMATIC_MODEL}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
        layoutId="geographic"
        onSetLayout={() => {}}
      />,
    );
    // A city with no routes has no geometry: a geometry control there would
    // promise a change that cannot happen.
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByTestId('schematic-no-routes')).toBeInTheDocument();
  });

  it('stays out of the way when no caller wires it', () => {
    render(
      <SchematicSidebarContent
        model={modelOf(city())}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
