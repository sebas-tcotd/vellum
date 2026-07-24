import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test-utils';
import { MapTooltip } from './MapTooltip';
import type { MapTooltipProps } from './MapTooltip';

function makeProps(overrides: Partial<MapTooltipProps> = {}): MapTooltipProps {
  return {
    info: null,
    containerWidth: 800,
    containerHeight: 600,
    ...overrides,
  };
}

describe('MapTooltip', () => {
  it('renders null when info is null', () => {
    const { container } = render(<MapTooltip {...makeProps()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders all lines with name and color dot when info is provided', () => {
    render(
      <MapTooltip
        {...makeProps({
          info: {
            kind: 'transit',
            screenX: 100,
            screenY: 100,
            lines: [
              { name: 'Línea de autobús 1', color: '#FF6600', mode: 'Bus' },
              { name: 'Tram Line 3', color: '#00AAFF', mode: 'Tram' },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText('Línea de autobús 1')).toBeTruthy();
    expect(screen.getByText('Tram Line 3')).toBeTruthy();

    const colorDots = document.querySelectorAll('span[aria-hidden="true"]');
    expect(colorDots).toHaveLength(2);
    expect((colorDots[0] as HTMLElement).style.backgroundColor).toBe(
      'rgb(255, 102, 0)',
    );
    expect((colorDots[1] as HTMLElement).style.backgroundColor).toBe(
      'rgb(0, 170, 255)',
    );
  });

  it('does not render any stop name (stops have no name in .cslmap)', () => {
    render(
      <MapTooltip
        {...makeProps({
          info: {
            kind: 'transit',
            screenX: 50,
            screenY: 50,
            lines: [{ name: 'Bus 1', color: '#FF0000', mode: 'Bus' }],
          },
        })}
      />,
    );
    // Only line name is rendered, no separate "stop name" heading
    expect(screen.queryByText(/stop/i)).toBeNull();
    expect(screen.getByText('Bus 1')).toBeTruthy();
  });

  it('positions to the left when near the right edge', () => {
    // containerWidth=300, screenX=250: 250 + 200 + 12 = 462 > 300 → flip left
    const { container } = render(
      <MapTooltip
        {...makeProps({
          containerWidth: 300,
          containerHeight: 600,
          info: {
            kind: 'transit',
            screenX: 250,
            screenY: 100,
            lines: [{ name: 'Line', color: '#000', mode: 'Bus' }],
          },
        })}
      />,
    );
    const tooltip = container.firstChild as HTMLElement;
    // flipX: left = 250 - 200 - 12 = 38
    expect(tooltip.style.left).toBe('38px');
  });

  it('positions above when near the bottom edge', () => {
    // containerHeight=200, screenY=180: 180 + 60 + 12 = 252 > 200 → flip up
    const { container } = render(
      <MapTooltip
        {...makeProps({
          containerWidth: 800,
          containerHeight: 200,
          info: {
            kind: 'transit',
            screenX: 100,
            screenY: 180,
            lines: [{ name: 'Line', color: '#000', mode: 'Bus' }],
          },
        })}
      />,
    );
    const tooltip = container.firstChild as HTMLElement;
    // flipY: top = 180 - 60 - 12 = 108
    expect(tooltip.style.top).toBe('108px');
  });

  it('renders only the district name when info.kind is "district"', () => {
    render(
      <MapTooltip
        {...makeProps({
          info: {
            kind: 'district',
            screenX: 40,
            screenY: 40,
            name: 'Puerto Viejo',
          },
        })}
      />,
    );
    expect(screen.getByText('Puerto Viejo')).toBeTruthy();
    // No transit-only markup (color dots) leaks into the district variant
    expect(document.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(
      0,
    );
  });

  it('positions to the right and below when not near any edge', () => {
    const { container } = render(
      <MapTooltip
        {...makeProps({
          containerWidth: 800,
          containerHeight: 600,
          info: {
            kind: 'transit',
            screenX: 100,
            screenY: 100,
            lines: [{ name: 'Line', color: '#000', mode: 'Bus' }],
          },
        })}
      />,
    );
    const tooltip = container.firstChild as HTMLElement;
    // no flip: left = 100 + 12 = 112, top = 100 + 12 = 112
    expect(tooltip.style.left).toBe('112px');
    expect(tooltip.style.top).toBe('112px');
  });
});
