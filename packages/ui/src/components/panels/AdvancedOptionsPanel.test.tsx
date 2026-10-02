import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test-utils';
import { AdvancedOptionsPanel } from './AdvancedOptionsPanel';
import type { AdvancedOptionsPanelProps } from './AdvancedOptionsPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function makeProps(
  overrides: Partial<AdvancedOptionsPanelProps> = {},
): AdvancedOptionsPanelProps {
  return {
    showForestCircles: true,
    showForestHeatmap: true,
    onToggleForestCircles: vi.fn(),
    onToggleForestHeatmap: vi.fn(),
    layer: 'transit',
    visibleModes: [],
    onToggleMode: vi.fn(),
    showConfirmedTransfers: true,
    onToggleShowConfirmedTransfers: vi.fn(),
    visibleCategories: [],
    onToggleCategory: vi.fn(),
    colorByCategory: false,
    onToggleColorByCategory: vi.fn(),
    showDistrictsAsMarkers: false,
    onToggleShowDistrictsAsMarkers: vi.fn(),
    showParkAreas: false,
    onToggleShowParkAreas: vi.fn(),
    showContourLines: true,
    onToggleContourLines: vi.fn(),
    showColorRelief: true,
    onToggleColorRelief: vi.fn(),
    showHillshade: true,
    onToggleHillshade: vi.fn(),
    showGrid: false,
    onToggleShowGrid: vi.fn(),
    source: 'vellummap',
    showRailways: true,
    showFlights: false,
    showFerries: true,
    onToggleShowRailways: vi.fn(),
    onToggleShowFlights: vi.fn(),
    onToggleShowFerries: vi.fn(),
    showStreetNames: true,
    onToggleShowStreetNames: vi.fn(),
    ...overrides,
  };
}

describe('AdvancedOptionsPanel — terrain', () => {
  it('renders three switches for contour lines, color relief, and hillshade', () => {
    render(<AdvancedOptionsPanel {...makeProps({ layer: 'terrain' })} />);
    expect(screen.getByText('layerOptionsPanel.showContourLines')).toBeTruthy();
    expect(screen.getByText('layerOptionsPanel.showColorRelief')).toBeTruthy();
    expect(screen.getByText('layerOptionsPanel.showHillshade')).toBeTruthy();
    expect(screen.getAllByRole('switch')).toHaveLength(3);
  });

  it('reflects showContourLines as the first switch checked state', () => {
    render(
      <AdvancedOptionsPanel
        {...makeProps({ layer: 'terrain', showContourLines: false })}
      />,
    );
    const switches = screen.getAllByRole('switch');
    expect(switches[0]).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onToggleContourLines with the flipped value on click', async () => {
    const onToggle = vi.fn();
    render(
      <AdvancedOptionsPanel
        {...makeProps({
          layer: 'terrain',
          showContourLines: true,
          onToggleContourLines: onToggle,
        })}
      />,
    );
    screen.getAllByRole('switch')[0].click();
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

describe('AdvancedOptionsPanel — transit', () => {
  it('lists the tours after public transport, under their own heading', () => {
    render(<AdvancedOptionsPanel {...makeProps({ layer: 'transit' })} />);
    const heading = screen.getByRole('heading', {
      name: 'layerOptionsPanel.tours',
    });
    const trolleybus = screen.getByText('transitModes.Trolleybus');
    const walkingTour = screen.getByText('transitModes.WalkingTour');
    expect(
      trolleybus.compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      heading.compareDocumentPosition(walkingTour) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText('transitModes.SightseeingBus')).toBeTruthy();
    expect(screen.getByText('transitModes.HotAirBalloon')).toBeTruthy();
  });

  it('toggles a tour mode like any other', () => {
    const onToggleMode = vi.fn();
    render(
      <AdvancedOptionsPanel
        {...makeProps({ layer: 'transit', onToggleMode })}
      />,
    );
    screen.getByRole('switch', { name: 'transitModes.SightseeingBus' }).click();
    expect(onToggleMode).toHaveBeenCalledWith('SightseeingBus');
  });
});

describe('AdvancedOptionsPanel — districts', () => {
  it('renders district-name and park-area switches', () => {
    render(<AdvancedOptionsPanel {...makeProps({ layer: 'districts' })} />);
    expect(
      screen.getByText('layerOptionsPanel.showDistrictsAsMarkers'),
    ).toBeTruthy();
    expect(screen.getByText('layerOptionsPanel.showParkAreas')).toBeTruthy();
    expect(
      screen.getByRole('switch', {
        name: 'layerOptionsPanel.showDistrictsAsMarkers',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('switch', { name: 'layerOptionsPanel.showParkAreas' }),
    ).toBeTruthy();
  });

  it('reflects showDistrictsAsMarkers as the switch checked state', () => {
    render(
      <AdvancedOptionsPanel
        {...makeProps({ layer: 'districts', showDistrictsAsMarkers: true })}
      />,
    );
    expect(screen.getAllByRole('switch')[0]).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('calls onToggleShowDistrictsAsMarkers with the flipped value on click', async () => {
    const onToggle = vi.fn();
    render(
      <AdvancedOptionsPanel
        {...makeProps({
          layer: 'districts',
          showDistrictsAsMarkers: false,
          onToggleShowDistrictsAsMarkers: onToggle,
        })}
      />,
    );
    screen.getAllByRole('switch')[0].click();
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('calls onToggleShowParkAreas with the flipped value on click', async () => {
    const onToggle = vi.fn();
    render(
      <AdvancedOptionsPanel
        {...makeProps({
          layer: 'districts',
          showParkAreas: false,
          onToggleShowParkAreas: onToggle,
        })}
      />,
    );
    screen
      .getByRole('switch', { name: 'layerOptionsPanel.showParkAreas' })
      .click();
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe('AdvancedOptionsPanel — roads', () => {
  it('toggles street names off', () => {
    const onToggle = vi.fn();
    render(
      <AdvancedOptionsPanel
        {...makeProps({ layer: 'roads', onToggleShowStreetNames: onToggle })}
      />,
    );
    expect(
      screen.getByText('layerOptionsPanel.showStreetNames'),
    ).toBeInTheDocument();
    screen
      .getByRole('switch', { name: 'layerOptionsPanel.showStreetNames' })
      .click();
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

describe('specialization source gate', () => {
  it('offers an accessible native switch and omits it for CSL', () => {
    const callback = vi.fn();
    const props = makeProps({
      layer: 'districts',
      source: 'vellummap',
      onToggleDistrictsColorBySpecialization: callback,
    });
    const { rerender } = render(<AdvancedOptionsPanel {...props} />);
    screen
      .getByRole('switch', { name: 'districtSpecialization.title' })
      .click();
    expect(callback).toHaveBeenCalledWith(true);
    rerender(<AdvancedOptionsPanel {...props} source="cslmap" />);
    expect(
      screen.queryByRole('switch', { name: 'districtSpecialization.title' }),
    ).toBeNull();
  });
});

describe('road categories', () => {
  it('uses category defaults and accessible switches in native documents', () => {
    const props = makeProps({ layer: 'roads' });
    render(<AdvancedOptionsPanel {...props} />);
    expect(screen.getAllByRole('switch')).toHaveLength(4);
    for (const [key, checked, callback] of [
      ['showRailways', true, props.onToggleShowRailways],
      ['showFlights', false, props.onToggleShowFlights],
      ['showFerries', true, props.onToggleShowFerries],
    ] as const) {
      const toggle = screen.getByRole('switch', {
        name: `layerOptionsPanel.${key}`,
      });
      expect(toggle).toHaveAttribute('aria-checked', String(checked));
      toggle.click();
      expect(callback).toHaveBeenCalledWith(!checked);
    }
  });
  it('only offers railway and ferry categories for CSL documents', () => {
    render(
      <AdvancedOptionsPanel
        {...makeProps({ layer: 'roads', source: 'cslmap' })}
      />,
    );
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(
      screen.queryByRole('switch', { name: 'layerOptionsPanel.showFlights' }),
    ).toBeNull();
    expect(
      screen.queryByRole('switch', {
        name: 'layerOptionsPanel.showStreetNames',
      }),
    ).toBeNull();
  });
});

describe('AdvancedOptionsPanel — forests', () => {
  it.each(['vellummap', 'cslmap'] as const)(
    'offers independent accessible switches for %s',
    (source) => {
      const props = makeProps({ layer: 'forests', source });
      render(<AdvancedOptionsPanel {...props} />);
      const circles = screen.getByRole('switch', {
        name: 'layerOptionsPanel.showForestCircles',
      });
      const heatmap = screen.getByRole('switch', {
        name: 'layerOptionsPanel.showForestHeatmap',
      });
      expect(circles).toHaveAttribute('aria-checked', 'true');
      expect(heatmap).toHaveAttribute('aria-checked', 'true');
      circles.click();
      expect(props.onToggleForestCircles).toHaveBeenCalledWith(false);
      expect(props.onToggleForestHeatmap).not.toHaveBeenCalled();
      heatmap.click();
      expect(props.onToggleForestHeatmap).toHaveBeenCalledWith(false);
    },
  );
  it('explains when both representations are off', () => {
    render(
      <AdvancedOptionsPanel
        {...makeProps({
          layer: 'forests',
          showForestCircles: false,
          showForestHeatmap: false,
        })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'layerOptionsPanel.noVegetation',
    );
  });
});
