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
    ...overrides,
  };
}

describe('AdvancedOptionsPanel — districts', () => {
  it('renders a single switch labeled showDistrictNamesOnMap', () => {
    render(<AdvancedOptionsPanel {...makeProps({ layer: 'districts' })} />);
    expect(
      screen.getByText('layerOptionsPanel.showDistrictNamesOnMap'),
    ).toBeTruthy();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('reflects showDistrictNamesOnMap as the switch checked state', () => {
    render(
      <AdvancedOptionsPanel
        {...makeProps({ layer: 'districts', showDistrictNamesOnMap: true })}
      />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
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
    screen.getByRole('switch').click();
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('renders nothing for layers without advanced options', () => {
    const { container } = render(
      <AdvancedOptionsPanel {...makeProps({ layer: 'roads' })} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
