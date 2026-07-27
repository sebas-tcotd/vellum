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
    layer: 'transit',
    visibleModes: [],
    onToggleMode: vi.fn(),
    visibleCategories: [],
    onToggleCategory: vi.fn(),
    colorByCategory: false,
    onToggleColorByCategory: vi.fn(),
    showDistrictNamesOnMap: false,
    onToggleShowDistrictNamesOnMap: vi.fn(),
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

describe('AdvancedOptionsPanel — districts', () => {
  it('renders district-name and park-area switches', () => {
    render(<AdvancedOptionsPanel {...makeProps({ layer: 'districts' })} />);
    expect(
      screen.getByText('layerOptionsPanel.showDistrictNamesOnMap'),
    ).toBeTruthy();
    expect(screen.getByText('layerOptionsPanel.showParkAreas')).toBeTruthy();
    expect(
      screen.getByRole('switch', {
        name: 'layerOptionsPanel.showDistrictNamesOnMap',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('switch', { name: 'layerOptionsPanel.showParkAreas' }),
    ).toBeTruthy();
  });

  it('reflects showDistrictNamesOnMap as the switch checked state', () => {
    render(
      <AdvancedOptionsPanel
        {...makeProps({ layer: 'districts', showDistrictNamesOnMap: true })}
      />,
    );
    expect(screen.getAllByRole('switch')[0]).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('calls onToggleShowDistrictNamesOnMap with the flipped value on click', async () => {
    const onToggle = vi.fn();
    render(
      <AdvancedOptionsPanel
        {...makeProps({
          layer: 'districts',
          showDistrictNamesOnMap: false,
          onToggleShowDistrictNamesOnMap: onToggle,
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
    screen.getAllByRole('switch')[1].click();
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('renders nothing for layers without advanced options', () => {
    const { container } = render(
      <AdvancedOptionsPanel {...makeProps({ layer: 'roads' })} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
